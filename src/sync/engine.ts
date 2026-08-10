/**
 * Orchestrates cross-device sync: ties together local storage (settings, stats,
 * deviceId), the pure merge functions, and the worker client. UI/other stores
 * call the exported functions; they don't touch localStorage or the network
 * directly for sync purposes.
 */
import { getDeviceId, getDeviceLabel } from './deviceId';
import { computeSecretHash } from './identity';
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
const POLL_INTERVAL_MS = 15000;
let dirty = false;
let syncing = false;

/** Debounced pull-merge-push, for sparse/deliberate triggers (a settings change). */
export function scheduleSync(): void {
  if (!snapshot.meta.enabled || !snapshot.meta.secretHash) return;
  dirty = true;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/**
 * Runs pull-merge-push immediately, once. A no-op if sync isn't enabled, or if
 * a sync is already in flight (the 15s poll, a reconnect, and an explicit
 * trigger could otherwise overlap).
 */
export async function syncNow(): Promise<void> {
  const meta = snapshot.meta;
  if (!meta.enabled || !meta.secretHash || syncing) return;
  syncing = true;
  try {
    await syncOnce(meta);
  } finally {
    syncing = false;
  }
}

async function syncOnce(meta: SyncMeta): Promise<void> {
  if (!meta.secretHash) return;
  const deviceId = getDeviceId();
  const settingsEnvelope = loadSettingsEnvelope();
  const ownStats = statsStore.get();

  let remote: SyncBlob | null = null;
  try {
    remote = await pullBlob(meta.secretHash);
  } catch {
    // Pull failures are silent — we still push our local state below.
  }

  const remoteOwnStats = remote?.stats.devices[deviceId]?.stats;
  const reconciledOwnStats = reconcileOwnStats(ownStats, remoteOwnStats);
  if (reconciledOwnStats !== ownStats) {
    statsStore.replace(reconciledOwnStats);
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

  const ok = await pushBlob(meta.secretHash, blob);
  dirty = !ok;
  if (ok) {
    const updatedMeta = { ...meta, lastSyncedAt: new Date().toISOString() };
    saveSyncMeta(updatedMeta);
    setSnapshot({ meta: updatedMeta });
  }
}

/**
 * Connects this device using a name+DOB identity: derives the secret hash,
 * saves it (plus the literal name/dob for display) to local meta, and syncs.
 * `foundExisting` says whether a blob already existed under this hash — true
 * means this device joined data pushed from elsewhere; false means either
 * this is genuinely the first device for this identity, or the name/dob
 * don't match what another device used (the UI surfaces this ambiguity as an
 * informational notice, not an error — there's no way to tell them apart).
 */
export async function connectSync(
  identity: { name: string; dob: string }
): Promise<{ ok: true; foundExisting: boolean } | { ok: false; error: 'network' }> {
  const secretHash = await computeSecretHash(identity.name, identity.dob);
  let foundExisting: boolean;
  try {
    foundExisting = (await pullBlob(secretHash)) !== null;
  } catch {
    return { ok: false, error: 'network' };
  }

  const meta: SyncMeta = { enabled: true, name: identity.name, dob: identity.dob, secretHash, lastSyncedAt: null };
  saveSyncMeta(meta);
  setSnapshot({ meta });
  void syncNow();
  return { ok: true, foundExisting };
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
  setSnapshot({ meta: { enabled: false, name: null, dob: null, secretHash: null, lastSyncedAt: null }, remoteDevices: {} });
}

/**
 * Call once on app startup. Kicks off an initial sync (if already enabled)
 * and wires up ongoing triggers:
 *  - a 15s poll while the tab is visible — the safety net. Training time
 *    accrues into the stats store every second while actively playing, so a
 *    per-change trigger would reset a debounce continuously and never
 *    actually fire during a long session; a plain interval can't lose that
 *    race, and bounds how much progress a crash/disconnect could cost to
 *    well under a minute.
 *  - an immediate sync right when the tab becomes visible again, so coming
 *    back doesn't wait out the rest of the poll interval.
 *  - a retry on reconnect, for a push that failed while offline.
 */
export function initSyncOnLoad(): void {
  if (snapshot.meta.enabled && snapshot.meta.secretHash) {
    void syncNow();
  }

  setInterval(() => {
    if (document.visibilityState === 'visible') void syncNow();
  }, POLL_INTERVAL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void syncNow();
  });

  window.addEventListener('online', () => {
    if (dirty) scheduleSync();
  });
}
