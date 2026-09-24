/**
 * Versioned, typed JSON contracts for stable API errors.
 *
 * All errors under /api/v1 use this contract. Error codes are stable —
 * they never change between versions, so clients can rely on them.
 * Internal details are redacted; only safe, user-facing fields are included.
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

// ── Error domain types ────────────────────────────────────────────────────────

/**
 * Machine-readable error code. Each code maps to exactly one HTTP status.
 * New error codes can be added in future API versions.
 */
export type ErrorCode =
  // 400 Bad Request
  | 'MALFORMED_REQUEST'
  | 'INVALID_CREDENTIAL_KIND'
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_REPO_ID_FORMAT'
  // 401 Unauthorized
  | 'CREDENTIAL_EXPIRED'
  | 'CREDENTIAL_REVOKED'
  | 'CREDENTIAL_NOT_FOUND'
  // 403 Forbidden
  | 'INSUFFICIENT_SCOPE'
  | 'REPOSITORY_ACCESS_DENIED'
  | 'REPOSITORY_NOT_IN_ALLOWLIST'
  | 'OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS'
  // 404 Not Found
  | 'REPOSITORY_NOT_FOUND'
  | 'CREDENTIAL_NOT_ACCESSIBLE'
  // 409 Conflict
  | 'REPOSITORY_ALREADY_EXISTS'
  // 422 Unprocessable Entity
  | 'VALIDATION_ERROR'
  // 429 Too Many Requests
  | 'RATE_LIMITED'
  // 500 Internal Server Error
  | 'INTERNAL_ERROR'
  // 503 Service Unavailable
  | 'PROVIDER_UNAVAILABLE';

/**
 * HTTP status that corresponds to each error code.
 * Used to set the response status and for client-side routing.
 */
export const ERROR_CODE_STATUS: Record<ErrorCode, number> = {
  MALFORMED_REQUEST: 400,
  INVALID_CREDENTIAL_KIND: 400,
  MISSING_REQUIRED_FIELD: 400,
  INVALID_REPO_ID_FORMAT: 400,
  CREDENTIAL_EXPIRED: 401,
  CREDENTIAL_REVOKED: 401,
  CREDENTIAL_NOT_FOUND: 401,
  INSUFFICIENT_SCOPE: 403,
  REPOSITORY_ACCESS_DENIED: 403,
  REPOSITORY_NOT_IN_ALLOWLIST: 403,
  OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS: 403,
  REPOSITORY_NOT_FOUND: 404,
  CREDENTIAL_NOT_ACCESSIBLE: 404,
  REPOSITORY_ALREADY_EXISTS: 409,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  PROVIDER_UNAVAILABLE: 503,
} as const;

// ── Error response shape ─────────────────────────────────────────────────────

/**
 * The canonical error response body for all /api/v1 endpoints.
 * Always includes `code`, `version`, and `message`.
 * Optional `details` field carries structured metadata when available.
 */
export interface ApiError {
  /** API contract version. */
  readonly version: 1;
  /** Machine-readable error code. */
  readonly code: ErrorCode;
  /**
   * Human-readable message safe to display in UI.
   * Never contains internal paths, tokens, or stack traces.
   */
  readonly message: string;
  /**
   * Optional structured details field.
   * Only present when the error carries additional machine-readable context.
   * The shape of `details` varies by error code and is documented
   * alongside each error code in this file.
   */
  readonly details?: ApiErrorDetails;
}

/**
 * Discriminated union of structured error details.
 * Each error code that carries structured details has its own variant.
 */
export type ApiErrorDetails =
  | CredentialExpiredDetails
  | InsufficientScopeDetails
  | ValidationErrorDetails
  | RateLimitedDetails;

export interface CredentialExpiredDetails {
  readonly kind: 'credential_expired';
  /** ISO 8601 / RFC 3339 expiry timestamp. */
  readonly expiredAt: string;
  /** Hint: suggest token refresh or re-authentication. */
  readonly hint: 'refresh' | 'reauthenticate';
}

