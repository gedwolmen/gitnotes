/**
 * Git host adapter — encapsulates everything that varies between
 * GitHub, Gitea/Forgejo, GitLab, and other self-hosted Git providers
 * so the rest of the app can stay host-agnostic.
 *
 * Phase 1 (clone mode only) needs three things from each adapter:
 *
 *   1. `buildRemoteUrl({ owner, repo })` — what URL to hand to
 *      isomorphic-git's clone / fetch / push. May include a path
 *      prefix for self-hosted instances (e.g. `gitea.example.com/owner/repo.git`).
 *
 *   2. `buildBasicAuth(token)` — how the host expects credentials in
 *      the HTTP Basic auth header. GitHub wants the sentinel
 *      `x-access-token:<pat>` username; Gitea wants `oauth2:<token>`;
 *      GitLab accepts either a personal access token as the password
 *      with any username, or a Bearer header. We standardize on Basic
 *      for clone-mode since isomorphic-git requires username+password
 *      pairs in `onAuth`.
 *
 *   3. `fetchDefaultBranch({ baseUrl, owner, repo, token })` — best-effort
 *      REST lookup. Returns null on any failure so the caller can fall
 *      back to a hardcoded default ('main'). The wire shape of this
 *      endpoint differs per host (GitHub: `/repos/{o}/{r}`,
 *      Gitea: `/api/v1/repos/{o}/{r}`, GitLab: `/api/v4/projects/{url-encoded}`).
 *
 * API-mode concerns (Contents API for read/write of individual files)
 * are deliberately out of scope for phase 1 and will be added as
 * additional adapter methods in phase 2.
 */

export type GitHostKind = 'github' | 'gitea' | 'gitlab';

/**
 * Hosts that are actually wired up in the phase-1 PR. GitLab support
 * is planned for phase 3 (its Contents API is meaningfully different
 * from GitHub's), so its kind is in the union for forward
 * compatibility (e.g. storage schemas that already know the field
 * exists) but the factory throws for it until the adapter lands.
 */
export type SupportedGitHostKind = 'github' | 'gitea';

export interface RepoCoordinates {
  owner: string;
  repo: string;
}

/**
 * Fully-qualified repo address. `baseUrl` is the scheme+host (+ optional
 * sub-path) the user provided when binding the account. Empty string is
 * reserved for the GitHub default (`https://api.github.com` /
 * `https://github.com`) and resolves via `defaultBaseUrl(kind)`.
 */
export interface RepoAddress extends RepoCoordinates {
  baseUrl?: string;
}

export interface BuildRemoteUrlOpts extends RepoCoordinates {
  baseUrl?: string;
}

export interface BuildBasicAuthOpts {
  token: string;
}

export interface FetchDefaultBranchOpts extends RepoAddress {
  token?: string;
  /** Abort the request after this many ms. Defaults to 30s. */
  timeoutMs?: number;
}

export interface GitHostAdapter {
  readonly kind: GitHostKind;

  /**
   * HTTPS URL isomorphic-git will use for clone / fetch / push. Must
   * include `.git` suffix. Must not embed credentials — those go in the
   * Basic auth header built by `buildBasicAuth`.
   */
  buildRemoteUrl(opts: BuildRemoteUrlOpts): string;

  /**
   * Return the `{ username, password }` pair isomorphic-git wants in
   * `onAuth`. The wire format of these values is host-specific.
   */
  buildBasicAuth(opts: BuildBasicAuthOpts): { username: string; password: string };

  /**
   * Resolve the repo's default branch via the host's REST API. Returns
   * null on any non-2xx, network error, or timeout — callers must
   * tolerate null and fall back to a default ref.
   */
  fetchDefaultBranch(opts: FetchDefaultBranchOpts): Promise<string | null>;

  /**
   * The default base URL for this host when the user hasn't provided
   * one (e.g. `https://github.com` for GitHub.com). Self-hosted
   * deployments always pass an explicit baseUrl.
   */
  defaultBaseUrl(): string;

  /**
   * Human-readable label for the host, for UI surfaces (e.g.
   * "GitHub", "Gitea", "GitLab"). Falls back to `kind` capitalised
   * if an adapter doesn't override.
   */
  displayName(): string;
}
