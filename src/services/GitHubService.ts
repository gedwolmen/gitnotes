import AsyncStorage from '@react-native-async-storage/async-storage';
import http, { setAuthToken, clearAuthToken } from './http';
import AuthService from './AuthService';

const USER_KEY = '@gitnotes:github_user';

function base64ToBytes(base64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  // Each 4 base64 chars → 3 bytes; padding "=" trims the tail.
  let outLen = (cleaned.length / 4) * 3;
  if (cleaned.endsWith('==')) outLen -= 2;
  else if (cleaned.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let bi = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = cleaned[i + 2] === '=' ? 64 : chars.indexOf(cleaned[i + 2]);
    const c4 = cleaned[i + 3] === '=' ? 64 : chars.indexOf(cleaned[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    bytes[bi++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== 64 && c3 >= 0) bytes[bi++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 !== 64 && c4 >= 0) bytes[bi++] = ((c3 & 3) << 6) | c4;
  }
  return bytes.subarray(0, bi);
}

function decodeBase64(base64: string): string {
  const bytes = base64ToBytes(base64);
  // Prefer TextDecoder when available (Hermes / modern JSC). Falls back to
  // a manual UTF-8 decoder so 4-byte sequences (emoji, supplementary plane)
  // round-trip correctly. The previous implementation went through
  // String.fromCharCode + escape/decodeURIComponent, which is deprecated
  // and corrupts code points outside the BMP.
  const TD: typeof TextDecoder | undefined = (globalThis as unknown as { TextDecoder?: typeof TextDecoder }).TextDecoder;
  if (TD) {
    try {
      return new TD('utf-8').decode(bytes);
    } catch (error) { void error;
      // fall through to manual decoder
    }
  }
  return utf8DecodeBytes(bytes);
}

function utf8DecodeBytes(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b1 = bytes[i++];
    if (b1 < 0x80) {
      out += String.fromCharCode(b1);
      continue;
    }
    if ((b1 & 0xe0) === 0xc0 && i < bytes.length) {
      const b2 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
      continue;
    }
    if ((b1 & 0xf0) === 0xe0 && i + 1 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      out += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
      continue;
    }
    if ((b1 & 0xf8) === 0xf0 && i + 2 < bytes.length) {
      const b2 = bytes[i++];
      const b3 = bytes[i++];
      const b4 = bytes[i++];
      const cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
      // Encode astral code points as a surrogate pair.
      const cpAdj = cp - 0x10000;
      out += String.fromCharCode(0xd800 + (cpAdj >> 10), 0xdc00 + (cpAdj & 0x3ff));
      continue;
    }
    // Invalid sequence — emit replacement character and advance one byte.
    out += '�';
  }
  return out;
}

export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name: string;
  email: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  owner: { login: string };
  html_url: string;
  description: string;
  private: boolean;
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  state: 'open' | 'closed';
  html_url: string;
  milestone: GitHubMilestone | null;
  labels: Array<{ name: string; color: string }>;
  assignees: Array<{ login: string; avatar_url: string }>;
  created_at: string;
  updated_at: string;
}

export interface GitHubMilestone {
  id: number;
  number: number;
  title: string;
  description: string;
  state: 'open' | 'closed';
  html_url: string;
  open_issues: number;
  closed_issues: number;
  due_on: string | null;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  state: 'open' | 'closed';
  html_url: string;
  user: { login: string };
  draft: boolean;
  created_at: string;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
  download_url: string | null;
  content?: string;
  encoding?: string;
  sha?: string;
}

export interface GitHubFileCommit {
  content: { sha: string } | null;
  commit: { sha: string };
}

export interface GitHubPathCommitDates {
  updatedAt?: number;
  createdAt?: number;
}

/**
 * Tristate result of a sha lookup so callers can distinguish
 * "definitely gone" from "couldn't tell". Critical for delete paths —
 * see `deleteNoteFromGitHub`: when the lookup itself errors we must
 * propagate so the local row stays put, otherwise the next pull
 * resurrects the file we thought we'd cleaned up.
 */
