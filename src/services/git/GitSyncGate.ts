// Stub for deleted GitSyncGate module

export const GitSyncGate = {
  isCycleHeld: () => false,
  isPushActive: (_repoPath?: string) => false,
  markPushActive: (_repoPath: string, _branch: string | undefined) => {},
  clearPushActive: (_repoPath: string, _branch: string | undefined) => {},
};
