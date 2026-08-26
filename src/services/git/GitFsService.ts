// Stub for deleted GitFsService module

export const GitFsService = {
  isCloned: async (_params: { repoPath: string }) => false,
  clone: async (_params: { repoPath: string; branch: string; token?: string; onProgress?: (phase: string, loaded: number, total: number | null) => void }) => {},
  removeRepo: async (_params: { repoPath: string }) => {},
  getCurrentBranch: async (_params: { repoPath: string }) => 'main',
  workingTreeUri: (_params: { repoPath: string }) => '',
};
