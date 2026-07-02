/**
 * Git host abstraction.
 *
 * GitNotes supports multiple git hosts (GitHub today, GitLab added as the
 * second). Each host has its own REST API for the operations the app
 * performs in API mode: branch listing, tree walks, file CRUD, and
 * authentication. This file defines a small, host-agnostic surface that
 * the rest of the app talks to.
 *
 * Adding a third host (Gitea, Bitbucket, …) is a matter of writing a
 * new `GitHostService` implementation and registering it in
 * `gitHostFactory.ts`.
 */

export type GitHostProvider = 'github' | 'gitlab' | 'gitea' | 'forgejo';

/** Human-readable host label used in the UI. */
export const GIT_HOST_LABELS: Record<GitHostProvider, string> = {
  github: 'GitHub',
  gitlab: 'GitLab',
  gitea: 'Gitea',
  forgejo: 'Forgejo',
};

/** Default API base URL per host. Self-hosted hosts override at runtime. */
export const GIT_HOST_API_BASES: Record<GitHostProvider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
  gitea: 'https://gitea.com/api/v1',
  forgejo: 'https://codeberg.org/api/v1',
};

export interface GitHostRepoRef {
  /** Stable identifier, typically `<provider>:<owner>/<repo>`. */
  id: string;
  /** Host this repo lives on. */
  provider: GitHostProvider;
  /** Owner (user or org) slug. */
  owner: string;
  /** Project / repo slug. */
  repo: string;
  /** Default branch, when known. */
  defaultBranch?: string;
}

export interface GitHostUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
}

export interface GitHostTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

export interface GitHostContent {
  name: string;
  path: string;
  type: 'file' | 'dir' | string;
  size?: number;
  sha?: string;
  downloadUrl?: string | null;
}

export interface GitHostBranch {
  name: string;
  isDefault?: boolean;
}

/**
 * Provider-agnostic surface used by GitService and the sync stack.
 *
 * Implementations:
 * - `GitHubHostService` — wraps the existing `GitHubService`.
 * - `GitLabHostService` — talks to the GitLab REST API.
 */
export interface GitHostService {
  readonly provider: GitHostProvider;

  /** Returns the authenticated user, or `null` when no token is set. */
  getAuthenticatedUser(): Promise<GitHostUser | null>;

  /** Returns the default branch for a repo, or `null` if unknown. */
  getDefaultBranch(owner: string, repo: string): Promise<string | null>;

  /** Lists the branches for a repo. */
  listBranches(owner: string, repo: string): Promise<GitHostBranch[]>;

  /** Recursive tree of the repo at `ref`. Returns [] on failure. */
  getTreeRecursive(
    owner: string,
    repo: string,
    ref: string,
  ): Promise<GitHostTreeEntry[]>;

  /** Lists the entries in a folder (root if `path` is empty). */
  listContents(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostContent[]>;

  /** Reads the raw text content of a file. */
  getFileText(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null>;
}

/** Helper to compose the stable id for a repo. */
export function makeRepoId(provider: GitHostProvider, owner: string, repo: string): string {
  return `${provider}:${owner}/${repo}`;
}