export type ShaResult =
  | { kind: 'found'; sha: string }
  | { kind: 'not-found' }
  | { kind: 'error'; status?: number; message: string };

class GitHubServiceClass {
  private token: string | null = null;
  private user: GitHubUser | null = null;

  /**
   * Per-process cache of `(owner/repo/path@ref) → sha`. Populated on every
   * successful read/write that surfaces a sha and invalidated on 409. Lets
   * the upsert / delete paths skip the GET-for-sha that #565 phase C calls
   * out as a fixed cost on every API-mode write. Cold on app launch (1
   * legacy GET on first touch); after that, in-session repeat saves cost
   * only the PUT/DELETE round-trip.
   */
  private shaCache = new Map<string, string>();

  /**
   * Per-process cache of `(owner/repo) → private`. Avoids a /repos/{owner}/{repo}
   * round-trip on every save when deciding whether to write a public raw URL or
   * the auth-required `gitnotes://repo-image/...` scheme for uploaded images
   * (#733). Lifetime is the JS bundle — not durable, but a flipped visibility
   * is rare enough that we accept the staleness window vs. plumbing storage.
   */
  private repoPrivacyCache = new Map<string, boolean>();

  private shaCacheKey(owner: string, repo: string, path: string, ref?: string): string {
    return `${owner}/${repo}/${path}@${ref ?? ''}`;
  }

  /**
   * Returns the `private` flag for `owner/repo`. Cached per process.
   * Falls back to `null` on lookup failure so callers can choose a safe
   * default (#733 picks "treat as private" — the worst case is a new
   * upload uses the auth-resolved scheme on a public repo, which still
   * renders correctly).
   */
  async getRepoPrivacy(
    owner: string,
    repo: string,
    opts?: TokenOpts,
  ): Promise<boolean | null> {
    const key = `${owner}/${repo}`;
    const cached = this.repoPrivacyCache.get(key);
    if (cached !== undefined) return cached;
    try {
      const data = await this.request<{ private?: boolean }>(
        `https://api.github.com/repos/${owner}/${repo}`,
        'GET',
        undefined,
        opts,
      );
      if (typeof data?.private === 'boolean') {
        this.repoPrivacyCache.set(key, data.private);
        return data.private;
      }
      return null;
    } catch (error) {
      console.warn('[GitHubService] Failed to get repo privacy:', error);
      return null;
    }
  }

  invalidateShaCache(owner: string, repo: string, path: string, ref?: string): void {
    this.shaCache.delete(this.shaCacheKey(owner, repo, path, ref));
  }

  /**
   * Cache-first sha lookup. Hits the GET only when the entry is missing
   * (or has been invalidated by a prior 409). Same return shape as
   * `getFileSha`, so callers branch on `kind` exactly the same way.
   */
  async getFileShaCached(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<ShaResult> {
    const cached = this.shaCache.get(this.shaCacheKey(owner, repo, path, ref));
    if (cached) return { kind: 'found', sha: cached };
    const result = await this.getFileSha(owner, repo, path, ref, opts);
    if (result.kind === 'found') {
      this.shaCache.set(this.shaCacheKey(owner, repo, path, ref), result.sha);
    }
    return result;
  }

  async initialize(): Promise<void> {
    try {
      this.token = await AuthService.getToken();
      if (!this.token) return;
      setAuthToken(this.token);
      const userJson = await AsyncStorage.getItem(USER_KEY);
      if (userJson) {
        this.user = JSON.parse(userJson);
      } else {
        this.user = await this.fetchUser();
        if (this.user) {
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(this.user));
        }
      }
    } catch (error) {
      console.warn('[GitHubService] Failed to initialize:', error);
    }
  }

