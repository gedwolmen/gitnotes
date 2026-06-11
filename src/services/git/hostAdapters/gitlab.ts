import type {
  BuildBasicAuthOpts,
  BuildRemoteUrlOpts,
  FetchDefaultBranchOpts,
  GitHostAdapter,
} from './types';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * GitLab CE/EE adapter.
 *
 * **Phase 1 scope: clone mode only.** This adapter makes `git.clone`,
 * `git.fetch`, and `git.push` work against a self-hosted GitLab
 * instance. It does NOT cover the Contents API for read/write of
 * individual files in API-mode sync — that requires a separate
 * `GitLabContentsAdapter` which lands alongside the Contents API
 * extraction work in phase 3 (see `AGENT.md`).
 *
 * Authentication: GitLab's HTTP Git endpoint accepts Basic auth with
 * the PAT as the password and *any* non-empty string as the username.
 * We use the empty string by convention to make it obvious in network
 * captures that no username was used. The Personal Access Token can
 * also be sent as a Bearer token on the REST API; clone-mode uses
 * Basic only because `isomorphic-git`'s `onAuth` requires a
 * username/password pair.
 *
 * Project path encoding: GitLab URLs use `namespace/project` (e.g.
 * `my-group/my-subgroup/my-project`). The clone URL is the same path
 * the user navigates to in the GitLab UI, so no special encoding is
 * needed at clone time. (The REST API is a different story — it
 * requires the path URL-encoded as `namespace%2Fproject`. That's
 * the Contents adapter's problem, not ours.)
 *
 * Default-branch lookup: GitLab's REST API endpoint is
 * `GET /api/v4/projects/:url_encoded_path` and returns the
 * `default_branch` field directly. The full path is
 * URL-encoded; the project ID is also accepted but the path is
 * what users copy from the GitLab UI.
 */
function normaliseBaseUrl(input: string | undefined): string {
  if (!input) return '';
  return input.replace(/\/+$/, '');
}

function apiBaseFor(baseUrl: string): string {
  const root = normaliseBaseUrl(baseUrl);
  if (!root) return '/api/v4';
  return `${root}/api/v4`;
}

/** URL-encode a `namespace/project` path the way GitLab's REST API wants it. */
function encodeProjectPath(owner: string, repo: string): string {
  return `${owner}/${repo}`.split('/').map(encodeURIComponent).join('%2F');
}

export const gitlabAdapter: GitHostAdapter = {
  kind: 'gitlab',

  buildRemoteUrl({ baseUrl, owner, repo }: BuildRemoteUrlOpts): string {
    const root = normaliseBaseUrl(baseUrl);
    if (!root) {
      // GitLab has no canonical "default" — every instance is
      // self-hosted. Return an obviously-bogus URL so the caller
      // notices rather than silently cloning from the wrong host.
      // Callers should always pass a baseUrl for GitLab.
      return `https://gitlab.example.invalid/${owner}/${repo}.git`;
    }
    // The clone URL mirrors the web UI's project path:
    // `https://gitlab.example.com/namespace/project.git`. We do NOT
    // percent-encode the slash here because git's HTTPS smart-http
    // transport handles the path verbatim.
    return `${root}/${owner}/${repo}.git`;
  },

  buildBasicAuth({ token }: BuildBasicAuthOpts): { username: string; password: string } {
    // GitLab's documented convention: any string as the username
    // (commonly `oauth2` or empty), PAT as the password. The empty
    // string makes network captures unambiguous: "no user, just a
    // token."
    return { username: '', password: token };
  },

  async fetchDefaultBranch({ baseUrl, owner, repo, token, timeoutMs }: FetchDefaultBranchOpts): Promise<string | null> {
    const apiBase = apiBaseFor(baseUrl ?? '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (token) {
        const auth = Buffer.from(`:${token}`).toString('base64');
        headers.Authorization = `Basic ${auth}`;
      }
      const response = await fetch(
        `${apiBase}/projects/${encodeProjectPath(owner, repo)}`,
        { headers, signal: controller.signal },
      );
      clearTimeout(timeoutId);
      if (!response.ok) return null;
      const json = (await response.json()) as { default_branch?: string };
      return json.default_branch ?? null;
    } catch {
      clearTimeout(timeoutId);
      return null;
    }
  },

  defaultBaseUrl(): string {
    // GitLab has no canonical default — every instance is self-hosted.
    return '';
  },

  displayName(): string {
    return 'GitLab';
  },
};
