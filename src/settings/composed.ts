/**
 * Composes the two independent config stores — device-local calibration
 * (`@/calibration/store`) and account-level gameplay settings (`./store`) —
 * into the single `DichopticSettings` shape the game engines expect. See
 * `@/engine/dichoptic` for why the split exists.
 */
import { loadCalibration } from '@/calibration/store';
import { useCalibration } from '@/calibration/useCalibration';
import { composeDichopticSettings, type DichopticSettings } from '@/engine/dichoptic';
import { loadGameplaySettings } from './store';
import { useGameplaySettings } from './useSettings';

/** Imperative composed read — for non-hook call sites (e.g. GameShell's game-controller setup inside a ref/effect). */
export function loadDichopticSettings(): DichopticSettings {
  return composeDichopticSettings(loadCalibration(), loadGameplaySettings());
}

/** Reactive composed read — re-renders on either a calibration edit or a gameplay-settings change (local or synced). */
export function useDichopticSettings(): DichopticSettings {
  const calibration = useCalibration();
  const gameplay = useGameplaySettings();
  return composeDichopticSettings(calibration, gameplay);
}
