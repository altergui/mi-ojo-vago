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
import { loadSettingsEnvelope, saveSettingsEnvelope, saveGameplaySettings } from '@/settings/store';
import { defaultGameplaySettings } from '@/engine/dichoptic';
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
 *
 * `reconcileOwn: false` skips max-merging local stats against the remote copy
 * of this device before pushing — use this right after an intentional local
 * wipe (`statsStore.clear()`), where the normal "never go backwards" merge
 * would otherwise treat the fresh zeroes as data loss and resurrect the old
 * numbers from the not-yet-overwritten remote copy.
 */
export async function syncNow(opts: { reconcileOwn?: boolean } = {}): Promise<void> {
  const meta = snapshot.meta;
  if (!meta.enabled || !meta.secretHash || syncing) return;
  syncing = true;
  try {
    await syncOnce(meta, opts);
  } finally {
    syncing = false;
  }
}

async function syncOnce(meta: SyncMeta, opts: { reconcileOwn?: boolean } = {}): Promise<void> {
  const { reconcileOwn = true } = opts;
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

  // logout/re-login/identity-switch can happen while the pull above is in
  // flight (a 15s poll or debounced sync racing a click on "log out", say).
  // If the identity this call started for is no longer the active one,
  // abandon it here rather than reconciling stats for an identity that's no
  // longer current — that would silently resurrect state a subsequent
  // disconnectSync()/connectSync() call already meant to clear or replace.
  // (Checked again below the push, for the same reason.)
  if (snapshot.meta.secretHash !== meta.secretHash) return;

  const remoteOwnStats = remote?.stats.devices[deviceId]?.stats;
  const reconciledOwnStats = reconcileOwn ? reconcileOwnStats(ownStats, remoteOwnStats) : ownStats;
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
  // Same staleness check as above the pull, re-checked here: the push above
  // is another await this identity could stop being current during (e.g. a
  // logout that raced this call all the way to its last step). Writing
  // `updatedMeta` unconditionally would re-enable a just-logged-out identity.
  if (ok && snapshot.meta.secretHash === meta.secretHash) {
    const updatedMeta = { ...meta, lastSyncedAt: new Date().toISOString() };
    saveSyncMeta(updatedMeta);
    setSnapshot({ meta: updatedMeta });
  }
}

/**
 * Checks whether an identity already has data on the server, WITHOUT
 * creating anything — no local meta is saved, nothing is pushed. Lets the UI
 * ask "log in" vs "register, are you sure?" before committing to either.
 */
export async function checkIdentity(
  identity: { name: string; dob: string }
): Promise<{ ok: true; exists: boolean } | { ok: false; error: 'network' }> {
  const secretHash = await computeSecretHash(identity.name, identity.dob);
  try {
    const exists = (await pullBlob(secretHash)) !== null;
    return { ok: true, exists };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/**
 * Connects this device using a name+DOB identity: derives the secret hash,
 * saves it (plus the literal name/dob for display) to local meta, and syncs.
 * `foundExisting` says whether a blob already existed under this hash — true
 * means this device joined data pushed from elsewhere; false means this is
 * the first device for this identity (a fresh registration). Most callers
 * decide which case they're in with `checkIdentity` *before* calling this,
 * so they can ask the user first rather than creating on a whim.
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
 * Registers a brand-new identity: this is a fresh account, so local stats
 * and gameplay settings (contrast, difficulty, eye assignment) reset to
 * zero/default before anything syncs — otherwise leftover local state from
 * before registering (anonymous play, or whoever used this device/browser
 * last) would get attributed to the new identity. Calibration is
 * deliberately untouched: it's device-bound, not account-bound (see
 * `@/calibration/store`).
 *
 * Both resets are synchronous, so they're guaranteed to land before
 * `connectSync`'s internal `syncNow()` push fires — the very first push for
 * this identity carries the zeroed/default state, not stale leftovers.
 * Callers should only call this once they've confirmed (via `checkIdentity`
 * + explicit user confirmation) that this really is a new registration, not
 * a login to an existing identity — logging in must never reset anything.
 */
export async function registerSync(
  identity: { name: string; dob: string }
): Promise<{ ok: true; foundExisting: boolean } | { ok: false; error: 'network' }> {
  statsStore.clear();
  saveGameplaySettings(defaultGameplaySettings());
  return connectSync(identity);
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

/**
 * Logs out: stops syncing and clears this device's LOCAL stats (so a shared
 * device doesn't keep showing a previous person's numbers to whoever's next)
 * — but deliberately does NOT push that zeroed state anywhere, so the
 * account's real stats stay intact on the server and reappear on the next
 * login. `deviceId`, calibration, and gameplay settings are all untouched:
 * none of those stores are referenced here.
 */
export function disconnectSync(): void {
  statsStore.clear();
  clearSyncLocalState();
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  dirty = false;
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
