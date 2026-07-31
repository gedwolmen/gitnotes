export type GitHubSyncFailure = {
  readonly kind:
    | 'authentication'
    | 'permission'
    | 'saml'
    | 'rate_limit'
    | 'conflict'
    | 'not_found'
    | 'server'
    | 'network'
    | 'unknown';
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
};

type ErrorDetails = {
  readonly message?: string;
  readonly status?: number;
};

function errorDetails(error: unknown): ErrorDetails {
  if (typeof error !== 'object' || error === null) return {};

  const details: { message?: string; status?: number } = {};
  if ('message' in error && typeof error.message === 'string') details.message = error.message;
  if ('status' in error && typeof error.status === 'number') details.status = error.status;
  return details;
}

function sanitizeMessage(message: string | undefined): string {
  return message?.replace(/Bearer\s+\S+/gi, 'Bearer ***').trim() || 'Unknown GitHub sync failure';
}

function failure(
  kind: GitHubSyncFailure['kind'],
  message: string,
  retryable: boolean,
  status: number | undefined,
): GitHubSyncFailure {
  return status === undefined ? { kind, message, retryable } : { kind, message, retryable, status };
}

export function classifyGitHubSyncError(error: unknown, status?: number): GitHubSyncFailure {
  const details = errorDetails(error);
  const resolvedStatus = status ?? details.status;
  const message = sanitizeMessage(details.message);
  const haystack = message.toLowerCase();
  const hasSamlSignal = haystack.includes('saml') || haystack.includes('x-github-sso');
  const hasRateLimitSignal = haystack.includes('rate limit') || haystack.includes('rate-limit')
    || haystack.includes('ratelimit') || haystack.includes('too many requests');

  if (resolvedStatus === 401) return failure('authentication', message, false, resolvedStatus);
  if (resolvedStatus === 403 && hasSamlSignal) return failure('saml', message, false, resolvedStatus);
  if (resolvedStatus === 403 && hasRateLimitSignal) return failure('rate_limit', message, true, resolvedStatus);
  if (resolvedStatus === 403) return failure('permission', message, false, resolvedStatus);
  if (resolvedStatus === 429) return failure('rate_limit', message, true, resolvedStatus);
  if (resolvedStatus === 409) return failure('conflict', message, false, resolvedStatus);
  if (resolvedStatus === 404) return failure('not_found', message, false, resolvedStatus);
  if (resolvedStatus !== undefined && resolvedStatus >= 500 && resolvedStatus <= 599) {
    return failure('server', message, true, resolvedStatus);
  }

  const networkSignal = /network|offline|fetch|econn|timeout|connection|enotfound|dns/i.test(haystack);
  if (networkSignal) return failure('network', message, true, resolvedStatus);
  return failure('unknown', message, true, resolvedStatus);
}

export function isRetryableFailure(failureResult: GitHubSyncFailure): boolean {
  switch (failureResult.kind) {
    case 'rate_limit':
    case 'server':
    case 'network':
    case 'unknown':
      return true;
    case 'authentication':
    case 'permission':
    case 'saml':
    case 'conflict':
    case 'not_found':
      return false;
    default: {
      const exhaustiveCheck: never = failureResult.kind;
      return exhaustiveCheck;
    }
  }
}
