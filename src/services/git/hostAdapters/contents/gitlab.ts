import { Buffer } from 'buffer';
import { getActiveGitHostKind } from '../../gitHttp';
import { AuthService } from '../../../AuthService';
import type {
  ContentsAdapter,
  ContentsFileCommit,
  ContentsGetFileOpts,
  ContentsRepoInfo,
  ContentsShaResult,
  ContentsUpdateFileOpts,
} from './types';
import { gitlabAdapter } from '../gitlab';

/**
 * GitLab CE/EE Contents adapter.
 *
 * Implements the `ContentsAdapter` surface against GitLab's
 * Repository Files API (`/api/v4/projects/:id/repository/files/...`).
 * GitLab CE and EE share the same REST surface so a single
 * adapter covers both.
 *
 * # Differences from GitHub / Gitea that the code handles
 *
 * - **Project ID encoding**: GitLab's REST API takes the project
 *   path as a URL-encoded string — `namespace/project` becomes
 *   `namespace%2Fproject`. (Even for nested subgroups:
 *   `group/subgroup/project` becomes `group%2Fsubgroup%2Fproject`.)
 *   The clone-mode adapter uses the same encoding helper.
 *
 * - **Flat response shape**: GitLab's `/repository/files/:path`
 *   returns `{ blob_id, commit_id, file_path, ... }` directly
 *   without the nested `{ content, commit }` wrapper GitHub and
 *   Gitea use. We project those fields to the common
 *   `ContentsFileCommit` shape.
 *
 * - **Branch as query param**: `?ref=<branch>`, like Gitea.
 *
 * - **Create vs Update split**: POST (create) vs PUT (update,
 *   requires the current blob_id as `last_commit_id`). The
 *   adapter looks up the existing sha first and dispatches.
 *
 * - **No binary upload via Repository Files API**: GitLab rejects
 *   non-UTF-8 content. The `uploadBinaryFile` path falls back to
 *   the **Commits API** (`POST /projects/:id/repository/commits`)
 *   with a base64-encoded action that creates-or-updates the
 *   file in a single round-trip. The fallback is the same code
 *   path the GitLab web UI uses for "upload file via web".
 *
 * - **Auth**: `Basic :<token>` (empty username + token password),
 *   matching the GitLab clone adapter's convention. The
 *   `setActiveGitHostKind('gitlab')` call from `GitFsService` /
 *   `LocalGitWriter` puts the right context in place for the
 *   auth helper to read.
 *
 * # Caching
 *
 * In-memory `(owner/repo/path@ref) → blob_id` cache, mirroring
 * the GitHub and Gitea adapters' shape. The cache is invalidated
 * on 409 (sha drifted) so the retry path can refresh.
 *
 * # Known limitations
 *
 * - `getRepoPrivacy` is a known-limitation stub. Same reason as
 *   the Gitea adapter: `ContentsGetFileOpts` doesn't carry a
 *   per-repo `baseUrl`. The call sites that consume
 *   `{ isPrivate: null }` already treat null as "private" with
 *   a safe fallback (see #733). Threading baseUrl through the
 *   contents surface is a phase-3 follow-up.
 *
 * - `uploadBinaryFile` via the Commits API does not support
 *   sha-conflict retry. GitLab's commits endpoint returns 400
 *   if a concurrent commit happened, and the response shape
 *   doesn't carry enough information to refresh + retry the way
 *   the GitHub adapter's 409 path does. We log and return null
 *   on transient failure; the caller (NoteGitHubSyncService)
 *   will surface the error to the user for manual retry.
 */
function apiBaseFor(baseUrl: string): string {
  const root = (baseUrl ?? '').replace(/\/+$/, '');
  if (!root) return '/api/v4';
  return `${root}/api/v4`;
}

/** URL-encode `namespace/project` (or `group/subgroup/project`) the way GitLab's REST API wants it. */
function encodeProjectPath(owner: string, repo: string): string {
  return `${owner}/${repo}`.split('/').map(encodeURIComponent).join('%2F');
}

function pathEncodeSegments(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: number }).status === 404
  );
}

interface GitLabFileResponse {
  file_path?: string;
  blob_id?: string;
  commit_id?: string;
  content_sha256?: string;
  size?: number;
  encoding?: string;
  ref?: string;
}

interface GitLabUserResponse {
  id?: number;
  username?: string;
  name?: string;
  email?: string;
}

