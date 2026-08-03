/**
 * Pure merge functions for cross-device sync. No localStorage/network access here —
 * callers (client.ts, stores) own persistence; this module only combines data.
 *
 * Two distinct merge modes, per the design doc:
 *  - "reconcile" (on pull, for OUR OWN deviceId's entry only): max per counter,
 *    guarding against local data loss without ever going backwards.
 *  - "display" (for the dashboard, own + all cached other devices): sum counters
 *    (each device's contribution is disjoint/additive), max bestScore, union+dedup
 *    sessions. Other devices' entries are never reconciled against local — they're
 *    authoritative for themselves.
 */
import type { ContrastBucket, SessionRecord, StatsData } from '@/stats/store';
import type { DichopticSettings } from '@/engine/dichoptic';

const SESSIONS_DISPLAY_CAP = 200;
export const SESSIONS_PUSH_CAP = 50;

function bucketKey(b: Pick<ContrastBucket, 'cyanPercent' | 'redPercent' | 'variant' | 'cyanEye'>): string {
  return `${b.cyanPercent}|${b.redPercent}|${b.variant}|${b.cyanEye}`;
}

function maxRecord(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(out[k] ?? 0, v);
  }
  return out;
}

function sumRecords(records: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const rec of records) {
    for (const [k, v] of Object.entries(rec)) {
      out[k] = (out[k] ?? 0) + v;
    }
  }
  return out;
}

function mergeContrast(lists: ContrastBucket[][], combine: (values: number[]) => number): ContrastBucket[] {
  const byKey = new Map<string, { meta: Omit<ContrastBucket, 'ms'>; values: number[] }>();
  for (const list of lists) {
    for (const bucket of list) {
      const key = bucketKey(bucket);
      const entry = byKey.get(key);
      if (entry) {
        entry.values.push(bucket.ms);
      } else {
        const { ms: _ms, ...meta } = bucket;
        byKey.set(key, { meta, values: [bucket.ms] });
      }
    }
  }
  return [...byKey.values()].map(({ meta, values }) => ({ ...meta, ms: combine(values) }));
}

function maxOf(values: number[]): number {
  return values.reduce((a, b) => Math.max(a, b), 0);
}

function sumOf(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

function mergeBestScore(records: Record<string, number>[]): Record<string, number> {
  return records.reduce((acc, rec) => maxRecord(acc, rec), {} as Record<string, number>);
}

function mergeSessions(lists: SessionRecord[][], cap: number): SessionRecord[] {
  const byId = new Map<string, SessionRecord>();
  for (const list of lists) {
    for (const session of list) {
      byId.set(session.id, session);
    }
  }
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, cap);
}

export function zeroStats(version: StatsData['version']): StatsData {
  return { version, totalMs: 0, byDay: {}, byGame: {}, contrast: [], sessions: [], bestScore: {} };
}

/**
 * Reconciles OUR OWN device's local stats against what the remote blob last said
 * about us: max per counter, so we never regress even if local storage was
 * partially lost. The result should be written back as the new local canonical
 * stats.
 */
export function reconcileOwnStats(local: StatsData, remoteOwn: StatsData | undefined): StatsData {
  if (!remoteOwn) return local;
  return {
    version: local.version,
    totalMs: Math.max(local.totalMs, remoteOwn.totalMs),
    byDay: maxRecord(local.byDay, remoteOwn.byDay),
    byGame: maxRecord(local.byGame, remoteOwn.byGame),
    contrast: mergeContrast([local.contrast, remoteOwn.contrast], maxOf),
    bestScore: mergeBestScore([local.bestScore, remoteOwn.bestScore]),
    sessions: mergeSessions([local.sessions, remoteOwn.sessions], SESSIONS_DISPLAY_CAP),
  };
}

/**
 * Combines this device's own stats with cached snapshots of other devices for
 * dashboard display: sum of additive counters, max of bestScore, union of sessions.
 */
export function mergeForDisplay(own: StatsData, remoteDevices: Record<string, StatsData>): StatsData {
  const all = [own, ...Object.values(remoteDevices)];
  return {
    version: own.version,
    totalMs: sumOf(all.map((s) => s.totalMs)),
    byDay: sumRecords(all.map((s) => s.byDay)),
    byGame: sumRecords(all.map((s) => s.byGame)),
    contrast: mergeContrast(all.map((s) => s.contrast), sumOf),
    bestScore: mergeBestScore(all.map((s) => s.bestScore)),
    sessions: mergeSessions(all.map((s) => s.sessions), SESSIONS_DISPLAY_CAP),
  };
}

/** Trims a device's own sessions to the push payload budget (50, not the local/display cap of 200). */
export function capSessionsForPush(stats: StatsData): StatsData {
  return { ...stats, sessions: stats.sessions.slice(0, SESSIONS_PUSH_CAP) };
}

export interface SyncedConfig {
  settings: DichopticSettings;
  updatedAt: number;
}

/** Pure last-write-wins: the newer (by updatedAt) config blob wins wholesale. */
export function mergeConfig(local: SyncedConfig, remote: SyncedConfig | undefined): SyncedConfig {
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}
