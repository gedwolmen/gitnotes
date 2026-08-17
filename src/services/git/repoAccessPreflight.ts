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
      return probeWriteAccess(url, token);
    }
    return classifyResponse(errorDetails);
  } catch {
    return failure('transient', 'GitHub repository access could not be verified right now.');
  }
}

/**
 * Fine-grained PATs only advertise `metadata:read` on `GET /repos` regardless
 * of their real write capability, so the header/`permissions.push` fast path
 * produces a false negative. Prove (or disprove) write access by creating a
 * throwaway file, then best-effort delete it.
 */
async function probeWriteAccess(url: string, token: string): Promise<RepoAccessResult> {
  const fileName = `.gitnotes-preflight-${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
  const probeUrl = `${url}/contents/${fileName}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  let putResponse: Response;
  try {
    putResponse = await fetch(probeUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ message: 'GitNotes write preflight', content: 'cHJlZmxpZ2h0' }),
    });
  } catch {
    return failure('transient', 'GitHub repository access could not be verified right now.');
  }

  if (putResponse.ok) {
    let sha: string | undefined;
    try {
      const body = (await putResponse.json()) as { content?: { sha?: string }; sha?: string };
      sha = body.content?.sha ?? body.sha;
    } catch {
      // Cleanup is best-effort; missing sha only means we skip the delete.
    }
    await cleanupProbeFile(probeUrl, token, sha);
    return { kind: 'ok', writeVerified: true };
  }

  let responseBody: unknown;
  try {
    responseBody = await putResponse.json();
  } catch {
    responseBody = undefined;
  }
  const errorDetails = extractHttpErrorDetails({
    response: {
      data: responseBody,
      status: putResponse.status,
      headers: captureResponseHeaders(putResponse.headers),
    },
  });
  return classifyResponse(errorDetails);
}

async function cleanupProbeFile(probeUrl: string, token: string, sha: string | undefined): Promise<void> {
  if (!sha) return;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  const body = JSON.stringify({ message: 'GitNotes preflight cleanup', sha });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(probeUrl, {
        method: 'DELETE',
        headers,
        body,
      });
      if (response.ok) return;
    } catch {
      // Ignore; cleanup is best-effort and must not affect the write verdict.
    }
  }
}

export const checkGitHubRepoAccess = preflightGitHubRepoAccess;