interface GitLabRepoResponse {
  visibility?: 'private' | 'internal' | 'public';
  default_branch?: string;
}

interface GitLabCommitResponse {
  id?: string;
  short_id?: string;
}

function toFileCommit(response: { blob_id?: string; commit_id?: string } | null): ContentsFileCommit | null {
  if (!response) return null;
  return {
    sha: response.blob_id ?? '',
    commitSha: response.commit_id ?? '',
  };
}

function authHeaderFor(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    // Match the GitLab clone adapter's Basic auth convention:
    // empty username + PAT password. `getActiveGitHostKind()`
    // confirms we're in gitlab context (defensive — if a caller
    // forgets to set it, we'd be using the wrong host's
    // credentials; throwing here is loud and obvious).
    if (getActiveGitHostKind() !== 'gitlab') {
      throw new Error(
        'GitLabContentsAdapter invoked without active gitlab host context. ' +
          'Call setActiveGitHostKind("gitlab") before this operation.',
      );
    }
    const { username, password } = gitlabAdapter.buildBasicAuth({ token });
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }
  return headers;
}

export class GitLabContentsAdapter implements ContentsAdapter {
  readonly kind = 'gitlab' as const;

  private shaCache = new Map<string, string>();

  private shaCacheKey(owner: string, repo: string, path: string, ref?: string): string {
    return `${owner}/${repo}/${path}@${ref ?? ''}`;
  }

  invalidateShaCache(owner: string, repo: string, path: string, ref?: string): void {
    this.shaCache.delete(this.shaCacheKey(owner, repo, path, ref));
  }

  /** Test seam. */
  __resetShaCacheForTests(): void {
    this.shaCache.clear();
  }

