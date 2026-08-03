/**
 * Long-term training statistics, persisted to localStorage.
 *
 * Tracks the two metrics the project cares about:
 *  - training time (total, per-day, per-game) — the adherence metric
 *  - per-eye / contrast exposure over time — therapy progression
 *
 * Time is attributed in small increments tagged with the dichoptic settings
 * active at that moment, so the dashboard can show how contrast was reduced as
 * training progressed.
 */
import type { DichopticSettings, Eye } from '@/engine/dichoptic';
import { opacityToPercent, redEye } from '@/engine/dichoptic';

export const STATS_KEY = 'miojovago.stats.v1';
const STATS_VERSION = 1 as const;

export interface ContrastBucket {
  /** cyan-lens opacity %, red-lens opacity %, difficulty variant, which eye wears cyan. */
  cyanPercent: number;
  redPercent: number;
  variant: string;
  cyanEye: Eye;
  ms: number;
}

export interface SessionRecord {
  id: string;
  game: string;
  startedAt: string; // ISO
  durationMs: number;
  score?: number;
  settings: {
    cyanEye: Eye;
    cyanPercent: number;
    redPercent: number;
    variant: string;
  };
}

export interface StatsData {
  version: typeof STATS_VERSION;
  totalMs: number;
  byDay: Record<string, number>; // YYYY-MM-DD -> ms
  byGame: Record<string, number>; // gameId -> ms
  contrast: ContrastBucket[];
  sessions: SessionRecord[];
  bestScore: Record<string, number>; // gameId -> best score
}

function emptyStats(): StatsData {
  return {
    version: STATS_VERSION,
    totalMs: 0,
    byDay: {},
    byGame: {},
    contrast: [],
    sessions: [],
    bestScore: {},
  };
}

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function load(): StatsData {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return emptyStats();
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    if (parsed.version !== STATS_VERSION) return migrate(parsed);
    return { ...emptyStats(), ...parsed } as StatsData;
  } catch {
    return emptyStats();
  }
}

function migrate(_old: Partial<StatsData>): StatsData {
  // Only v1 exists today; future versions transform here.
  return emptyStats();
}

function save(data: StatsData): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(data));
  } catch {
    // storage full / unavailable — fail silently, stats are non-critical
  }
}

/** Summary of a settings snapshot used for tagging/recording. */
export function summarizeSettings(s: DichopticSettings) {
  return {
    cyanEye: s.cyanEye,
    cyanPercent: opacityToPercent(s.opacity[1]),
    redPercent: opacityToPercent(s.opacity[2]),
    variant: s.variant,
  };
}

type Listener = (data: StatsData) => void;

class StatsStore {
  private data: StatsData = load();
  private listeners = new Set<Listener>();

  get(): StatsData {
    return this.data;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Overwrites the store wholesale — used by the sync module to write back a reconciled/merged result. */
  replace(data: StatsData): void {
    this.data = data;
    this.commit();
  }

  private commit() {
    save(this.data);
    this.listeners.forEach((fn) => fn(this.data));
  }

  /** Adds an increment of training time tagged with the active settings. */
  addTraining(gameId: string, ms: number, settings: DichopticSettings): void {
    if (ms <= 0) return;
    this.data.totalMs += ms;
    const day = todayKey();
    this.data.byDay[day] = (this.data.byDay[day] ?? 0) + ms;
    this.data.byGame[gameId] = (this.data.byGame[gameId] ?? 0) + ms;

    const sum = summarizeSettings(settings);
    const bucket = this.data.contrast.find(
      (b) => b.cyanPercent === sum.cyanPercent && b.redPercent === sum.redPercent && b.variant === sum.variant && b.cyanEye === sum.cyanEye
    );
    if (bucket) {
      bucket.ms += ms;
    } else {
      this.data.contrast.push({ ...sum, ms });
    }
    this.commit();
  }

  recordSession(rec: Omit<SessionRecord, 'id'>): void {
    if (rec.durationMs < 1000) return; // ignore trivial sessions
    const id = `${rec.startedAt}-${Math.round(rec.durationMs)}`;
    this.data.sessions.unshift({ id, ...rec });
    // keep the most recent 200 sessions
    this.data.sessions = this.data.sessions.slice(0, 200);
    this.commit();
  }

  recordScore(gameId: string, score: number): void {
    if (score > (this.data.bestScore[gameId] ?? 0)) {
      this.data.bestScore[gameId] = score;
      this.commit();
    }
  }

  clear(): void {
    this.data = emptyStats();
    this.commit();
  }

  exportJSON(): string {
    return JSON.stringify(this.data, null, 2);
  }
}

export const statsStore = new StatsStore();
export { redEye };
