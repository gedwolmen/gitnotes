// Stub for deleted repoAccessPreflight module

export class RepoAccessPreflightError extends Error {
  canRetry: boolean;

  constructor(message: string, canRetry = false) {
    super(message);
    this.name = 'RepoAccessPreflightError';
    this.canRetry = canRetry;
  }
}

export const checkRepoAccess = async (_repoPath: string): Promise<void> => {
  // Stub - does nothing, no-op
};
