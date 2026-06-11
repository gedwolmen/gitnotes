/**
 * Contents API adapter — encapsulates the host-specific read/write
 * surface that today lives in `GitHubService` and tomorrow will live
 * in `GiteaContentsAdapter` / `GitLabContentsAdapter`. The
 * `*GitHubSyncService` files consult a `ContentsAdapter` (selected
 * by the active host kind) instead of the `GitHubService` singleton
 * directly, so API-mode sync can be ported to self-hosted Git
 * without forking each sync service.
 *
 * **Phase 1 of this PR ships the `GitHubContentsAdapter` only.**
 * The Gitea + GitLab contents adapters land in follow-up PRs. Until
 * they ship, only GitHub.com works in API mode — the same constraint
 * we had before this refactor; the refactor itself doesn't change
 * runtime behavior. It moves the seam.
 *
 * # Interface shape
 *
 * The methods mirror the subset of `GitHubService` that the
 * `*GitHubSyncService` files actually call — 9 methods as of this
 * PR, plus 2 path helpers that the per-host implementations can
 * share via this base. The per-host adapter is responsible for
 * building its own URLs, encoding paths, paginating, and handling
 * auth (typically by re-using `getActiveGitHostKind` from
 * `gitHttp.ts` to pick the right Basic auth pair via `ensureToken`).
 *
 * # What does NOT live here
 *
 * - Account / user / auth methods (login, getUser, setToken,
 *   clearToken, isAuthenticated). These stay in `GitHubService`
 *   and `AccountStorage` because they're account-management
 *   concerns, not Contents-API concerns. The `*GitHubSyncService`
 *   files continue to read auth from there.
 * - `getRepositories` / `getIssues` / `getPullRequests` /
 *   `getMilestones` / `createPullRequest`. These are used by the
 *   repo picker UI, not the sync services. They stay in
 *   `GitHubService` for now; the repo picker is GitHub-specific
 *   today (no self-hosted counterpart) and re-architecting it is
 *   a phase-3 UI problem.
 * - List/repo-browsing. Phase 1 uses `getRepoContents` /
 *   `getTreeRecursive` via the `RepoFileBrowser`, which is also
 *   GitHub-only today; covered in the phase-3 UI work.
 *
 * # Why this isn't a drop-in `GitHubService` rename
 *
 * The eventual `GiteaContentsAdapter` will have a different auth
 * convention, different URL shape, different branch parameter
 * position, different pagination model, and (for GitLab) a
 * fundamentally different binary-upload path. Forcing every
 * adapter to implement the full `GitHubService` surface would
 * mean either (a) `GiteaContentsAdapter` has 30+ methods most of
 * which it doesn't use, or (b) we define a smaller interface here
 * that the sync services actually depend on. (b) is the right
 * call: the interface is the *contract* the sync services need,
 * and each adapter implements only what it needs to.
 */

import type { GitHostKind } from '../types';

export interface ContentsFileCommit {
  /** The new blob sha after the operation. May be empty string if the API doesn't return one. */
  sha: string;
  /** Commit sha. May be empty string if the API doesn't return one. */
  commitSha: string;
}

/** Typed sha lookup result. Mirrors `GitHubService.ShaResult`. */
export type ContentsShaResult =
  | { kind: 'found'; sha: string }
  | { kind: 'not-found' }
  | { kind: 'error'; status?: number; message: string };

export interface ContentsGetFileOpts {
  /** Branch or ref to read from. */
  ref?: string;
  /** Per-call token override; bypasses the singleton active-account header. */
  tokenOverride?: string;
}

export interface ContentsUpdateFileOpts extends ContentsGetFileOpts {
  /**
   * When true, the adapter must fail the update rather than create
   * the file if the remote copy is missing. The original
   * `GitHubService.updateFile` opts had this as `expectExists`;
   * we keep the same semantics.
   */
  expectExists?: boolean;
}

/**
 * Lightweight repo metadata. The original `getRepoPrivacy` returned
 * `boolean | null`; we keep the null fall-through so callers can
 * choose a safe default (the existing NoteGitHubSyncService uses
 * "treat as private" on null — see #733).
 */
export interface ContentsRepoInfo {
  isPrivate: boolean | null;
}

export interface ContentsAdapter {
  readonly kind: GitHostKind;

  // ---- User / repo metadata ---------------------------------------

  /** Returns the current authenticated user. Phase 1: GitHub only. */
  getUser(): Promise<{ login: string; name: string; email: string } | null>;

  /** Returns true when the adapter has a valid auth token available. */
  isAuthenticated(): Promise<boolean>;

  /** Returns the repo's privacy flag, or null on lookup failure. */
  getRepoPrivacy(
    owner: string,
    repo: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsRepoInfo>;

  // ---- Read paths -------------------------------------------------

  /**
   * Cache-first sha lookup. The result is the same shape as
   * `getFileSha`; the per-host adapter is free to wrap or share
   * the cache. Callers branch on `kind` exactly the same way as
   * `GitHubService.ShaResult`.
   */
  getFileShaCached(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult>;

  /** Strict sha lookup. See `ShaResult` docstring. */
  getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsShaResult>;

  /** Convenience wrapper that returns `string | null`. */
  getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<string | null>;

  // ---- Write paths ------------------------------------------------

  /**
   * Upsert a text file. Mirrors `GitHubService.updateFile`:
   * - If remote file exists, PUT with the current sha
   * - If remote file is missing, create (unless `expectExists`)
   * - On 409 (sha drifted), refresh and retry up to 3 times
   * - On 422, return a synthetic `{ sha: '' }` so the caller
   *   treats the write as a no-op
   */
  updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    message: string,
    branch?: string,
    opts?: ContentsUpdateFileOpts,
  ): Promise<ContentsFileCommit | null>;

  /**
   * Delete a file. Mirrors `GitHubService.deleteFile`:
   * - Synthetic success on 404 (file already gone)
   * - On 409, refresh sha and retry up to 3 times
   * - Throws on terminal failure so the caller can distinguish
   *   "could not delete" from "deleted nothing because gone"
   */
  deleteFile(
    owner: string,
    repo: string,
    path: string,
    message: string,
    sha: string,
    branch?: string,
    opts?: ContentsGetFileOpts,
  ): Promise<ContentsFileCommit | null>;

  /**
   * Upload a binary file (base64 already encoded by the caller).
   * Mirrors `GitHubService.uploadBinaryFile`:
   * - 3-attempt retry on 409
   * - Synthetic success on 422
   * - Returns null on terminal failure
   */
  uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    message: string,
    branch?: string,
  ): Promise<ContentsFileCommit | null>;
}
