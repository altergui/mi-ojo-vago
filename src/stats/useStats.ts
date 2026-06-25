import { useSyncExternalStore } from 'react';
import { statsStore, type StatsData } from './store';

/** Live view of persisted stats; re-renders on any change. */
export function useStats(): StatsData {
  return useSyncExternalStore(
    (cb) => statsStore.subscribe(cb),
    () => statsStore.get(),
    () => statsStore.get()
  );
}
