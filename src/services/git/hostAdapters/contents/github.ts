import { GitHubService } from '../../../GitHubService';
import type {
  ContentsAdapter,
  ContentsFileCommit,
  ContentsGetFileOpts,
  ContentsRepoInfo,
  ContentsShaResult,
  ContentsUpdateFileOpts,
} from './types';

/**
 * GitHub Contents adapter.
 *
 * **Phase 1: thin wrapper over the existing `GitHubService`.** The
 * HTTP layer, sha cache, retry logic, and base64 encoding all stay
 * in `GitHubService` — this adapter exists to give `*GitHubSyncService`
 * a host-agnostic seam. The behavior is bit-for-bit identical to
 * calling `GitHubService` directly.
 *
 * The wrap is a translation layer:
 *
 *   `ContentsShaResult`        ↔ `GitHubService.ShaResult`
 *   `ContentsFileCommit`       ← `GitHubService.GitHubFileCommit`
 *   `ContentsRepoInfo`         ← `GitHubService.getRepoPrivacy` return
 *   `ContentsGetFileOpts`       → `GitHubService.TokenOpts`
 *
 * The shape conversion is a single helper each because both result
 * types are structurally compatible. We don't use a class so the
 * adapter is cheap to instantiate and the singleton model is up to
 * the caller (we export a default instance like `GitHubService`
 * does).
 */
function toContentsSha(result: { kind: 'found'; sha: string } | { kind: 'not-found' } | { kind: 'error'; status?: number; message: string }): ContentsShaResult {
  // Structural copy so callers can't accidentally depend on
  // GitHubService.ShaResult (a future adapter might use a different
  // error class internally).
  if (result.kind === 'found') return { kind: 'found', sha: result.sha };
  if (result.kind === 'not-found') return { kind: 'not-found' };
  return { kind: 'error', status: result.status, message: result.message };
}

function toContentsFileCommit(commit: { content?: { sha?: string } | null; commit?: { sha?: string } | null } | null): ContentsFileCommit | null {
  if (!commit) return null;
  return {
    sha: commit.content?.sha ?? '',
    commitSha: commit.commit?.sha ?? '',
  };
}

export class GitHubContentsAdapter implements ContentsAdapter {
  readonly kind = 'github' as const;

  async getUser(): Promise<{ login: string; name: string; email: string } | null> {
    const user = GitHubService.getUser();
    if (!user) return null;
    return { login: user.login, name: user.name, email: user.email };
  }

  async isAuthenticated(): Promise<boolean> {
    return GitHubService.isAuthenticated();
  }

  async getRepoPrivacy(
    owner: string,
    repo: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsRepoInfo> {
    const isPrivate = await GitHubService.getRepoPrivacy(owner, repo, opts);
    return { isPrivate };
  }

  async getFileShaCached(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult> {
    return toContentsSha(await GitHubService.getFileShaCached(owner, repo, path, ref, opts));
  }

  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult> {
    return toContentsSha(await GitHubService.getFileSha(owner, repo, path, ref, opts));
  }

  async getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<string | null> {
    return GitHubService.getFileShaOrNull(owner, repo, path, ref, opts);
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
    opts?: ContentsUpdateFileOpts,
  ): Promise<ContentsFileCommit | null> {
    const result = await GitHubService.updateFile(
      owner,
      repo,
      path,
      content,
      message,
      branch ?? 'main',
      // Preserve the `undefined`-when-empty shape that the
      // original code passed to GitHubService directly. The
      // existing template-github-sync test asserts this exact
      // shape with `toHaveBeenCalledWith` — spreading an
      // empty/undefined object would coerce to `{}` and fail
      // the matcher.
      opts && Object.keys(opts).length > 0 ? { ...opts } : undefined,
    );
    return toContentsFileCommit(result);
  }

  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsFileCommit | null> {
    // GitHubService.deleteFile throws on terminal failure (see #567);
    // we preserve that contract by re-throwing here. Callers that
    // want the legacy null-on-failure shape should wrap in try/catch.
    const result = await GitHubService.deleteFile(
      owner,
      repo,
      path,
      message,
      sha,
      branch ?? 'main',
      opts && Object.keys(opts).length > 0 ? opts : undefined,
    );
    return toContentsFileCommit(result);
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<ContentsFileCommit | null> {
    const result = await GitHubService.uploadBinaryFile(
      owner,
      repo,
      path,
      base64Content,
      message,
      branch ?? 'main',
    );
    return toContentsFileCommit(result);
  }
}

export const githubContentsAdapter = new GitHubContentsAdapter();
