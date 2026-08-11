/**
 * Screen-color calibration, persisted to localStorage and bound to *this
 * device only* — never synced, never reset by register/login/logout. See
 * `Calibration` in `@/engine/dichoptic` for why this is split out of the
 * account-level gameplay settings (`@/settings/store`).
 *
 * Migration: before this store existed, calibration lived inside the same
 * blob as gameplay settings, under `miojovago.settings.global`. On first
 * read here, if this store's own key is empty, fall back to extracting
 * colorAlternatives/color out of that legacy key (whichever shape it's in)
 * and write-through to the new key — a one-time, non-destructive migration
 * that doesn't touch or depend on `@/settings/store`'s own migration.
 *
 * Reactive (subscribe/notify), same shape as settings/store.ts's store, so a
 * calibration change reaches whatever's already mounted.
 */
import { defaultCalibration, type Calibration } from '@/engine/dichoptic';

const KEY = 'miojovago.calibration.v1';
const LEGACY_SETTINGS_KEY = 'miojovago.settings.global';
const SCHEMA_VERSION = 1 as const;

export interface CalibrationEnvelope {
  schemaVersion: typeof SCHEMA_VERSION;
  calibration: Calibration;
}

function defaultEnvelope(): CalibrationEnvelope {
  return { schemaVersion: SCHEMA_VERSION, calibration: defaultCalibration() };
}

function isCalibrationEnvelope(value: unknown): value is CalibrationEnvelope {
  return !!value && typeof value === 'object' && 'schemaVersion' in value && 'calibration' in value;
}

/** Best-effort extraction of colorAlternatives/color out of the legacy combined settings key, in either shape it might be in. */
function migrateFromLegacySettings(): Calibration | null {
  try {
    const raw = localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Either shape (envelope-wrapped or a bare pre-envelope blob) nests the
    // fields we want at `settings.*` or directly at the top level.
    const settings = (parsed.settings as Record<string, unknown> | undefined) ?? parsed;
    const colorAlternatives = settings.colorAlternatives as Calibration['colorAlternatives'] | undefined;
    const color = settings.color as Calibration['color'] | undefined;
    if (!colorAlternatives || !color) return null;
    return { colorAlternatives, color };
  } catch {
    return null;
  }
}

function loadEnvelope(): CalibrationEnvelope {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (isCalibrationEnvelope(parsed)) {
        return { ...defaultEnvelope(), ...parsed, calibration: { ...defaultCalibration(), ...parsed.calibration } };
      }
    }
  } catch {
    // fall through to migration/default below
  }

  const migrated = migrateFromLegacySettings();
  const envelope: CalibrationEnvelope = migrated
    ? { schemaVersion: SCHEMA_VERSION, calibration: migrated }
    : defaultEnvelope();
  persist(envelope); // write-through, so subsequent loads skip the legacy key entirely
  return envelope;
}

function persist(envelope: CalibrationEnvelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // ignore
  }
}

type Listener = (envelope: CalibrationEnvelope) => void;

class CalibrationStore {
  private envelope: CalibrationEnvelope = loadEnvelope();
  private listeners = new Set<Listener>();

  get(): CalibrationEnvelope {
    return this.envelope;
  }

  getCalibration(): Calibration {
    return this.envelope.calibration;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private commit() {
    persist(this.envelope);
    this.listeners.forEach((fn) => fn(this.envelope));
  }

  save(calibration: Calibration): void {
    this.envelope = { schemaVersion: SCHEMA_VERSION, calibration };
    this.commit();
  }
}

export const calibrationStore = new CalibrationStore();

export function loadCalibration(): Calibration {
  return calibrationStore.getCalibration();
}

export function saveCalibration(calibration: Calibration): void {
  calibrationStore.save(calibration);
}
