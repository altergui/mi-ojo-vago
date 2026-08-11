import { useSyncExternalStore } from 'react';
import { settingsStore } from './store';
import type { GameplaySettings } from '@/engine/dichoptic';

/** Live view of the global gameplay settings; re-renders on any change — a local edit or a cross-device sync merge. */
export function useGameplaySettings(): GameplaySettings {
  return useSyncExternalStore(
    (cb) => settingsStore.subscribe(cb),
    () => settingsStore.getSettings(),
    () => settingsStore.getSettings()
  );
}
