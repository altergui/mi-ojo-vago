/**
 * Per-game dichoptic settings + calibration, persisted to localStorage.
 * (The original game persisted similar settings; here it is namespaced by game.)
 */
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';

const KEY_PREFIX = 'miojovago.settings.';

export function loadSettings(gameId: string): DichopticSettings {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + gameId);
    if (!raw) return defaultDichopticSettings();
    const parsed = JSON.parse(raw) as Partial<DichopticSettings>;
    return { ...defaultDichopticSettings(), ...parsed };
  } catch {
    return defaultDichopticSettings();
  }
}

export function saveSettings(gameId: string, settings: DichopticSettings): void {
  try {
    localStorage.setItem(KEY_PREFIX + gameId, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
