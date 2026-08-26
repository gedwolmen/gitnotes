// Stub for deleted lfs module

export interface LfsObject {
  path: string;
  pointer: {
    oid: string;
    size: number;
  };
}

export const LfsService = {
  listPending: async (_repoPath: string): Promise<LfsObject[]> => [],
  downloadObject: async (_params: { repoPath: string; filePath: string; fileUri: string; accessToken: string }): Promise<void> => {},
};
