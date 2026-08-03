/**
 * Global dichoptic settings + calibration, persisted to localStorage and
 * shared by every game/exercise — calibrating from any one of them applies
 * everywhere, and switching games picks up whatever was last saved.
 *
 * Stored as a versioned envelope ({ schemaVersion, updatedAt, settings }) so
 * cross-device sync can do last-write-wins on `updatedAt`. Legacy data (a bare
 * DichopticSettings blob, pre-sync) is migrated into the envelope on first read.
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

function defaultEnvelope(): SettingsEnvelope {
  return { schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), settings: defaultDichopticSettings() };
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

function saveEnvelope(envelope: SettingsEnvelope): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(envelope));
  } catch {
    // ignore
  }
}

export function loadSettings(): DichopticSettings {
  return loadEnvelope().settings;
}

export function saveSettings(settings: DichopticSettings): void {
  saveEnvelope({ schemaVersion: SCHEMA_VERSION, updatedAt: Date.now(), settings });
}

/** For the sync module: read/write the full envelope, including `updatedAt`, without bumping it. */
export function loadSettingsEnvelope(): SettingsEnvelope {
  return loadEnvelope();
}

export function saveSettingsEnvelope(envelope: SettingsEnvelope): void {
  saveEnvelope(envelope);
}
