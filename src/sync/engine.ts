/**
 * Orchestrates cross-device sync: ties together local storage (settings, stats,
 * deviceId), the pure merge functions, and the worker client. UI/other stores
 * call the exported functions; they don't touch localStorage or the network
 * directly for sync purposes.
 */
import { getDeviceId, getDeviceLabel } from './deviceId';
import { generateCanonicalCode, isValidCanonicalCode, wordsToCanonical } from './code';
import { pullBlob, pushBlob } from './client';
import {
  clearSyncLocalState,
  loadRemoteDevices,
  loadSyncMeta,
  saveRemoteDevices,
  saveSyncMeta,
  SYNC_SCHEMA_VERSION,
  type SyncBlob,
  type SyncDeviceEntry,
  type SyncMeta,
} from './schema';
import { capSessionsForPush, mergeConfig, reconcileOwnStats } from './merge';
import { loadSettingsEnvelope, saveSettingsEnvelope } from '@/settings/store';
import { statsStore } from '@/stats/store';

export interface SyncSnapshot {
  meta: SyncMeta;
  remoteDevices: Record<string, SyncDeviceEntry>;
}

/** One row for a device-list UI: this device or a cached-remote one. */
export interface DeviceListEntry {
  deviceId: string;
  label: string;
  lastActiveAt: number | null;
  isSelf: boolean;
}

// A single cached snapshot object, replaced (not mutated) on change — required
// so useSyncExternalStore consumers get a stable reference between renders.
let snapshot: SyncSnapshot = { meta: loadSyncMeta(), remoteDevices: loadRemoteDevices() };
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<SyncSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  listeners.forEach((fn) => fn());
}

/** Subscribe to changes in sync meta or the cached remote-devices snapshot (for reactive UI). */
export function subscribeSyncState(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getSyncSnapshot(): SyncSnapshot {
  return snapshot;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3000;
let dirty = false;
// Guards against the statsStore.subscribe trigger below re-scheduling a sync
// in response to syncNow()'s own statsStore.replace() write-back.
let applyingRemote = false;

/** Debounced pull-merge-push. Safe to call often (config changes, session end, etc). */
export function scheduleSync(): void {
  if (!snapshot.meta.enabled || !snapshot.meta.code) return;
  dirty = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/** Runs pull-merge-push immediately, once. */
export async function syncNow(): Promise<void> {
  const meta = snapshot.meta;
  if (!meta.enabled || !meta.code) return;

  const deviceId = getDeviceId();
  const settingsEnvelope = loadSettingsEnvelope();
  const ownStats = statsStore.get();

  let remote: SyncBlob | null = null;
  try {
    remote = await pullBlob(meta.code);
  } catch {
    // Pull failures are silent — we still push our local state below.
  }

  const remoteOwnStats = remote?.stats.devices[deviceId]?.stats;
  const reconciledOwnStats = reconcileOwnStats(ownStats, remoteOwnStats);
  if (reconciledOwnStats !== ownStats) {
    applyingRemote = true;
    statsStore.replace(reconciledOwnStats);
    applyingRemote = false;
  }

  const mergedConfig = mergeConfig(
    { settings: settingsEnvelope.settings, updatedAt: settingsEnvelope.updatedAt },
    remote?.config
  );
  if (mergedConfig.settings !== settingsEnvelope.settings || mergedConfig.updatedAt !== settingsEnvelope.updatedAt) {
    saveSettingsEnvelope({ schemaVersion: settingsEnvelope.schemaVersion, ...mergedConfig });
  }

  const otherDevices: Record<string, SyncDeviceEntry> = {};
  if (remote) {
    for (const [id, entry] of Object.entries(remote.stats.devices)) {
      if (id !== deviceId) otherDevices[id] = entry;
    }
  }
  saveRemoteDevices(otherDevices);
  setSnapshot({ remoteDevices: otherDevices });

  const blob: SyncBlob = {
    schemaVersion: SYNC_SCHEMA_VERSION,
    config: mergedConfig,
    stats: {
      devices: {
        ...otherDevices,
        [deviceId]: { label: getDeviceLabel(), lastActiveAt: Date.now(), stats: capSessionsForPush(reconciledOwnStats) },
      },
    },
  };

  const ok = await pushBlob(meta.code, blob);
  dirty = !ok;
  if (ok) {
    const updatedMeta = { ...meta, lastSyncedAt: new Date().toISOString() };
    saveSyncMeta(updatedMeta);
    setSnapshot({ meta: updatedMeta });
  }
}

/** Enables sync on this device: generates a code (if none yet) and does an initial push. */
export async function enableSync(): Promise<string> {
  const code = snapshot.meta.code ?? generateCanonicalCode();
  const meta: SyncMeta = { enabled: true, code, lastSyncedAt: null };
  saveSyncMeta(meta);
  setSnapshot({ meta });
  await syncNow();
  return code;
}

/** Links this device to an existing code (typed as words, in either language, or already canonical), pulling and merging its data in. */
export async function linkDevice(input: string): Promise<{ ok: true } | { ok: false; error: 'invalid_code' | 'network' }> {
  const canonical = isValidCanonicalCode(input) ? input : wordsToCanonical(input);
  if (!canonical) return { ok: false, error: 'invalid_code' };

  const meta: SyncMeta = { enabled: true, code: canonical, lastSyncedAt: null };
  saveSyncMeta(meta);
  setSnapshot({ meta });
  try {
    await syncNow();
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * All known devices for a device-list UI: this device first, then cached
 * remote ones sorted by most-recently-active. Self shows up even when sync
 * has never successfully completed (lastActiveAt null in that case).
 *
 * Pure function of a snapshot (rather than reading module state directly) so
 * a hook can derive it via useMemo — required for useSyncExternalStore
 * consumers, whose getSnapshot must return a stable/cached reference.
 */
export function deviceListFromSnapshot(snap: SyncSnapshot): DeviceListEntry[] {
  const self: DeviceListEntry = {
    deviceId: getDeviceId(),
    label: getDeviceLabel(),
    lastActiveAt: snap.meta.lastSyncedAt ? new Date(snap.meta.lastSyncedAt).getTime() : null,
    isSelf: true,
  };
  const others = Object.entries(snap.remoteDevices)
    .map(([deviceId, entry]) => ({ deviceId, label: entry.label, lastActiveAt: entry.lastActiveAt, isSelf: false }))
    .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  return [self, ...others];
}

/** deviceId -> label, for attributing sessions to a device in the stats table. Always includes at least this device. */
export function deviceLabelsFromSnapshot(snap: SyncSnapshot): Record<string, string> {
  const labels: Record<string, string> = { [getDeviceId()]: getDeviceLabel() };
  for (const [deviceId, entry] of Object.entries(snap.remoteDevices)) {
    labels[deviceId] = entry.label;
  }
  return labels;
}

/** Stops syncing. Leaves local settings/stats untouched — only clears sync bookkeeping. */
export function disconnectSync(): void {
  clearSyncLocalState();
  setSnapshot({ meta: { enabled: false, code: null, lastSyncedAt: null }, remoteDevices: {} });
}

/** Call once on app startup. If sync was already enabled, kicks off a sync and wires up ongoing triggers. */
export function initSyncOnLoad(): void {
  if (snapshot.meta.enabled && snapshot.meta.code) {
    void syncNow();
  }
  statsStore.subscribe(() => {
    if (!applyingRemote) scheduleSync();
  });
  window.addEventListener('online', () => {
    if (dirty) scheduleSync();
  });
}
