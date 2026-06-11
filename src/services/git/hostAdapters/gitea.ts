import type {
  BuildBasicAuthOpts,
  BuildRemoteUrlOpts,
  FetchDefaultBranchOpts,
  GitHostAdapter,
} from './types';

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Gitea / Forgejo adapter.
 *
 * Both Gitea (gitea.io) and its community fork Forgejo (forgejo.org)
 * speak the same REST API and use the same Basic auth convention,
 * so a single adapter covers both. The user only needs to point
 * `baseUrl` at the right origin — the API path is identical.
 */
function normaliseBaseUrl(input: string | undefined): string {
  if (!input) return '';
  return input.replace(/\/+$/, '');
}

function apiBaseFor(baseUrl: string): string {
  const root = normaliseBaseUrl(baseUrl);
  if (!root) return '/api/v1';
  // Gitea/Forgejo always mount the API at /api/v1 of the same origin.
  return `${root}/api/v1`;
}

export const giteaAdapter: GitHostAdapter = {
  kind: 'gitea',

  buildRemoteUrl({ baseUrl, owner, repo }: BuildRemoteUrlOpts): string {
    const root = normaliseBaseUrl(baseUrl);
    if (!root) {
      // Gitea is never the default — gitnotes assumes GitHub.com if
      // no baseUrl is provided. Callers should always pass a baseUrl
      // for self-hosted instances.
      return `https://gitea.com/${owner}/${repo}.git`;
    }
    return `${root}/${owner}/${repo}.git`;
  },

  buildBasicAuth({ token }: BuildBasicAuthOpts): { username: string; password: string } {
    // Gitea's documented Basic auth convention: username is `oauth2`
    // and the personal access token (or application token) goes in
    // the password slot. Forgejo inherited this verbatim.
    return { username: 'oauth2', password: token };
  },

  async fetchDefaultBranch({ baseUrl, owner, repo, token, timeoutMs }: FetchDefaultBranchOpts): Promise<string | null> {
    const apiBase = apiBaseFor(baseUrl ?? '');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs ?? FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      };
      if (token) {
        const auth = Buffer.from(`oauth2:${token}`).toString('base64');
        headers.Authorization = `Basic ${auth}`;
      }
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
    // Gitea has no canonical "default" — every instance is self-hosted.
    // Return empty string so callers know to require an explicit baseUrl.
    return '';
  },

  displayName(): string {
    return 'Gitea';
  },
};
