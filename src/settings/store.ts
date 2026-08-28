/**
 * Global GAMEPLAY settings (contrast/opacity, difficulty variant, eye
 * assignment) — the account-level slice of dichoptic config that follows a
 * person across devices as they progress. Persisted to localStorage and
 * shared by every game/exercise — changing it from any one of them applies
 * everywhere, and switching games picks up whatever was last saved.
 *
 * Screen-color CALIBRATION (colorAlternatives/color) is deliberately NOT
 * part of this store — it's device-bound, never synced, and lives in
 * `@/calibration/store` instead. See `GameplaySettings`/`Calibration` in
 * `@/engine/dichoptic`.
 *
 * Stored as a versioned envelope ({ schemaVersion, updatedAt, settings }) so
 * cross-device sync can do last-write-wins on `updatedAt`. Legacy data (this
 * key used to hold the *full* DichopticSettings, calibration fields
 * included, before the split) is migrated into the narrower envelope on
 * first read — any colorAlternatives/color present are simply dropped here
 * (they're picked up independently by `@/calibration/store`'s own migration
 * from this same legacy key).
 *
 * Reactive (subscribe/notify, like stats/store.ts's StatsStore) so a settings
 * change that arrives asynchronously from a cross-device sync merge — not just
 * a local edit — reaches whatever's already mounted (see useGameplaySettings()).
 */
import { defaultGameplaySettings, type GameplaySettings } from '@/engine/dichoptic';

const KEY = 'miojovago.settings.global';
const SCHEMA_VERSION = 1 as const;

export interface SettingsEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  updatedAt: number;
  settings: GameplaySettings;
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
  return { schemaVersion: SCHEMA_VERSION, updatedAt: 0, settings: defaultGameplaySettings() };
}

/**
 * Picks only the gameplay fields out of a parsed blob, dropping any legacy
 * colorAlternatives/color that might be present (a plain object spread would
 * NOT drop them — TS's structural typing doesn't erase properties from the
 * actual runtime object — so each field is named explicitly here).
 */
function pickGameplaySettings(parsed: unknown): GameplaySettings {
  const p = (parsed ?? {}) as Partial<GameplaySettings>;
  const d = defaultGameplaySettings();
  return {
    opacity: p.opacity ?? d.opacity,
    variantAlternatives: p.variantAlternatives ?? d.variantAlternatives,
    variant: p.variant ?? d.variant,
    cyanEye: p.cyanEye ?? d.cyanEye,
    redEyeConfigured: p.redEyeConfigured ?? d.redEyeConfigured,
  };
}

function loadEnvelope(): SettingsEnvelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultEnvelope();
    const parsed = JSON.parse(raw) as unknown;
    if (isEnvelope(parsed)) {
      return { ...defaultEnvelope(), ...parsed, settings: pickGameplaySettings(parsed.settings) };
    }
    // Legacy shape: a bare DichopticSettings blob from before sync existed.
    return { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), settings: pickGameplaySettings(parsed) };
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

  getSettings(): GameplaySettings {
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
  save(settings: GameplaySettings): void {
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

export function loadGameplaySettings(): GameplaySettings {
  return settingsStore.getSettings();
}

export function saveGameplaySettings(settings: GameplaySettings): void {
  settingsStore.save(settings);
}

/** For the sync module: read/write the full envelope, including `updatedAt`. */
export function loadSettingsEnvelope(): SettingsEnvelope {
  return settingsStore.get();
}

export function saveSettingsEnvelope(envelope: SettingsEnvelope): void {
  settingsStore.replace(envelope);
}
