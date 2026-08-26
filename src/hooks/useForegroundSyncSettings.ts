// Stub for deleted useForegroundSyncSettings hook

export type SyncIntervalSeconds = 60 | 120 | 300 | 600 | 1800 | 3600;

export const SYNC_INTERVAL_OPTIONS: { value: SyncIntervalSeconds; label: string }[] = [
  { value: 60, label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
  { value: 600, label: '10 min' },
  { value: 1800, label: '30 min' },
  { value: 3600, label: '1 hour' },
];

export function useForegroundSyncSettings() {
  return {
    syncFrequentlyEnabled: false,
    syncIntervalSeconds: 60 as SyncIntervalSeconds,
    syncPaused: false,
    setSyncPaused: async (_value: boolean) => {},
    setSyncFrequentlyEnabled: async (_value: boolean) => {},
    setSyncIntervalSeconds: async (_value: SyncIntervalSeconds) => {},
  };
}
