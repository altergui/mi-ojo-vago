import type { DichopticSettings } from '@/engine/dichoptic';
import type { StatsData } from '@/stats/store';

export const SYNC_SCHEMA_VERSION = 2 as const;

/** A device's stats plus enough to show it in a device list: a glanceable label and when it last pushed. */
export interface SyncDeviceEntry {
  /** Raw (length-capped) navigator.userAgent from that device — see deviceId.ts. */
  label: string;
  /** Epoch ms, when this device last successfully pushed — its own "last sync" / "last seen". */
  lastActiveAt: number;
  /** `sessions` trimmed to <=50 (payload budget) — see merge.ts capSessionsForPush. */
  stats: StatsData;
}

/** What's actually stored in KV under a sync code. */
export interface SyncBlob {
  schemaVersion: typeof SYNC_SCHEMA_VERSION;
  config: {
    settings: DichopticSettings;
    updatedAt: number;
  };
  stats: {
    /** Keyed by deviceId. */
    devices: Record<string, SyncDeviceEntry>;
  };
}

const META_KEY = 'miojovago.sync.meta';
const REMOTE_DEVICES_KEY = 'miojovago.sync.remoteDevices';

export interface SyncMeta {
  enabled: boolean;
  code: string | null; // canonical form, e.g. "17-42-742"
  lastSyncedAt: string | null; // ISO
}

function defaultMeta(): SyncMeta {
  return { enabled: false, code: null, lastSyncedAt: null };
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
