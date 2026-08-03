import { useSyncExternalStore } from 'react';
import { settingsStore } from './store';
import type { DichopticSettings } from '@/engine/dichoptic';

/** Live view of the global dichoptic settings; re-renders on any change — a local edit or a cross-device sync merge. */
export function useSettings(): DichopticSettings {
  return useSyncExternalStore(
    (cb) => settingsStore.subscribe(cb),
    () => settingsStore.getSettings(),
    () => settingsStore.getSettings()
  );
}
