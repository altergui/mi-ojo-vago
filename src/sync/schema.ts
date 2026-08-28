import type { GameplaySettings } from '@/engine/dichoptic';
import type { StatsData } from '@/stats/store';

export const SYNC_SCHEMA_VERSION = 4 as const;

/** A device's stats plus enough to show it in a device list: a glanceable label and when it last pushed. */
export interface SyncDeviceEntry {
  /** Raw (length-capped) navigator.userAgent from that device — see deviceId.ts. */
  label: string;
  /** Epoch ms, when this device last successfully pushed — its own "last sync" / "last seen". */
  lastActiveAt: number;
  /** `sessions` trimmed to <=50 (payload budget) — see merge.ts capSessionsForPush. */
  stats: StatsData;
}

/**
 * What's actually stored in KV under a sync key.
 *
 * `config.settings` is deliberately typed as GameplaySettings, not the full
 * DichopticSettings — screen-color calibration is device-local (see
 * `@/calibration/store`) and must never be part of this blob, so it can
 * never sync/overwrite across a person's devices. (Bumped to schemaVersion
 * 4 for `stats.resetAt`: purely documentary, the worker stores blobs opaquely
 * and doesn't branch on this value.)
 */
export interface SyncBlob {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  config: {
    settings: GameplaySettings;
    updatedAt: number;
  };
  stats: {
    /** Keyed by deviceId. */
    devices: Record<string, SyncDeviceEntry>;
    /** Epoch ms of the last account-wide "Clear data"; 0 = never reset. Every device compares this against its own `SyncMeta.lastAppliedResetAt` and self-clears when it's newer. */
    resetAt: number;
  };
}

const META_KEY = 'miojovago.sync.meta';
const REMOTE_DEVICES_KEY = 'miojovago.sync.remoteDevices';

export interface SyncMeta {
  enabled: boolean;
  name: string | null; // as literally typed (original casing/accents) — for display
  dob: string | null; // as literally typed, ISO YYYY-MM-DD — for display
  secretHash: string | null; // hex SHA-256 of normalize(name)+normalize(dob) — the KV key
  lastSyncedAt: string | null; // ISO
  /** Epoch ms of the last account-wide reset this device has already applied locally; 0 = none applied yet. */
  lastAppliedResetAt: number;
}

function defaultMeta(): SyncMeta {
  return { enabled: false, name: null, dob: null, secretHash: null, lastSyncedAt: null, lastAppliedResetAt: 0 };
}

export function loadSyncMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return defaultMeta();
    return { ...defaultMeta(), ...(JSON.parse(raw) as Partial<SyncMeta>) };
  } catch {
    return defaultMeta();
  }
}

export function saveSyncMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // ignore
  }
}

/** Cached last-pulled snapshot of *other* devices' entries, keyed by their deviceId. Never merged into our own counters. */
export function loadRemoteDevices(): Record<string, SyncDeviceEntry> {
  try {
    const raw = localStorage.getItem(REMOTE_DEVICES_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, SyncDeviceEntry>;
  } catch {
    return {};
  }
}

export function saveRemoteDevices(devices: Record<string, SyncDeviceEntry>): void {
  try {
    localStorage.setItem(REMOTE_DEVICES_KEY, JSON.stringify(devices));
  } catch {
    // ignore
  }
}

export function clearSyncLocalState(): void {
  localStorage.removeItem(META_KEY);
  localStorage.removeItem(REMOTE_DEVICES_KEY);
}
