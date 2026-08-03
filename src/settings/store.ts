/**
 * Global dichoptic settings + calibration, persisted to localStorage and
 * shared by every game/exercise — calibrating from any one of them applies
 * everywhere, and switching games picks up whatever was last saved.
 *
 * Stored as a versioned envelope ({ schemaVersion, updatedAt, settings }) so
 * cross-device sync can do last-write-wins on `updatedAt`. Legacy data (a bare
 * DichopticSettings blob, pre-sync) is migrated into the envelope on first read.
 *
 * Reactive (subscribe/notify, like stats/store.ts's StatsStore) so a settings
 * change that arrives asynchronously from a cross-device sync merge — not just
 * a local edit — reaches whatever's already mounted (see useSettings()).
 */
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';

const KEY = 'miojovago.settings.global';
const SCHEMA_VERSION = 1 as const;

export interface SettingsEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: number;
  settings: DichopticSettings;
}

function isEnvelope(value: unknown): value is SettingsEnvelope {
  return !!value && typeof value === 'object' && 'schemaVersion' in value && 'settings' in value;
}

/**
 * `updatedAt: 0` (not `Date.now()`) is deliberate: this represents a device
 * that has never actually configured anything. If it used "now", it would
 * always look newer than a real setting some other device already pushed —
 * a freshly linked device would win the LWW merge against genuine
 * configuration, discarding it. A real edit always bumps updatedAt via
 * SettingsStore.save(), so this only ever loses to actual data.
 */
function defaultEnvelope(): SettingsEnvelope {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: 0, settings: defaultDichopticSettings() };
}

function loadEnvelope(): SettingsEnvelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultEnvelope();
    const parsed = JSON.parse(raw) as unknown;
    if (isEnvelope(parsed)) {
      return { ...defaultEnvelope(), ...parsed, settings: { ...defaultDichopticSettings(), ...parsed.settings } };
    }
    // Legacy shape: a bare DichopticSettings blob from before sync existed.
    return { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), settings: { ...defaultDichopticSettings(), ...(parsed as Partial<DichopticSettings>) } };
  } catch {
    return defaultEnvelope();
  }
}

function persist(envelope: SettingsEnvelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // ignore
  }
}

type Listener = (envelope: SettingsEnvelope) => void;

class SettingsStore {
  private envelope: SettingsEnvelope = loadEnvelope();
  private listeners = new Set<Listener>();

  get(): SettingsEnvelope {
    return this.envelope;
  }

  getSettings(): DichopticSettings {
    return this.envelope.settings;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit() {
    persist(this.envelope);
    this.listeners.forEach((fn) => fn(this.envelope));
  }

  /** A local edit — bumps `updatedAt` to now. */
  save(settings: DichopticSettings): void {
    this.envelope = { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), settings };
    this.commit();
  }

  /** Used by the sync module to write back a merged envelope, preserving whichever `updatedAt` won. */
  replace(envelope: SettingsEnvelope): void {
    this.envelope = envelope;
    this.commit();
  }
}

export const settingsStore = new SettingsStore();

export function loadSettings(): DichopticSettings {
  return settingsStore.getSettings();
}

export function saveSettings(settings: DichopticSettings): void {
  settingsStore.save(settings);
}

/** For the sync module: read/write the full envelope, including `updatedAt`. */
export function loadSettingsEnvelope(): SettingsEnvelope {
  return settingsStore.get();
}

export function saveSettingsEnvelope(envelope: SettingsEnvelope): void {
  settingsStore.replace(envelope);
}
