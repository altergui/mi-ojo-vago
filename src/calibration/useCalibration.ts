import { useSyncExternalStore } from 'react';
import { calibrationStore } from './store';
import type { Calibration } from '@/engine/dichoptic';

/** Live view of this device's calibration; re-renders on any local edit (never a cross-device sync merge — calibration never syncs). */
export function useCalibration(): Calibration {
  return useSyncExternalStore(
    (cb) => calibrationStore.subscribe(cb),
    () => calibrationStore.getCalibration(),
    () => calibrationStore.getCalibration()
  );
}
