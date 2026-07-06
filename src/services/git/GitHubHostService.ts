import {
  GitHubService,
  GitHubServiceStatic,
  GitHubUser,
  GitHubContent,
  ShaResult,
} from '../GitHubService';
import type {
  GitHostBranch,
  GitHostContent,
  GitHostService,
  GitHostShaResult,
  GitHostTreeEntry,
  GitHostUser,
  GitHostWriteService,
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
export class GitHubHostService implements GitHostService, GitHostWriteService {
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

  // ── Write operations (GitHostWriteService) ──────────────────────

  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostShaResult> {
    const result: ShaResult = await GitHubService.getFileSha(
      owner,
      repo,
      path,
      ref,
    );
    return result;
  }

  async getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null> {
    return GitHubService.getFileShaOrNull(owner, repo, path, ref);
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    commitMessage: string,
    branch: string,
    knownSha?: string,
  ): Promise<string> {
    const result = await GitHubService.updateFile(
      owner,
      repo,
      path,
      content,
      commitMessage,
      branch,
      { expectExists: !!knownSha },
    );
    if (!result?.content?.sha) {
      throw new Error('GitHub updateFile returned no sha');
    }
    return result.content.sha;
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    commitMessage: string,
    sha: string,
    branch: string,
  ): Promise<void> {
    await GitHubService.deleteFile(
      owner,
      repo,
      path,
      commitMessage,
      sha,
      branch,
    );
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    commitMessage: string,
    branch: string,
  ): Promise<string> {
    const result = await GitHubService.uploadBinaryFile(
      owner,
      repo,
      path,
      base64Content,
      commitMessage,
      branch,
    );
    if (!result) {
      throw new Error('GitHub uploadBinaryFile failed');
    }
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }

  async getRepoPrivacy(
    owner: string,
    repo: string,
  ): Promise<boolean | null> {
    return GitHubService.getRepoPrivacy(owner, repo);
  }
}

export const gitHubHostService = new GitHubHostService();
