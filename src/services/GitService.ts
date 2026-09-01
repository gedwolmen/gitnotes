/**
 * Stub for deleted GitService.
 * TODO: Migrate callers to use GitEngine / GitFsService directly.
 */
import type { GitHostProvider } from './git/GitHost';

export interface GitRepository {
  id: string;
  path: string;
  full_name?: string;
  name: string;
  branch?: string;
  provider?: GitHostProvider;
  hostId?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
}

export class GitService {
  static async addRepository(
    path: string,
    name?: string,
    provider?: GitHostProvider,
    hostId?: string,
  ): Promise<GitRepository> {
    throw new Error('GitService stub: not implemented');
  }

  static async getBranches(repo: string): Promise<GitBranch[]> {
    throw new Error('GitService stub: not implemented');
  }

  static async getRepositoryFolders(
    repo: string,
    branch: string,
  ): Promise<{ name: string; path: string; parentPath?: string }[]> {
    throw new Error('GitService stub: not implemented');
  }

  static async clearCache(): Promise<void> {}

  static async invalidateRepoFoldersCache(repoPath: string, branch: string): Promise<void> {}
}
