// Stub for deleted ForegroundSyncService module

export interface ForegroundSyncHealth {
  status: 'idle' | 'syncing' | 'ok' | 'failed' | 'timedout';
  lastFailedAt: number;
  consecutiveFailures: number;
}

export const getForegroundSyncHealth = (): ForegroundSyncHealth => ({
  status: 'idle',
  lastFailedAt: 0,
  consecutiveFailures: 0,
});

export const subscribeForegroundSync = (_callback: () => void) => {
  return () => {};
};
