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

export type HttpErrorDetails = {
  readonly message?: string;
  readonly status?: number;
  readonly headers?: Record<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function extractStringHeaders(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;

  const headers: Record<string, string> = {};
  Object.entries(value).forEach(([name, headerValue]) => {
    if (typeof headerValue === 'string') headers[name] = headerValue;
  });
  return Object.keys(headers).length === 0 ? undefined : headers;
}

export function extractHttpErrorDetails(error: unknown): HttpErrorDetails {
  if (typeof error === 'string') return { message: error };
  if (!isRecord(error)) return {};

  const response = isRecord(error.response) ? error.response : undefined;
  const responseData = response && isRecord(response.data) ? response.data : undefined;
  const status = typeof response?.status === 'number'
    ? response.status
    : typeof error.status === 'number' ? error.status : undefined;
  const headers = extractStringHeaders(response?.headers) ?? extractStringHeaders(error.headers);
  const message = typeof responseData?.message === 'string'
    ? responseData.message
    : typeof error.message === 'string' ? error.message : undefined;

  return {
    ...(status === undefined ? {} : { status }),
    ...(headers === undefined ? {} : { headers }),
    ...(message === undefined ? {} : { message }),
  };
}

function hasHeader(headers: Record<string, string> | undefined, name: string): boolean {
  return Object.keys(headers ?? {}).some((headerName) => headerName.toLowerCase() === name);
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  const headerName = Object.keys(headers ?? {}).find((candidate) => candidate.toLowerCase() === name);
  return headerName ? headers?.[headerName] : undefined;
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

export function syncStatusForError(message?: string): number | undefined {
  if (!message) return undefined;
  const statusMatch = message.match(/\b(401|403|404|409|429|5\d{2})\b/);
  if (statusMatch?.[1]) return Number(statusMatch[1]);
  if (/not authenticated/i.test(message)) return 401;
  if (/conflict/i.test(message)) return 409;
  if (/rate limit|rate-limit|ratelimit|too many requests/i.test(message)) return 403;
  return undefined;
}

export function classifyGitHubSyncError(
  error: unknown,
  status?: number,
  headers?: Record<string, string>,
): GitHubSyncFailure {
  const details = extractHttpErrorDetails(error);
  const resolvedStatus = status ?? details.status;
  const resolvedHeaders = headers ?? details.headers;
  const message = sanitizeMessage(details.message);
  const haystack = message.toLowerCase();
  const hasSamlSignal = haystack.includes('saml') || haystack.includes('x-github-sso');
  const hasRateLimitSignal = haystack.includes('rate limit') || haystack.includes('rate-limit')
    || haystack.includes('ratelimit') || haystack.includes('too many requests');
  const hasSamlHeader = hasHeader(resolvedHeaders, 'x-github-sso');
  const rateLimitRemaining = headerValue(resolvedHeaders, 'x-ratelimit-remaining');
  const hasRateLimitHeader = rateLimitRemaining?.trim() === '0'
    || hasHeader(resolvedHeaders, 'retry-after');

  if (resolvedStatus === 401) return failure('authentication', message, false, resolvedStatus);
  if (resolvedStatus === 403 && (hasSamlHeader || hasSamlSignal)) return failure('saml', message, false, resolvedStatus);
  if (resolvedStatus === 403 && (hasRateLimitHeader || hasRateLimitSignal)) return failure('rate_limit', message, true, resolvedStatus);
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
