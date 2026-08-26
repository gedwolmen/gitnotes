// Stub for deleted SyncEngineService module

export type SyncEngineMode = 'api' | 'clone';

export const SyncEngineService = {
  getMode: async (_repoPath: string): Promise<SyncEngineMode> => 'clone',
  setMode: async (_repoPath: string, _mode: SyncEngineMode) => {},
};
