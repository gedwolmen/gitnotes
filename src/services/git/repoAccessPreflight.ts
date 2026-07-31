import { classifyGitHubSyncError } from './syncFailure';
import { parseRepoPath } from '../../utils/gitPathParser';

export type RepoAccessResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'no_access'; readonly message: string }
  | { readonly kind: 'no_write'; readonly message: string }
  | { readonly kind: 'saml_required'; readonly message: string }
  | { readonly kind: 'rate_limited'; readonly message: string }
  | { readonly kind: 'transient'; readonly message: string };

export class RepoAccessPreflightError extends Error {
  readonly name = 'RepoAccessPreflightError';

  constructor(readonly result: Exclude<RepoAccessResult, { readonly kind: 'ok' }>) {
    super(result.message);
  }
}

type RepoResponse = {
  readonly message?: string;
  readonly permissions?: {
    readonly push?: boolean;
  };
};

function responseDetails(value: unknown): RepoResponse {
  if (typeof value !== 'object' || value === null) return {};
  if (!('message' in value) && !('permissions' in value)) return {};

  const message = 'message' in value && typeof value.message === 'string' ? value.message : undefined;
  const permissionsValue = 'permissions' in value ? value.permissions : undefined;
  if (typeof permissionsValue !== 'object' || permissionsValue === null) return { message };
  const push = 'push' in permissionsValue && typeof permissionsValue.push === 'boolean'
    ? permissionsValue.push
    : undefined;
  return { message, permissions: { push } };
}

function failure(kind: Exclude<RepoAccessResult['kind'], 'ok'>, message: string): RepoAccessResult {
  return { kind, message };
}

function classifyResponse(status: number, details: RepoResponse): RepoAccessResult {
  const classified = classifyGitHubSyncError({ message: details.message }, status);
  switch (classified.kind) {
    case 'not_found':
    case 'authentication':
      return failure('no_access', 'This GitHub repository is not accessible with the current account.');
    case 'saml':
      return failure('saml_required', 'GitHub requires SAML SSO authorization for this repository.');
    case 'rate_limit':
      return failure('rate_limited', 'GitHub is rate limiting requests. Please try again later.');
    case 'permission':
      return failure('no_write', 'The current GitHub account cannot write to this repository.');
    case 'server':
    case 'network':
    case 'unknown':
    case 'conflict':
      return failure('transient', 'GitHub repository access could not be verified right now.');
    default: {
      const exhaustiveCheck: never = classified.kind;
      return exhaustiveCheck;
    }
  }
}

export async function checkGitHubRepoAccess(repoPath: string, token: string): Promise<RepoAccessResult> {
  const parsed = parseRepoPath(repoPath);
  if (!parsed) return failure('no_access', 'The GitHub repository path is invalid or inaccessible.');

  const url = `https://api.github.com/repos/${encodeURIComponent(parsed.owner)}/${encodeURIComponent(parsed.repo)}`;
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });
    let details: RepoResponse = {};
    try {
      details = responseDetails(await response.json());
    } catch {
      if (response.ok) return failure('transient', 'GitHub repository access could not be verified right now.');
    }

    if (response.ok) {
      if (details.permissions?.push === false) {
        return failure('no_write', 'The current GitHub account cannot write to this repository.');
      }
      return { kind: 'ok' };
    }
    return classifyResponse(response.status, details);
  } catch {
    return failure('transient', 'GitHub repository access could not be verified right now.');
  }
}