  async setToken(token: string, user?: GitHubUser | null): Promise<GitHubUser | null> {
    this.token = token;
    setAuthToken(token);
    const resolvedUser = user === undefined ? await this.fetchUser() : user;
    if (!resolvedUser) {
      this.token = null;
      clearAuthToken();
      return null;
    }
    this.user = resolvedUser;
    await AuthService.setToken(token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(resolvedUser));
    return resolvedUser;
  }

  async clearToken(): Promise<void> {
    this.token = null;
    this.user = null;
    clearAuthToken();
    await AuthService.clearToken();
    await AsyncStorage.removeItem(USER_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getUser(): GitHubUser | null {
    return this.user;
  }

  private async fetchUser(): Promise<GitHubUser | null> {
    try {
      return await this.request<GitHubUser>('https://api.github.com/user');
    } catch (error) { void error;
      return null;
    }
  }

  async getRepositories(): Promise<GitHubRepository[]> {
    const all: GitHubRepository[] = [];
    const params = new URLSearchParams({
      sort: 'updated',
      per_page: '100',
      visibility: 'all',
      affiliation: 'owner,collaborator,organization_member',
    });
    let url: string | null = `https://api.github.com/user/repos?${params.toString()}`;
    try {
      while (url) {
        const { data, nextUrl } = await this.requestPaginated(url);
        if (Array.isArray(data)) all.push(...data);
        url = nextUrl;
      }
      return all;
    } catch (error) {
      console.warn('[GitHubService] Failed to get repositories:', error);
      return all;
    }
  }

  async getIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/issues?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get issues:', error);
      return [];
    }
  }

