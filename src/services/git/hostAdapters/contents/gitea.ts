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
import { giteaAdapter } from '../gitea';

/**
 * Gitea / Forgejo Contents adapter.
 *
 * Implements the `ContentsAdapter` surface against the Gitea REST
 * API (`/api/v1/...`). Both Gitea and Forgejo speak the same
 * protocol so a single adapter covers both — the user just points
 * `baseUrl` at the right origin and the API path is identical.
 *
 * # Differences from GitHub
 *
 * - **Branch as query param**: `?ref=<branch>` not a request body
 *   field. Gitea has no `branch` key in the create/update body.
 * - **Create vs Update are separate methods**: POST for create,
 *   PUT for update. GitHub's PUT does both with an optional sha.
 *   The `updateFile` adapter method handles the dispatch by
 *   looking up the existing sha first and then choosing POST or
 *   PUT accordingly.
 * - **Auth header**: same Basic auth as clone mode
 *   (`Basic <b64(oauth2:token)>`). The active host context is set
 *   by `GitFsService` / `LocalGitWriter` before any clone / fetch
 *   / push, so reading it here is consistent with `ensureToken`.
 *
 * # Caching
 *
 * The `getFileShaCached` variant maintains an in-memory
 * `(owner/repo/path@ref) → sha` cache for the duration of the
 * JS bundle. The GitHub adapter delegates to `GitHubService` for
 * this; we re-implement it locally because the Gitea code path
 * doesn't share the singleton. The cache invalidation on 409 is
 * what lets the `updateFile` retry path refresh a stale sha.
 *
 * # Authentication
 *
 * `getUser` / `isAuthenticated` mirror the GitHub adapter's
 * contract. The actual token is read from `AuthService` (the
 * same source the GitHub adapter uses for its token); the host
 * context decides which adapter to call. A future multi-account
 * refactor will replace this with explicit per-account token
 * lookup — until then, single-account GitHub setup + Gitea setup
 * in the same app will share whichever token was set most
 * recently, which matches the current GitHubService behaviour.
 */
function apiBaseFor(baseUrl: string): string {
  const root = (baseUrl ?? '').replace(/\/+$/, '');
  if (!root) return '/api/v1';
  return `${root}/api/v1`;
}

function pathEncodeSegments(path: string): string {
  // Gitea's contents endpoint takes the path as a URL segment
  // (slash-separated), with each segment percent-encoded — the
  // same convention GitHub uses.
  return path.split('/').map(encodeURIComponent).join('/');
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { status?: number }).status === 404
  );
}

interface GiteaContentsResponse {
  type?: 'file' | 'dir' | 'symlink' | 'submodule';
  encoding?: string;
  content?: string;
  sha?: string;
  size?: number;
  name?: string;
  path?: string;
}

interface GiteaFileCommitResponse {
  content?: { sha?: string } | null;
  commit?: { sha?: string } | null;
}

interface GiteaRepoResponse {
  private?: boolean;
}

interface GiteaUserResponse {
  login?: string;
  full_name?: string;
  email?: string;
  username?: string;
}

function toFileCommit(commit: GiteaFileCommitResponse | null): ContentsFileCommit | null {
  if (!commit) return null;
  return {
    sha: commit.content?.sha ?? '',
    commitSha: commit.commit?.sha ?? '',
  };
}

function authHeaderFor(token: string | undefined): Record<string, string> {
  // Same Basic auth as clone mode. The active host is set by the
  // caller (GitFsService / LocalGitWriter) right before the
  // contents operation, so we re-use the adapter to compute the
  // correct username.
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  if (token) {
    const { username, password } = getActiveGitHostKind() === 'gitea'
      ? giteaAdapter.buildBasicAuth({ token })
      : giteaAdapter.buildBasicAuth({ token }); // self-fallback
    const auth = Buffer.from(`${username}:${password}`).toString('base64');
    headers.Authorization = `Basic ${auth}`;
  }
  return headers;
}

export class GiteaContentsAdapter implements ContentsAdapter {
  readonly kind = 'gitea' as const;

  /**
   * Per-process sha cache. Mirrors the cache `GitHubService` keeps
   * internally — we re-implement it here because the Gitea code
   * path doesn't share the singleton. Lifetime is the JS bundle.
   * Cold on app launch; warm after the first save in a session.
   */
  private shaCache = new Map<string, string>();

  private shaCacheKey(owner: string, repo: string, path: string, ref?: string): string {
    return `${owner}/${repo}/${path}@${ref ?? ''}`;
  }