  async getUser(): Promise<{ login: string; name: string; email: string } | null> {
    try {
      const token = await AuthService.getToken();
      if (!token) return null;
      const response = await this.request<GitLabUserResponse>(
        `${apiBaseFor(gitlabAdapter.defaultBaseUrl())}/user`,
        { method: 'GET', token },
      );
      if (!response.username) return null;
      return {
        login: response.username,
        name: response.name ?? response.username,
        email: response.email ?? '',
      };
    } catch (error) {
      // Re-throw defensive errors (e.g. "active gitlab host"
      // thrown by `authHeaderFor` when the caller forgot to
      // call `setActiveGitHostKind('gitlab')`). The caller
      // deserves a loud failure for a wiring bug — silently
      // returning null would mask it. Network and parse errors
      // still collapse to null per the `getUser` contract.
      if (error instanceof Error && error.message.startsWith('GitLabContentsAdapter')) {
        throw error;
      }
      return null;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    const token = await AuthService.getToken();
    return !!token;
  }

  async getRepoPrivacy(
    owner: string,
    repo: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsRepoInfo> {
    // Same baseUrl-plumbing limitation as the Gitea adapter:
    // the call sites consume `{ isPrivate: null }` safely, so we
    // return null on any failure rather than threading baseUrl
    // through the ContentsGetFileOpts surface prematurely.
    try {
      const baseUrl = gitlabAdapter.defaultBaseUrl();
      const url = `${apiBaseFor(baseUrl)}/projects/${encodeProjectPath(owner, repo)}`;
      const response = await this.request<GitLabRepoResponse>(url, {
        method: 'GET',
        token: opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined,
      });
      return {
        isPrivate:
          response.visibility === 'private' || response.visibility === 'internal'
            ? true
            : response.visibility === 'public'
              ? false
              : null,
      };
    } catch (error) {
      // Re-throw defensive errors (e.g. "active gitlab host"
      // thrown by `authHeaderFor`) for the same reason as in
      // `getUser` — silent null would mask a wiring bug.
      if (error instanceof Error && error.message.startsWith('GitLabContentsAdapter')) {
        throw error;
      }
      return { isPrivate: null };
    }
  }

  async getFileShaCached(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult> {
    const key = this.shaCacheKey(owner, repo, path, ref);
    const cached = this.shaCache.get(key);
    if (cached) return { kind: 'found', sha: cached };
    const result = await this.getFileSha(owner, repo, path, ref, opts);
    if (result.kind === 'found') this.shaCache.set(key, result.sha);
    return result;
  }

  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult> {
    const baseUrl = gitlabAdapter.defaultBaseUrl();
    const projectId = encodeProjectPath(owner, repo);
    const encodedPath = pathEncodeSegments(path);
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    const qs = params.toString();
    const url = `${apiBaseFor(baseUrl)}/projects/${projectId}/repository/files/${encodedPath}${qs ? `?${qs}` : ''}`;
    try {
      const response = await this.request<GitLabFileResponse>(url, {
        method: 'GET',
        token: opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined,
      });
      if (response.blob_id) return { kind: 'found', sha: response.blob_id };
      return { kind: 'not-found' };
    } catch (error) {
      if (isNotFound(error)) return { kind: 'not-found' };
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);
      return { kind: 'error', status, message };
    }
  }

  async getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<string | null> {
    const result = await this.getFileSha(owner, repo, path, ref, opts);
    return result.kind === 'found' ? result.sha : null;
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
    const baseUrl = gitlabAdapter.defaultBaseUrl();
    const ref = branch ?? 'main';
    const projectId = encodeProjectPath(owner, repo);
    const encodedPath = pathEncodeSegments(path);
    const token = opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    const url = `${apiBaseFor(baseUrl)}/projects/${projectId}/repository/files/${encodedPath}`;
    const base64Content = await bytesToBase64(content);
    const cacheKey = this.shaCacheKey(owner, repo, path, ref);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let blobId: string | null = this.shaCache.get(cacheKey) ?? null;
        if (!blobId) {
          blobId = await this.getFileShaOrNull(owner, repo, path, ref, opts);
          if (blobId) this.shaCache.set(cacheKey, blobId);
        }

        if (!blobId) {
          if (opts?.expectExists) {
            console.warn(
              `[GitLabContentsAdapter] Remote file deleted, aborting update to prevent resurrection: ${path}`,
            );
            return null;
          }
          // No existing file → POST (create). GitLab returns 400
          // with a "file already exists" body if the file does
          // exist; we treat that as a sha-drift case (refresh +
          // retry) below.
          const created = await this.request<GitLabFileResponse>(url, {
            method: 'POST',
            token,
            body: {
              message,
              content: base64Content,
              branch: ref,
              encoding: 'base64',
            } as Record<string, unknown>,
          });
          const createdSha = created.blob_id;
          if (createdSha) this.shaCache.set(cacheKey, createdSha);
          return toFileCommit(created);
        }

        // Existing file → PUT (update). GitLab returns 400 if the
        // `last_commit_id` doesn't match the current HEAD; we
        // refresh the blob_id from a fresh GET and retry.
        const updated = await this.request<GitLabFileResponse>(url, {
          method: 'PUT',
          token,
          body: {
            message,
            content: base64Content,
            branch: ref,
            encoding: 'base64',
            last_commit_id: blobId,
          } as Record<string, unknown>,
        });
        const newSha = updated.blob_id;
        if (newSha) this.shaCache.set(cacheKey, newSha);
        return toFileCommit(updated);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 400 && attempt < 2) {
          // Sha drift or "file already exists" on create. Refresh
          // and retry. GitLab's 400 here is `{"message": "...sha
          // mismatch..."}` — distinguishing it from validation
          // errors is fragile, so we refresh on any 400 within
          // the retry window.
          this.shaCache.delete(cacheKey);
          continue;
        }
        if (status === 422) {
          // Validation failure (e.g., path conflicts). Match the
          // GitHub / Gitea adapter's synthetic-success contract.
          this.shaCache.delete(cacheKey);
          return { sha: '', commitSha: '' };
        }
        if (attempt === 2) {
          console.warn('[GitLabContentsAdapter] Failed to update file:', error);
          return null;
        }
      }
    }
    return null;
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
    // GitLab's Repository Files API doesn't have a separate
    // DELETE endpoint for files. The "delete" operation goes
    // through the same Commits API as binary uploads — create a
    // commit with a `delete` action.
    return this.commitOperation({
      owner,
      repo,
      path,
      branch: branch ?? 'main',
      message,
      token: opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined,
      sha,
      kind: 'delete',
    });
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<ContentsFileCommit | null> {
    // GitLab's Repository Files API rejects non-UTF-8 content
    // ("invalid encoding" 400). The supported path for binary
    // uploads is the Commits API with a base64-encoded `create`
    // or `update` action — same shape as `updateFile` but always
    // sending the caller's base64 verbatim instead of re-encoding
    // the text content.
    return this.commitOperation({
      owner,
      repo,
      path,
      branch: branch ?? 'main',
      message,
      token: await AuthService.getToken() ?? undefined,
      base64Content,
      kind: 'upsert',
    });
  }