export interface InsufficientScopeDetails {
  readonly kind: 'insufficient_scope';
  /** The scope that was required but missing. */
  readonly requiredScope: string;
  /** The scopes the token currently has. */
  readonly currentScopes: readonly string[];
}

export interface ValidationErrorDetails {
  readonly kind: 'validation_error';
  /** Field-level validation failures. */
  readonly fieldErrors: readonly FieldError[];
}

export interface FieldError {
  readonly field: string;
  readonly message: string;
}

export interface RateLimitedDetails {
  readonly kind: 'rate_limited';
  /**
   * Unix timestamp (seconds) when the client may retry.
   * Omitted when the server does not advertise a retry-after.
   */
  readonly retryAfter?: number;
  /** Human-readable reset time in the client's timezone. */
  readonly resetsAt?: string;
}

// ── Error constructors (stable, public API) ──────────────────────────────────

export function makeApiError(
  code: ErrorCode,
  message: string,
  details?: ApiErrorDetails,
): ApiError {
  const err: ApiError = details === undefined
    ? { version: 1 as const, code, message }
    : { version: 1 as const, code, message, details };
  return Object.freeze(err);
}

/** Convenience: 400 MALFORMED_REQUEST. */
export function errorMalformedRequest(message: string): ApiError {
  return makeApiError('MALFORMED_REQUEST', message);
}

/** Convenience: 400 INVALID_CREDENTIAL_KIND. */
export function errorInvalidCredentialKind(message: string): ApiError {
  return makeApiError('INVALID_CREDENTIAL_KIND', message);
}

/** Convenience: 400 MISSING_REQUIRED_FIELD. */
export function errorMissingRequiredField(field: string): ApiError {
  return makeApiError('MISSING_REQUIRED_FIELD', `Missing required field: ${field}`);
}

/** Convenience: 400 INVALID_REPO_ID_FORMAT. */
export function errorInvalidRepoIdFormat(id: string): ApiError {
  return makeApiError('INVALID_REPO_ID_FORMAT', `Invalid repository identifier format: ${id}`);
}

/** Convenience: 401 CREDENTIAL_EXPIRED. */
export function errorCredentialExpired(expiredAt: string, hint: 'refresh' | 'reauthenticate' = 'reauthenticate'): ApiError {
  return makeApiError('CREDENTIAL_EXPIRED', 'The credential has expired.', {
    kind: 'credential_expired',
    expiredAt,
    hint,
  } satisfies CredentialExpiredDetails);
}

/** Convenience: 401 CREDENTIAL_REVOKED. */
export function errorCredentialRevoked(): ApiError {
  return makeApiError('CREDENTIAL_REVOKED', 'The credential has been revoked.');
}

/** Convenience: 401 CREDENTIAL_NOT_FOUND. */
export function errorCredentialNotFound(): ApiError {
  return makeApiError('CREDENTIAL_NOT_FOUND', 'No such credential is registered.');
}

/** Convenience: 403 INSUFFICIENT_SCOPE. */
export function errorInsufficientScope(
  requiredScope: string,
  currentScopes: readonly string[],
): ApiError {
  return makeApiError('INSUFFICIENT_SCOPE', `Token is missing the '${requiredScope}' scope.`, {
    kind: 'insufficient_scope',
    requiredScope,
    currentScopes,
  } satisfies InsufficientScopeDetails);
}

/** Convenience: 403 REPOSITORY_ACCESS_DENIED. */
export function errorRepositoryAccessDenied(): ApiError {
  return makeApiError(
    'REPOSITORY_ACCESS_DENIED',
    'The credential does not have access to this repository.',
  );
}

/** Convenience: 403 REPOSITORY_NOT_IN_ALLOWLIST. */
export function errorRepositoryNotInAllowlist(repoId: string): ApiError {
  return makeApiError(
    'REPOSITORY_NOT_IN_ALLOWLIST',
    'This repository is not in the sync allowlist.',
    // Note: intentionally omitting repoId from public message to avoid
    // confirming repo existence to unauthenticated callers.
  );
}

/** Convenience: 404 REPOSITORY_NOT_FOUND. */
export function errorRepositoryNotFound(): ApiError {
  return makeApiError('REPOSITORY_NOT_FOUND', 'Repository not found.');
}

