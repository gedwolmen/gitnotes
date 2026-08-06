import { classifyGitHubSyncError, extractHttpErrorDetails } from './syncFailure';
import { parseRepoPath } from '../../utils/gitPathParser';

export type RepoAccessResult =
  | { readonly kind: 'ok'; readonly writeVerified: true }
  | { readonly kind: 'write_unverified'; readonly message: string }
  | { readonly kind: 'no_access'; readonly message: string }
  | { readonly kind: 'transient'; readonly message: string };

export class RepoAccessPreflightError extends Error {
  readonly name = 'RepoAccessPreflightError';

  constructor(
    readonly result: Exclude<RepoAccessResult, { readonly kind: 'ok' }>,
    readonly canRetry: boolean = false,
  ) {
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

const RESPONSE_HEADER_NAMES = [
  'x-github-sso',
  'x-accepted-github-permissions',
  'x-ratelimit-remaining',
] as const;

function captureResponseHeaders(headers: Headers): Record<string, string> {
  const captured: Record<string, string> = {};
  RESPONSE_HEADER_NAMES.forEach((name) => {
    const value = headers.get(name);
    if (value !== null) captured[name] = value;
  });
  return captured;
}

function acceptedPermissionsVerifyWrite(value: string): boolean {
  return /\bcontents\s*[:=]\s*write\b/i.test(value);
}

function classifyResponse(errorDetails: ReturnType<typeof extractHttpErrorDetails>): RepoAccessResult {
  const classified = classifyGitHubSyncError(errorDetails);
  switch (classified.kind) {
    case 'not_found':
    case 'authentication':
    case 'saml':
    case 'permission':
      return failure('no_access', 'This GitHub repository is not accessible with the current account.');
    case 'rate_limit':
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

export async function preflightGitHubRepoAccess(repoPath: string, token: string): Promise<RepoAccessResult> {
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
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      if (response.ok) return failure('transient', 'GitHub repository access could not be verified right now.');
    }

    const details = responseDetails(responseBody);
    const errorDetails = extractHttpErrorDetails({
      response: {
        data: responseBody,
        status: response.status,
        headers: captureResponseHeaders(response.headers),
      },
    });

    if (response.ok) {
      const acceptedPermissions = errorDetails.headers?.['x-accepted-github-permissions'];
      const writeVerified = acceptedPermissions !== undefined
        ? acceptedPermissionsVerifyWrite(acceptedPermissions)
        : details.permissions?.push === true;
      if (writeVerified) {
        return { kind: 'ok', writeVerified: true };
      }
      return failure('write_unverified', 'Write access not verified. Do you want to add anyway?');
    }
    return classifyResponse(errorDetails);
  } catch {
    return failure('transient', 'GitHub repository access could not be verified right now.');
  }
}

export const checkGitHubRepoAccess = preflightGitHubRepoAccess;
