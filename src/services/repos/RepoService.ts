export interface ManagedRepo {
  id: string;
  name: string;
  owner: string;
  localPath: string;
  provider: string;
  remoteUrl: string;
  lastSyncedAt: number | null;
  accountId: string;
  path?: string;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

export const RepoService = {
  list: async (): Promise<ManagedRepo[]> => [],
  listRepos: async (): Promise<ManagedRepo[]> => [],
  get: async (_id: string): Promise<ManagedRepo | null> => null,
  refreshLastSynced: async (_id: string): Promise<void> => {},
  addRepo: async (path: string, name?: string, _provider?: string, remoteUrl?: string): Promise<ManagedRepo> => {
    const parts = path.split('/');
    const owner = parts[0] || '';
    const repoName = name || parts[1] || path;
    const repo: ManagedRepo = {
      id: generateId(),
      name: repoName,
      owner,
      localPath: path,
      provider: _provider || 'github',
      remoteUrl: remoteUrl ?? `https://github.com/${path}.git`,
      lastSyncedAt: null,
      accountId: '',
      path,
    };
    return repo;
  },
  removeRepo: async (_id: string): Promise<void> => {},
};