  /**
   * GitLab's Commits API is the unified surface for
   * create / update / delete / upload-binary. The request body
   * is `{ branch, commit_message, actions: [{ action, file_path,
   * content?, encoding?, last_commit_id? }] }`.
   *
   * For delete, the caller passes `sha` as the `last_commit_id`
   * guard (GitLab will 400 if the current HEAD's blob_id doesn't
   * match — same sha-drift semantics as the Repository Files
   * API). For upsert, the caller passes `base64Content` and the
   * adapter looks up the existing blob_id from cache or a fresh
   * GET (404 → create, hit → update).
   */
  private async commitOperation(opts: {
    owner: string;
    repo: string;
    path: string;
    branch: string;
    message: string;
    token: string | undefined;
    sha?: string;
    base64Content?: string;
    kind: 'delete' | 'upsert';
  }): Promise<ContentsFileCommit | null> {
    const baseUrl = gitlabAdapter.defaultBaseUrl();
    const projectId = encodeProjectPath(opts.owner, opts.repo);
    const url = `${apiBaseFor(baseUrl)}/projects/${projectId}/repository/commits`;
    const encodedPath = pathEncodeSegments(opts.path);
    const cacheKey = this.shaCacheKey(opts.owner, opts.repo, opts.path, opts.branch);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let blobId: string | null = opts.sha ?? null;
        if (opts.kind === 'upsert') {
          // Cache-first sha lookup, mirroring `updateFile`. We
          // need the current blob_id for the `update` action's
          // `last_commit_id` guard. On 404 (no existing file) we
          // issue a `create` action.
          blobId = this.shaCache.get(cacheKey) ?? null;
          if (!blobId) {
            blobId = await this.getFileShaOrNull(opts.owner, opts.repo, opts.path, opts.branch);
            if (blobId) this.shaCache.set(cacheKey, blobId);
          }
        }

        const action: Record<string, unknown> = {
          action: opts.kind === 'delete' ? 'delete' : blobId ? 'update' : 'create',
          file_path: opts.path,
        };
        if (opts.kind !== 'delete') {
          action.content = opts.base64Content;
          action.encoding = 'base64';
        }
        if (blobId) action.last_commit_id = blobId;

        const body = {
          branch: opts.branch,
          commit_message: opts.message,
          actions: [action],
        };

        const response = await this.request<GitLabCommitResponse>(url, {
          method: 'POST',
          token: opts.token,
          body: body as Record<string, unknown>,
        });

        // GitLab's commit response is `{ id, short_id, ... }`. The
        // commit_id is `id`. The new blob_id is unknown until
        // the next GET — invalidate the cache so the next read
        // fetches the fresh value.
        this.shaCache.delete(cacheKey);
        if (response.id) {
          return { sha: '', commitSha: response.id };
        }
        return { sha: '', commitSha: '' };
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if ((status === 400 || status === 409) && attempt < 2) {
          // Sha drift or "file already exists". Refresh and retry.
          this.shaCache.delete(cacheKey);
          if (opts.kind === 'upsert') {
            // Look up the fresh blob_id and continue.
            opts.sha = await this.getFileShaOrNull(opts.owner, opts.repo, opts.path, opts.branch) ?? undefined;
          }
          continue;
        }
        if (status === 422) {
          this.shaCache.delete(cacheKey);
          return { sha: '', commitSha: '' };
        }
        if (attempt === 2) {
          console.warn('[GitLabContentsAdapter] commit operation failed:', error);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Small fetch wrapper. Same shape as the Gitea adapter's
   * `request` helper. Throws an Error with a `status` field so
   * the per-method catch blocks can branch on HTTP status.
   */
  private async request<T>(
    url: string,
    opts: { method: 'GET' | 'POST' | 'PUT' | 'DELETE'; token?: string; body?: Record<string, unknown> },
  ): Promise<T> {
    const headers = authHeaderFor(opts.token);
    const init: RequestInit = { method: opts.method, headers };
    if (opts.body) init.body = JSON.stringify(opts.body);

    const response = await fetch(url, init);
    if (!response.ok) {
      const error = new Error(
        `GitLab API ${opts.method} ${url} failed: ${response.status} ${response.statusText}`,
      ) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }
}

async function bytesToBase64(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return Buffer.from(bytes).toString('base64');
}

export const gitlabContentsAdapter = new GitLabContentsAdapter();