  invalidateShaCache(owner: string, repo: string, path: string, ref?: string): void {
    this.shaCache.delete(this.shaCacheKey(owner, repo, path, ref));
  }

  /** Test seam — clears the in-memory sha cache. */
  __resetShaCacheForTests(): void {
    this.shaCache.clear();
  }

  async getUser(): Promise<{ login: string; name: string; email: string } | null> {
    try {
      const token = await AuthService.getToken();
      if (!token) return null;
      const response = await this.request<GiteaUserResponse>(
        `${apiBaseFor(giteaAdapter.defaultBaseUrl())}/user`,
        { method: 'GET', token },
      );
      // Gitea's /user response uses `login` for username and
      // `full_name` for display name; fall back to `username` on
      // older Gitea versions that don't have `login`.
      const login = response.login ?? response.username ?? null;
      if (!login) return null;
      return {
        login,
        name: response.full_name ?? login,
        email: response.email ?? '',
      };
    } catch {
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
    const baseUrl = giteaAdapter.defaultBaseUrl();
    // The Gitea clone adapter doesn't currently carry per-repo
    // baseUrl — when the storage layer lands per-account host
    // info, the adapter will read the baseUrl from the call
    // context. Until then, callers that want to query a non-
    // default instance must pass a `baseUrl` override via opts.
    // Phase 2 follow-up: thread baseUrl through the ContentsAdapter
    // surface so we don't rely on the clone adapter's defaultBaseUrl.
    const url = `${apiBaseFor(baseUrl)}/repos/${owner}/${repo}`;
    try {
      const response = await this.request<GiteaRepoResponse>(url, {
        method: 'GET',
        token: opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined,
      });
      return { isPrivate: typeof response.private === 'boolean' ? response.private : null };
    } catch {
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
    const baseUrl = giteaAdapter.defaultBaseUrl();
    const params = new URLSearchParams();
    if (ref) params.set('ref', ref);
    const qs = params.toString();
    const url = `${apiBaseFor(baseUrl)}/repos/${owner}/${repo}/contents/${pathEncodeSegments(path)}${qs ? `?${qs}` : ''}`;
    try {
      const response = await this.request<GiteaContentsResponse>(url, {
        method: 'GET',
        token: opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined,
      });
      if (response.sha) return { kind: 'found', sha: response.sha };
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
    const baseUrl = giteaAdapter.defaultBaseUrl();
    const ref = branch ?? 'main';
    const encodedPath = pathEncodeSegments(path);
    const token = opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    const url = `${apiBaseFor(baseUrl)}/repos/${owner}/${repo}/contents/${encodedPath}`;
    const base64Content = await bytesToBase64(content);

    const cacheKey = this.shaCacheKey(owner, repo, path, ref);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Cache-first sha lookup, mirroring the GitHub adapter.
        let sha: string | null = this.shaCache.get(cacheKey) ?? null;
        if (!sha) {
          sha = await this.getFileShaOrNull(owner, repo, path, ref, opts);
          if (sha) this.shaCache.set(cacheKey, sha);
        }

        if (!sha) {
          if (opts?.expectExists) {
            // Caller asked us to fail rather than create. Mirrors
            // the GitHub adapter's `expectExists` semantics.
            console.warn(
              `[GiteaContentsAdapter] Remote file deleted, aborting update to prevent resurrection: ${path}`,
            );
            return null;
          }
          // No existing file → POST (create). Gitea returns 409
          // if the file actually does exist; we treat that the
          // same as the sha-drift case below.
          const created = await this.request<GiteaFileCommitResponse>(url, {
            method: 'POST',
            token,
            body: {
              message,
              content: base64Content,
              branch: ref,
            } as Record<string, unknown>,
          });
          const createdSha = created.content?.sha;
          if (createdSha) this.shaCache.set(cacheKey, createdSha);
          return toFileCommit(created);
        }

        // Existing file → PUT (update). Gitea returns 409 if the
        // sha drifted between our lookup and the write; refresh
        // and retry.
        const updated = await this.request<GiteaFileCommitResponse>(url, {
          method: 'PUT',
          token,
          body: {
            message,
            content: base64Content,
            sha,
            branch: ref,
          } as Record<string, unknown>,
        });
        const newSha = updated.content?.sha;
        if (newSha) this.shaCache.set(cacheKey, newSha);
        return toFileCommit(updated);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          // Sha drifted. Drop the cache, refresh, retry.
          this.shaCache.delete(cacheKey);
          continue;
        }
        if (status === 422) {
          // Validation failure — Gitea returns 422 for malformed
          // content (e.g., path conflicts with a directory). The
          // GitHub adapter returns a synthetic success here; we
          // match that to preserve the existing call-site contract.
          this.shaCache.delete(cacheKey);
          return { sha: '', commitSha: '' };
        }
        if (attempt === 2) {
          console.warn('[GiteaContentsAdapter] Failed to update file:', error);
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
    const baseUrl = giteaAdapter.defaultBaseUrl();
    const ref = branch ?? 'main';
    const encodedPath = pathEncodeSegments(path);
    const token = opts?.tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    const url = `${apiBaseFor(baseUrl)}/repos/${owner}/${repo}/contents/${encodedPath}`;
    const cacheKey = this.shaCacheKey(owner, repo, path, ref);

    let currentSha = sha;
    let networkRetried = false;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.request<GiteaFileCommitResponse | null>(url, {
          method: 'DELETE',
          token,
          body: {
            message,
            sha: currentSha,
            branch: ref,
          } as Record<string, unknown>,
        });
        // File is gone — drop the cache so a future create gets
        // a fresh sha instead of one pointing at a deleted blob.
        this.shaCache.delete(cacheKey);
        return toFileCommit(result);
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number })?.status;

        if (status === 404) {
          // Already gone upstream — synthetic success so callers
          // can treat the deletion as complete.
          this.shaCache.delete(cacheKey);
          return { sha: '', commitSha: '' };
        }

        if (status === 409 && attempt < 2) {
          this.shaCache.delete(cacheKey);
          const refreshed = await this.getFileSha(owner, repo, path, ref, opts);
          if (refreshed.kind === 'not-found') {
            return { sha: '', commitSha: '' };
          }
          if (refreshed.kind === 'found') {
            currentSha = refreshed.sha;
            this.shaCache.set(cacheKey, refreshed.sha);
            continue;
          }
          // refresh itself errored — bubble up so caller doesn't
          // soft-succeed.
          throw new Error(refreshed.message);
        }

        if (!status && !networkRetried && attempt < 2) {
          networkRetried = true;
          await new Promise<void>((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1000));
          continue;
        }

        console.warn('[GiteaContentsAdapter] Failed to delete file:', error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
    if (lastError) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    return null;
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<ContentsFileCommit | null> {
    // Gitea has no separate binary upload endpoint — the contents
    // endpoint accepts base64 in the body. We use the same
    // create-vs-update path as `updateFile`, but pass the caller-
    // encoded base64 verbatim instead of re-encoding the content.
    // The adapter contract says `base64Content` is already encoded,
    // so the call site is responsible for any size / encoding
    // concerns.
    const ref = branch ?? 'main';
    const baseUrl = giteaAdapter.defaultBaseUrl();
    const encodedPath = pathEncodeSegments(path);
    const token = await AuthService.getToken() ?? undefined;
    const url = `${apiBaseFor(baseUrl)}/repos/${owner}/${repo}/contents/${encodedPath}`;
    const cacheKey = this.shaCacheKey(owner, repo, path, ref);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const existingSha = await this.getFileShaOrNull(owner, repo, path, ref);
        const body: Record<string, unknown> = {
          message,
          content: base64Content,
          branch: ref,
        };
        if (existingSha) body.sha = existingSha;

        const method = existingSha ? 'PUT' : 'POST';
        const result = await this.request<GiteaFileCommitResponse>(url, {
          method,
          token,
          body,
        });
        const resultSha = result.content?.sha;
        if (resultSha) this.shaCache.set(cacheKey, resultSha);
        return toFileCommit(result);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) continue;
        if (status === 422 && (await this.getFileShaOrNull(owner, repo, path, ref))) {
          // Synthetic success on validation failure when the
          // file already exists — matches the GitHub adapter's
          // contract.
          return { sha: '', commitSha: '' };
        }
        if (attempt === 2) {
          console.warn('[GiteaContentsAdapter] Failed to upload binary file:', error);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Small fetch wrapper that adds the auth header, handles the
   * token-override path, and normalises non-2xx into a thrown
   * Error with a `status` field (matching the GitHubService
   * convention so the rest of this adapter can branch on it).
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
      // Thrown error includes `status` so the per-method catch
      // blocks can branch on 404 / 409 / 422.
      const error = new Error(
        `Gitea API ${opts.method} ${url} failed: ${response.status} ${response.statusText}`,
      ) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    // 204 No Content (some DELETE responses)
    if (response.status === 204) return null as T;
    return (await response.json()) as T;
  }
}

async function bytesToBase64(content: string): Promise<string> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(content);
  return Buffer.from(bytes).toString('base64');
}

export const giteaContentsAdapter = new GiteaContentsAdapter();
