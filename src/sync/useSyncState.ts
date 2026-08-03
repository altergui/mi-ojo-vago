import { useSyncExternalStore } from 'react';
import { getSyncSnapshot, subscribeSyncState } from './engine';
import type { SyncMeta } from './schema';

export function useSyncMeta(): SyncMeta {
  return useSyncExternalStore(subscribeSyncState, getSyncSnapshot, getSyncSnapshot).meta;
}
