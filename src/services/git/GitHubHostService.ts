import {
  GitHubService,
  GitHubServiceStatic,
  GitHubUser,
  GitHubContent,
} from '../GitHubService';
import type {
  GitHostBranch,
  GitHostContent,
  GitHostService,
  GitHostTreeEntry,
  GitHostUser,
} from './GitHost';

interface GitHubBranch {
  name: string;
}

interface GitHubRepoMeta {
  default_branch?: string;
}

interface GitHubTreeEntryRaw {
  path: string;
  type: 'tree' | 'blob' | string;
  sha: string;
  size?: number;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntryRaw[];
}

/**
 * Adapts the existing GitHubService to the GitHostService interface.
 *
 * The adapter is intentionally thin: it only translates types and does
 * not duplicate the heavy lifting (auth, request signing, sha cache,
 * tree walker). All state lives on `GitHubService`.
 */
export class GitHubHostService implements GitHostService {
  readonly provider = 'github' as const;

  async getAuthenticatedUser(): Promise<GitHostUser | null> {
    const user: GitHubUser | null = GitHubService.getUser();
    if (!user) return null;
    return {
      id: user.id,
      login: user.login,
      name: user.name ?? null,
      email: user.email ?? null,
      avatarUrl: user.avatar_url ?? null,
    };
  }

  async getDefaultBranch(owner: string, repo: string): Promise<string | null> {
    try {
      const data = await GitHubServiceStatic.getRepoMeta(owner, repo);
      return data?.default_branch ?? null;
    } catch {
      return null;
    }
  }

  async listBranches(owner: string, repo: string): Promise<GitHostBranch[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}`;
    const [branches, repoMeta] = await Promise.all([
      GitHubServiceStatic.rawGet<GitHubBranch[]>(
        `https://api.github.com/repos/${owner}/${repo}/branches`,
      ),
      GitHubServiceStatic.rawGet<GitHubRepoMeta>(url).catch(() => null),
    ]);
    if (!branches) return [];
    const defaultBranch = repoMeta?.default_branch;
    return branches.map((b: GitHubBranch) => ({
      name: b.name,
      isDefault: defaultBranch ? b.name === defaultBranch : false,
    }));
  }

  async getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHostTreeEntry[]> {
    try {
      // Delegate to GitHubService.getTreeRecursive so the tree walker
      // uses the active auth token (GitHubService.rawGet is
      // unauthenticated and would fail for private repos).
      const tree = await GitHubService.getTreeRecursive(owner, repo, ref);
      if (!Array.isArray(tree)) return [];
      return tree
        .filter((e) => (e.type === 'tree' || e.type === 'blob') && Boolean(e.path))
        .map((e) => ({ path: e.path, type: e.type as 'tree' | 'blob', sha: e.sha, size: e.size }));
    } catch (error) {
      console.warn('[GitHubHostService] getTreeRecursive failed:', error);
      return [];
    }
  }

  async listContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostContent[]> {
    const items: GitHubContent[] = await GitHubService.getRepoContents(
      owner,
      repo,
      path,
      ref,
    );
    return items.map((item) => ({
      name: item.name,
      path: item.path,
      type: item.type,
      size: item.size,
      sha: item.sha,
      downloadUrl: item.download_url ?? null,
    }));
  }

  async getFileText(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    try {
      // Delegate to GitHubService.getFileContent so the read uses the
      // active auth token. rawGet is unauthenticated and would fail
      // for private repos (#733 image uploads rely on this path).
      // getFileContent already returns a decoded string, or null
      // when the path is missing / a directory / unreadable.
      return await GitHubService.getFileContent(owner, repo, path, ref);
    } catch (error) {
      console.warn('[GitHubHostService] getFileText failed:', error);
      return null;
    }
  }
}

export const gitHubHostService = new GitHubHostService();