  async getPullRequests(owner: string, repo: string): Promise<GitHubPullRequest[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get pull requests:', error);
      return [];
    }
  }

  async createPullRequest(opts: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }): Promise<GitHubPullRequest | null> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${opts.owner}/${opts.repo}/pulls`,
        'POST',
        {
          title: opts.title,
          body: opts.body,
          head: opts.head,
          base: opts.base,
        }
      );
      return data as GitHubPullRequest;
    } catch (error) {
      console.warn('[GitHubService] Failed to create pull request:', error);
      return null;
    }
  }

  async getMilestones(owner: string, repo: string): Promise<GitHubMilestone[]> {
    try {
      const data = await this.request(
        `https://api.github.com/repos/${owner}/${repo}/milestones?state=open&per_page=50`
      );
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.warn('[GitHubService] Failed to get milestones:', error);
      return [];
    }
  }

  async getRepoContents(owner: string, repo: string, path: string = '', ref?: string): Promise<GitHubContent[]> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url);
      if (Array.isArray(data)) {
        return data;
      }
      return [data];
    } catch (error) {
      if (!isNotFound(error)) {
        console.warn('[GitHubService] Failed to get repo contents:', error);
      }
      return [];
    }
  }

  async getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }[]> {
    try {
      return await this.getTreeRecursiveOrThrow(owner, repo, ref);
    } catch (error) {
      if (!isNotFound(error)) {
        console.warn('[GitHubService] Failed to get tree:', error);
      }
      return [];
    }
  }

  // Strict variant that lets the caller distinguish "tree fetched, repo has 0
  // entries" (resolves to []) from "tree fetch failed" (throws). The swallowing
  // `getTreeRecursive` returns [] for both cases, which is fine for display
  // contexts but unsafe for reconciliation logic that uses the absence of a
  // path as evidence the file was deleted on the remote.
  async getTreeRecursiveOrThrow(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }[]> {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`;
    const data = await this.request(url);
    // Match the "OrThrow" contract: a 200 with a malformed body is *not*
    // authoritative evidence that the repo has zero entries. Returning [] here
    // would let reconcilers (#508 templates, notes pull) wipe local entries on
    // a transient API hiccup. Throw instead so callers' outer catch returns 0.
    if (!Array.isArray(data?.tree)) {
      throw new Error('GitHub tree response missing tree array');
    }
    return data.tree.map((item: any) => ({
      path: item.path,
      type: item.type,
      sha: item.sha,
      size: typeof item.size === 'number' ? item.size : undefined,
    }));
  }

  async getFileContent(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<string | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url, 'GET', undefined, opts);
      if (data.type === 'file' && data.content) {
        const base64 = data.content.replace(/\n/g, '');
        return decodeBase64(base64);
      }
      return null;
    } catch (error) {
      console.warn('[GitHubService] Failed to get file content:', error);
      return null;
    }
  }

  async getPathCommitDates(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<GitHubPathCommitDates> {
    try {
      const params = new URLSearchParams({ path, per_page: '100' });
      if (ref) params.set('sha', ref);
      const data = await this.request<any[]>(
        `https://api.github.com/repos/${owner}/${repo}/commits?${params.toString()}`,
        'GET',
        undefined,
        opts,
      );
      if (!Array.isArray(data) || data.length === 0) return {};
      const parseDate = (value: unknown): number | undefined => {
        if (typeof value !== 'string') return undefined;
        const timestamp = Date.parse(value);
        return Number.isFinite(timestamp) ? timestamp : undefined;
      };
      const newest = parseDate(data[0]?.commit?.author?.date ?? data[0]?.commit?.committer?.date);
      const oldest = parseDate(data[data.length - 1]?.commit?.author?.date ?? data[data.length - 1]?.commit?.committer?.date);
      return {
        updatedAt: newest,
        createdAt: oldest ?? newest,
      };
    } catch (error) {
      console.warn('[GitHubService] Failed to get path commit dates:', error);
      return {};
    }
  }

  /**
   * Fetches a file via the Contents API and returns the raw base64 (no UTF-8
   * decode). Used by the renderer to inline private-repo image bytes as
   * `data:` URIs for #733. Files larger than ~1 MB return empty `content`
   * from this endpoint — for those callers should fall back to the blobs
   * API; image attachments are well under that bound in practice.
   */
  async getFileBase64(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<string | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url, 'GET', undefined, opts);
      if (data?.type === 'file' && typeof data.content === 'string' && data.content.length > 0) {
        return data.content.replace(/\n/g, '');
      }
      return null;
    } catch (error) {
      console.warn('[GitHubService] Failed to get file base64:', error);
      return null;
    }
  }

  /**
   * Typed sha lookup so callers can distinguish "remote file is gone"
   * (delete should soft-succeed) from "we couldn't reach GitHub" (delete
   * must NOT short-circuit, otherwise the local row vanishes while the
   * upstream copy lingers and gets re-synced on the next pull).
   *
   * `getFileShaOrNull` keeps the legacy `string | null` shape for the
   * upsert paths that just need a sha-or-create decision.
   */
  async getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<ShaResult> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      let url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      if (ref) url += `?ref=${encodeURIComponent(ref)}`;
      const data = await this.request(url, 'GET', undefined, opts);
      if (data?.sha) return { kind: 'found', sha: data.sha };
      return { kind: 'not-found' };
    } catch (error) {
      const status = (error as { status?: number })?.status;
      const message = error instanceof Error ? error.message : String(error);
      if (status === 404) return { kind: 'not-found' };
      return { kind: 'error', status, message };
    }
  }

  /**
   * Convenience wrapper that preserves the prior `string | null` shape
   * for upsert call sites (they only care about "exists, give me the
   * sha" vs "create new"). Errors collapse to null here just like the
   * old behavior — deletes go through `getFileSha` and handle the typed
   * result themselves.
   */
  async getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: TokenOpts,
  ): Promise<string | null> {
    const result = await this.getFileSha(owner, repo, path, ref, opts);
    return result.kind === 'found' ? result.sha : null;
  }

  async createFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
    opts?: TokenOpts,
  ): Promise<GitHubFileCommit | null> {
    try {
      const encodedPath = path.split('/').map(encodeURIComponent).join('/');
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(content);
      let binary = '';
      bytes.forEach((b) => { binary += String.fromCharCode(b); });
      const base64Content = btoa(binary);
      return await this.request(url, 'PUT', {
        message,
        content: base64Content,
        branch,
      }, opts);
    } catch (error) {
      console.warn('[GitHubService] Failed to create file:', error);
      return null;
    }
  }

  async uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch: string = 'main',
  ): Promise<GitHubFileCommit | null> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const existingSha = await this.getFileShaOrNull(owner, repo, path, branch);
      try {
        const body: Record<string, string> = {
          message,
          content: base64Content,
          branch,
        };
        if (existingSha) body.sha = existingSha;

        return await this.request(url, 'PUT', body);
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          continue;
        }
        if (status === 422 && existingSha) {
          return { content: { sha: existingSha }, commit: { sha: '' } } as GitHubFileCommit;
        }
        if (attempt === 2) {
          console.warn('[GitHubService] Failed to upload binary file:', error);
          return null;
        }
      }
    }
    return null;
  }

  /**
   * Delete a remote file with bounded retries. The 409 path mirrors the
   * `updateFile` recovery loop — when the upstream sha drifts mid-flight
   * we re-fetch it and re-DELETE up to 3 attempts. Transient network
   * failures get one extra retry with backoff so flaky cellular doesn't
   * leave a half-deleted note (#567 fix B).
   *
   * Throws on terminal failure so callers can distinguish "could not
   * delete" from "deleted nothing because already gone" — matters for
   * the typed sha gating in `deleteNoteFromGitHub`. Pre-existing callers
   * that want the legacy null-on-failure shape should wrap in try/catch.
   */
  async deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch: string = 'main',
    opts?: TokenOpts,
  ): Promise<GitHubFileCommit | null> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;

    const cacheKey = this.shaCacheKey(owner, repo, path, branch);
    let currentSha = sha;
    let networkRetried = false;
    let lastError: unknown = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = (await this.request(
          url,
          'DELETE',
          { message, sha: currentSha, branch },
          opts,
        )) as GitHubFileCommit | null;
        // File is gone — drop the cache so a future create gets a fresh
        // sha instead of one pointing at a deleted blob.
        this.shaCache.delete(cacheKey);
        return result;
      } catch (error) {
        lastError = error;
        const status = (error as { status?: number })?.status;

        if (status === 404) {
          // Already gone upstream — synthetic success so callers can
          // treat the deletion as complete.
          this.shaCache.delete(cacheKey);
          return { content: null, commit: { sha: '' } };
        }

        if (status === 409 && attempt < 2) {
          this.shaCache.delete(cacheKey);
          const refreshed = await this.getFileSha(owner, repo, path, branch, opts);
          if (refreshed.kind === 'not-found') {
            return { content: null, commit: { sha: '' } };
          }
          if (refreshed.kind === 'found') {
            currentSha = refreshed.sha;
            this.shaCache.set(cacheKey, refreshed.sha);
            continue;
          }
          // refresh itself errored — bubble up so caller doesn't soft-succeed.
          throw new Error(refreshed.message);
        }

        if (!status && !networkRetried && attempt < 2) {
          networkRetried = true;
          await new Promise<void>((resolve) => setTimeout(resolve, attempt === 0 ? 250 : 1000));
          continue;
        }

        // No retry path applies (or we exhausted attempts). Bubble out so
        // the delete sync helper can hold the local row.
        console.warn('[GitHubService] Failed to delete file:', error);
        throw error instanceof Error ? error : new Error(String(error));
      }
    }
    if (lastError) {
      throw lastError instanceof Error ? lastError : new Error(String(lastError));
    }
    return null;
  }

  async createFolder(
    owner: string,
    repo: string,
    folderPath: string,
    branch: string = 'main',
    opts?: TokenOpts,
  ): Promise<GitHubFileCommit | null> {
    const keepPath = folderPath ? `${folderPath}/.gitkeep` : '.gitkeep';
    return this.createFile(owner, repo, keepPath, '', `Create folder ${folderPath || '/'}`, branch, opts);
  }

  async updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch: string = 'main',
    opts?: TokenOpts & { expectExists?: boolean },
  ): Promise<GitHubFileCommit | null> {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
    const encoder = new TextEncoder();
    const bytes = encoder.encode(content);
    let binary = '';
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    const base64Content = btoa(binary);

    const cacheKey = this.shaCacheKey(owner, repo, path, branch);

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        let sha: string | null = this.shaCache.get(cacheKey) ?? null;
        if (!sha) {
          sha = await this.getFileShaOrNull(owner, repo, path, branch, opts);
          if (sha) this.shaCache.set(cacheKey, sha);
        }
        if (!sha) {
          if (opts?.expectExists) {
            console.warn(`[GitHubService] Remote file deleted, aborting update to prevent resurrection: ${path}`);
            return null;
          }
          const created = await this.createFile(owner, repo, path, content, message, branch, opts);
          const createdSha = created?.content?.sha;
          if (createdSha) this.shaCache.set(cacheKey, createdSha);
          return created;
        }

        const response = (await this.request(
          url,
          'PUT',
          { message, content: base64Content, sha, branch },
          opts,
        )) as GitHubFileCommit | null;
        const newSha = response?.content?.sha;
        if (newSha) this.shaCache.set(cacheKey, newSha);
        return response;
      } catch (error) {
        const status = (error as { status?: number })?.status;
        if (status === 409 && attempt < 2) {
          this.shaCache.delete(cacheKey);
          try {
            const upstreamContent = await this.getFileContent(owner, repo, path, branch);
            if (upstreamContent !== null && upstreamContent !== content) {
              console.warn(`[GitHubService] Aborting update: upstream content diverged for ${path}`);
              return null;
            }
          } catch {
          }
          continue;
        }
        if (status === 422) {
          this.shaCache.delete(cacheKey);
          return { content: { sha: '' }, commit: { sha: '' } } as GitHubFileCommit;
        }
        if (attempt === 2) {
          console.warn('[GitHubService] Failed to update file:', error);
          return null;
        }
      }
    }
    return null;
  }

  async moveFile(
    owner: string,
    repo: string,
    oldPath: string,
    newPath: string,
    content: string,
    message: string,
    oldSha: string,
    branch: string = 'main',
    opts?: TokenOpts,
  ): Promise<boolean> {
    const createResult = await this.createFile(owner, repo, newPath, content, message, branch, opts);
    if (!createResult) return false;
    try {
      await this.deleteFile(owner, repo, oldPath, message, oldSha, branch, opts);
    } catch (error) {
      // Move semantics: the new path landed; failing to clean up the old
      // path leaves a duplicate but is not catastrophic. Surface the
      // failure in logs so it can be retried via the file browser.
      console.warn('[GitHubService] moveFile cleanup failed for', oldPath, error);
    }
    return true;
  }

  private async request<T = any>(
    url: string,
    method: 'GET' | 'PUT' | 'POST' | 'DELETE' = 'GET',
    data?: any,
    opts?: TokenOpts,
  ): Promise<T> {
    const override = opts?.tokenOverride;
    if (!this.token && !override) throw new Error('GitHub token is not configured');
    const response = await http.request<T>({ url, method, data, ...(override ? { authOverride: override } : {}) });
    return response.data;
  }

  private async requestPaginated(url: string): Promise<{ data: any; nextUrl: string | null }> {
    if (!this.token) throw new Error('GitHub token is not configured');
    const response = await http.get(url);
    const linkHeader = response.headers['link'] as string | null;
    const nextUrl = parseNextLink(linkHeader);
    return { data: response.data, nextUrl };
  }
}

export interface TokenOpts {
  /** Per-call GitHub token override; bypasses the singleton active-account header. */
  tokenOverride?: string;
}

function parseNextLink(linkHeader: string | null | undefined): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { status?: number }).status === 404;
}

export const GitHubService = new GitHubServiceClass();
