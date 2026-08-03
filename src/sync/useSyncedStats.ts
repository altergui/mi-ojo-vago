import { useSyncExternalStore } from 'react';
import { statsStore, type StatsData } from '@/stats/store';
import { mergeForDisplay } from './merge';
import { getSyncSnapshot, subscribeSyncState } from './engine';

/**
 * Live stats for display: this device's own stats alone when sync is off, or
 * combined with cached snapshots of other devices when sync is on.
 */
export function useSyncedStats(): StatsData {
  const own = useSyncExternalStore(
    (cb) => statsStore.subscribe(cb),
    () => statsStore.get(),
    () => statsStore.get()
  );
  const { meta, remoteDevices } = useSyncExternalStore(
    (cb) => subscribeSyncState(cb),
    () => getSyncSnapshot(),
    () => getSyncSnapshot()
  );

  if (!meta.enabled) return own;
  const remoteStats = Object.fromEntries(Object.entries(remoteDevices).map(([id, entry]) => [id, entry.stats]));
  return mergeForDisplay(own, remoteStats);
}
