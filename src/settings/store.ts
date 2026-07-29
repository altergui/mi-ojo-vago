/**
 * Global dichoptic settings + calibration, persisted to localStorage and
 * shared by every game/exercise — calibrating from any one of them applies
 * everywhere, and switching games picks up whatever was last saved.
 */
import { defaultDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';

const KEY = 'miojovago.settings.global';

export function loadSettings(): DichopticSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultDichopticSettings();
    const parsed = JSON.parse(raw) as Partial<DichopticSettings>;
    return { ...defaultDichopticSettings(), ...parsed };
  } catch {
    return defaultDichopticSettings();
  }
}

export function saveSettings(settings: DichopticSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}
