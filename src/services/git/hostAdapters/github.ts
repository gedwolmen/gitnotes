import type {
  BuildBasicAuthOpts,
  BuildRemoteUrlOpts,
  FetchDefaultBranchOpts,
  GitHostAdapter,
} from './types';

const GITHUB_DEFAULT_BASE = 'https://github.com';
const GITHUB_API_DEFAULT_BASE = 'https://api.github.com';
const FETCH_TIMEOUT_MS = 30_000;

/**
 * Strip trailing slashes and any `.git` suffix from a user-pasted URL.
 * Returns the scheme+host(+path) the rest of the adapter can build
 * URLs against.
 */
function normaliseBaseUrl(input: string | undefined): string {
  if (!input) return GITHUB_DEFAULT_BASE;
  return input.replace(/\/+$/, '');
}

export const githubAdapter: GitHostAdapter = {
  kind: 'github',

  buildRemoteUrl({ baseUrl, owner, repo }: BuildRemoteUrlOpts): string {
    return `${normaliseBaseUrl(baseUrl)}/${owner}/${repo}.git`;
  },

  buildBasicAuth({ token }: BuildBasicAuthOpts): { username: string; password: string } {
    // GitHub's HTTP Basic auth convention: any string works as the
    // username; the PAT goes in the password slot. The legacy
    // x-access-token sentinel is also accepted and is what the
    // existing `gitHttp.ts` shipped with, so we keep it for parity.
    return { username: 'x-access-token', password: token };
  },

  async fetchDefaultBranch({ baseUrl, owner, repo, token, timeoutMs }: FetchDefaultBranchOpts): Promise<string | null> {
    const apiBase = normaliseBaseUrl(baseUrl) === GITHUB_DEFAULT_BASE
      ? GITHUB_API_DEFAULT_BASE
      : normaliseBaseUrl(baseUrl).replace(/\/api\/v3$/, '') + '/api/v3';
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${apiBase}/repos/${owner}/${repo}`, {
        headers,
        signal: controller.signal,
      });
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
    return GITHUB_DEFAULT_BASE;
  },

  displayName(): string {
    return 'GitHub';
  },
};