/** Convenience: 422 VALIDATION_ERROR. */
export function errorValidation(fieldErrors: readonly FieldError[]): ApiError {
  return makeApiError('VALIDATION_ERROR', 'Request validation failed.', {
    kind: 'validation_error',
    fieldErrors,
  } satisfies ValidationErrorDetails);
}

/** Convenience: 429 RATE_LIMITED. */
export function errorRateLimited(retryAfter?: number, resetsAt?: string): ApiError {
  return makeApiError('RATE_LIMITED', 'Rate limit exceeded. Please try again later.', {
    kind: 'rate_limited',
    ...(retryAfter !== undefined ? { retryAfter } : {}),
    ...(resetsAt !== undefined ? { resetsAt } : {}),
  } satisfies RateLimitedDetails);
}

/** Convenience: 500 INTERNAL_ERROR. */
export function errorInternal(): ApiError {
  return makeApiError('INTERNAL_ERROR', 'An internal error occurred. Please try again.');
}

/** Convenience: 503 PROVIDER_UNAVAILABLE. */
export function errorProviderUnavailable(provider: string): ApiError {
  return makeApiError('PROVIDER_UNAVAILABLE', `The ${provider} service is temporarily unavailable.`);
}

// ── HTTP status helpers ───────────────────────────────────────────────────────

/** Extract the HTTP status code for a given error code. */
export function httpStatusForError(code: ErrorCode): number {
  return ERROR_CODE_STATUS[code];
}

/** True when the error code represents a client error (4xx). */
export function isClientError(code: ErrorCode): boolean {
  const status = ERROR_CODE_STATUS[code];
  return status >= 400 && status < 500;
}

/** True when the error code represents a server error (5xx). */
export function isServerError(code: ErrorCode): boolean {
  const status = ERROR_CODE_STATUS[code];
  return status >= 500;
}

/** True when the error is retryable (network errors, server errors, rate limits). */
export function isRetryable(code: ErrorCode): boolean {
  return code === 'RATE_LIMITED' || code === 'PROVIDER_UNAVAILABLE' || isServerError(code);
}

// ── Parsing incoming error responses ─────────────────────────────────────────

/** Parse an incoming JSON error body. Returns null if it cannot be parsed. */
export function parseApiErrorResponse(body: unknown): ApiError | null {
  if (typeof body !== 'object' || body === null) return null;
  const obj = body as Record<string, unknown>;
  if (obj.version !== 1) return null;
  if (typeof obj.code !== 'string') return null;
  if (typeof obj.message !== 'string') return null;
  const code = obj.code as string;
  const validCodes: ErrorCode[] = [
    'MALFORMED_REQUEST', 'INVALID_CREDENTIAL_KIND', 'MISSING_REQUIRED_FIELD',
    'INVALID_REPO_ID_FORMAT', 'CREDENTIAL_EXPIRED', 'CREDENTIAL_REVOKED',
    'CREDENTIAL_NOT_FOUND', 'INSUFFICIENT_SCOPE', 'REPOSITORY_ACCESS_DENIED',
    'REPOSITORY_NOT_IN_ALLOWLIST', 'OAUTH_TOKEN_INSUFFICIENT_PERMISSIONS',
    'REPOSITORY_NOT_FOUND', 'CREDENTIAL_NOT_ACCESSIBLE', 'REPOSITORY_ALREADY_EXISTS',
    'VALIDATION_ERROR', 'RATE_LIMITED', 'INTERNAL_ERROR', 'PROVIDER_UNAVAILABLE',
  ];
  if (!validCodes.includes(code as ErrorCode)) return null;
  const parsedDetails = obj.details !== undefined ? obj.details as ApiErrorDetails : undefined;
  const result: ApiError = {
    version: 1 as const,
    code: code as ErrorCode,
    message: obj.message as string,
  };
  if (parsedDetails !== undefined) {
    (result as { details: ApiErrorDetails }).details = parsedDetails;
  }
  return Object.freeze(result);
}
