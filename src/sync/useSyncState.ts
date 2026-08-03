import { useMemo, useSyncExternalStore } from 'react';
import { deviceLabelsFromSnapshot, deviceListFromSnapshot, getSyncSnapshot, subscribeSyncState, type DeviceListEntry } from './engine';
import type { SyncMeta } from './schema';

function useSyncSnapshot() {
  return useSyncExternalStore(subscribeSyncState, getSyncSnapshot, getSyncSnapshot);
}

export function useSyncMeta(): SyncMeta {
  return useSyncSnapshot().meta;
}

export function useDeviceList(): DeviceListEntry[] {
  const snapshot = useSyncSnapshot();
  return useMemo(() => deviceListFromSnapshot(snapshot), [snapshot]);
}

/** deviceId -> label, for attributing sessions to a device in the stats table. */
export function useDeviceLabels(): Record<string, string> {
  const snapshot = useSyncSnapshot();
  return useMemo(() => deviceLabelsFromSnapshot(snapshot), [snapshot]);
}
