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

interface GitHubFileResponse {
  content?: string;
  encoding?: string;
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
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(
      ref,
    )}?recursive=1`;
    const data = await GitHubServiceStatic.rawGet<GitHubTreeResponse>(url);
    if (!data?.tree || !Array.isArray(data.tree)) return [];
    return data.tree
      .filter((e: GitHubTreeEntryRaw) => (e.type === 'tree' || e.type === 'blob') && Boolean(e.path))
      .map((e: GitHubTreeEntryRaw) => ({ path: e.path, type: e.type as 'tree' | 'blob', sha: e.sha, size: e.size }));
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
    const data = await GitHubServiceStatic.rawGet<GitHubFileResponse>(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`,
    );
    if (!data?.content) return null;
    try {
      return Buffer.from(data.content, 'base64').toString('utf-8');
    } catch {
      return null;
    }
  }
}

export const gitHubHostService = new GitHubHostService();
