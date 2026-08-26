// Stub for deleted SyncEngineService module
// Git sync is removed - all repos use 'api' mode (no local commits)

export type SyncEngineMode = 'api' | 'clone';

export const SyncEngineService = {
  getMode: async (_repoPath: string): Promise<SyncEngineMode> => 'api',
  setMode: async (_repoPath: string, _mode: SyncEngineMode) => {},
};
