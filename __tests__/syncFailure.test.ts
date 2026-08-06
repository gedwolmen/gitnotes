import { describe, expect, test } from '@jest/globals';
import {
  classifyGitHubSyncError,
  extractHttpErrorDetails,
  isRetryableFailure,
  syncStatusForError,
  type GitHubSyncFailure,
} from '../src/services/git/syncFailure';

describe('extractHttpErrorDetails', () => {
  test('extracts the status, headers, and response message from an Axios-style error', () => {
    // Given: GitHub returned structured response details through Axios.
    const error = {
      response: {
        status: 403,
        headers: { 'x-github-sso': 'https://github.com/orgs/example/sso' },
        data: { message: 'SAML required' },
      },
    };

    // When: the error is normalized for sync handling.
    const details = extractHttpErrorDetails(error);

    // Then: all response metadata is preserved for classification.
    expect(details).toEqual({
      status: 403,
      headers: { 'x-github-sso': 'https://github.com/orgs/example/sso' },
      message: 'SAML required',
    });
  });

  test('extracts status and message from a plain Error', () => {
    // Given: a plain error carries a status assigned by the caller.
    const error = Object.assign(new Error('Not found'), { status: 404 });

    // When: the error is normalized for sync handling.
    const details = extractHttpErrorDetails(error);

    // Then: the plain error details are preserved.
    expect(details).toEqual({ status: 404, message: 'Not found' });
  });

  test('uses a thrown string as the message', () => {
    // Given: a transport layer throws a string.
    const error = 'Network timeout';

    // When: the value is normalized for sync handling.
    const details = extractHttpErrorDetails(error);

    // Then: the string remains available as the user-safe message.
    expect(details).toEqual({ message: 'Network timeout' });
  });

  test.each([null, undefined, 403, true])('returns empty details for %p', (error) => {
    // Given: the thrown value has no HTTP error shape.
    // When: the value is normalized for sync handling.
    const details = extractHttpErrorDetails(error);

    // Then: normalization is safe and does not invent details.
    expect(details).toEqual({});
  });
});

describe('classifyGitHubSyncError', () => {
  test('classifies authentication failures from status 401', () => {
    // Given: GitHub rejected the credentials.
    const error = new Error('GitHub API error: 401');

    // When: the delivery error is classified.
    const failure = classifyGitHubSyncError(error, 401);

    // Then: authentication failures are not retryable.
    expect(failure).toEqual({
      kind: 'authentication',
      message: 'GitHub API error: 401',
      retryable: false,
      status: 401,
    });
  });

  test('classifies SAML failures before general permission failures', () => {
    // Given: GitHub requires SAML authorization for the organization.
    const error = new Error('X-GitHub-SSO is required');

    // When: the delivery error is classified.
    const failure = classifyGitHubSyncError(error, 403);

    // Then: the remediation category identifies SAML authorization.
    expect(failure.kind).toBe('saml');
    expect(failure.retryable).toBe(false);
    expect(failure.status).toBe(403);
  });

  test('classifies a GitHub SSO header as SAML regardless of message content', () => {
    // Given: GitHub requires organization SSO but returns a neutral message.
    const error = new Error('Resource not accessible');

    // When: the response header is supplied for classification.
    const failure = classifyGitHubSyncError(error, 403, {
      'X-GitHub-SSO': 'https://github.com/orgs/example/sso',
    });

    // Then: the SSO remediation category takes precedence.
    expect(failure.kind).toBe('saml');
  });

  test('classifies rate-limit failures from a 403 signal', () => {
    // Given: GitHub returned a rate-limit response using status 403.
    const error = new Error('GitHub API rate limit exceeded');

    // When: the delivery error is classified.
    const failure = classifyGitHubSyncError(error, 403);

    // Then: the caller can retry after the limit resets.
    expect(failure.kind).toBe('rate_limit');
    expect(failure.retryable).toBe(true);
  });

  test('classifies an exhausted rate-limit header as rate limited regardless of message content', () => {
    // Given: GitHub reports zero requests remaining with a neutral message.
    const error = new Error('Resource not accessible');

    // When: the response header is supplied for classification.
    const failure = classifyGitHubSyncError(error, 403, { 'x-ratelimit-remaining': '0' });

    // Then: the sync can retry after the quota resets.
    expect(failure.kind).toBe('rate_limit');
  });

  test('classifies a retry-after header as rate limited regardless of message content', () => {
    // Given: GitHub requests a delay before retrying with a neutral message.
    const error = new Error('Resource not accessible');

    // When: the response header is supplied for classification.
    const failure = classifyGitHubSyncError(error, 403, { 'retry-after': '60' });

    // Then: the failure is classified as rate limited.
    expect(failure.kind).toBe('rate_limit');
  });

  test('classifies status 429 as a retryable rate-limit failure', () => {
    // Given: GitHub explicitly reports too many requests.
    const failure = classifyGitHubSyncError(new Error('Too many requests'), 429);

    // When: the retry policy is checked.
    // Then: rate limiting remains retryable.
    expect(failure.kind).toBe('rate_limit');
    expect(isRetryableFailure(failure)).toBe(true);
  });

  test('classifies a non-rate-limit 403 as permission denied', () => {
    // Given: the token cannot write to the repository.
    const failure = classifyGitHubSyncError(new Error('Resource not accessible'), 403);

    // When: the retry policy is checked.
    // Then: retrying cannot fix a permission denial.
    expect(failure.kind).toBe('permission');
    expect(isRetryableFailure(failure)).toBe(false);
  });

  test('classifies conflicts and missing repositories as non-retryable', () => {
    // Given: GitHub reports two configuration or delivery outcomes.
    const conflict = classifyGitHubSyncError(new Error('File changed'), 409);
    const missing = classifyGitHubSyncError(new Error('Repository not found'), 404);

    // When: their retry policies are checked.
    // Then: neither outcome should be retried automatically.
    expect(conflict.kind).toBe('conflict');
    expect(missing.kind).toBe('not_found');
    expect(isRetryableFailure(conflict)).toBe(false);
    expect(isRetryableFailure(missing)).toBe(false);
  });

  test('classifies server responses as retryable', () => {
    // Given: GitHub has a temporary server failure.
    const failure = classifyGitHubSyncError(new Error('GitHub API error: 503'), 503);

    // When: the retry policy is checked.
    // Then: delivery may be attempted again.
    expect(failure.kind).toBe('server');
    expect(isRetryableFailure(failure)).toBe(true);
  });

  test('classifies network errors and removes bearer tokens from the message', () => {
    // Given: the request failed locally and included a credential in its message.
    const failure = classifyGitHubSyncError(new Error('fetch failed: Bearer super-secret-token'));

    // When: the failure is returned to the sync queue.
    // Then: it is retryable without retaining the credential.
    expect(failure.kind).toBe('network');
    expect(failure.retryable).toBe(true);
    expect(failure.message).toBe('fetch failed: Bearer ***');
    expect(failure.message).not.toContain('super-secret-token');
  });

  test('uses a safe retryable fallback for unknown errors', () => {
    // Given: a thrown value has no safe message or status.
    const failure = classifyGitHubSyncError({ detail: 'unexpected failure' });

    // When: the failure is classified.
    // Then: the fallback remains retryable and does not stringify unknown data.
    expect(failure).toEqual({
      kind: 'unknown',
      message: 'Unknown GitHub sync failure',
      retryable: true,
    });
  });

  test('preserves an Error message for an otherwise unknown failure', () => {
    // Given: an Error has no status or known network signal.
    const failure = classifyGitHubSyncError(new Error('Unexpected GitHub response'));

    // When: the failure is classified.
    // Then: the original safe message is retained under the unknown category.
    expect(failure.kind).toBe('unknown');
    expect(failure.message).toBe('Unexpected GitHub response');
  });
});

describe('isRetryableFailure', () => {
  const retryabilityCases: Array<[GitHubSyncFailure['kind'], boolean]> = [
    ['authentication', false],
    ['permission', false],
    ['saml', false],
    ['rate_limit', true],
    ['conflict', false],
    ['not_found', false],
    ['server', true],
    ['network', true],
    ['unknown', true],
  ];

  test.each(retryabilityCases)('returns %s=%s', (kind, retryable) => {
    // Given: a typed failure category with a deliberately opposite flag.
    const failure: GitHubSyncFailure = {
      kind,
      message: 'safe message',
      retryable: !retryable,
    };

    // When: the category predicate is evaluated.
    const result = isRetryableFailure(failure);

    // Then: policy follows the category, not caller-provided metadata.
    expect(result).toBe(retryable);
  });
});

describe('syncStatusForError', () => {
  test.each([
    ['GitHub API error: 401', 401],
    ['GitHub API error: 403', 403],
    ['not authenticated', 401],
    ['sync conflict', 409],
    ['rate limit exceeded', 403],
  ])('maps %p to status %i', (message, status) => {
    // Given: a sync failure message with a recognizable status signal.
    // When: the message is mapped to an HTTP status.
    const resolvedStatus = syncStatusForError(message);

    // Then: the shared classifier receives the matching status.
    expect(resolvedStatus).toBe(status);
  });

  test('returns undefined when a message has no status signal', () => {
    // Given: a message without a known HTTP status signal.
    // When: the message is mapped to an HTTP status.
    const resolvedStatus = syncStatusForError('Unexpected GitHub response');

    // Then: no status is inferred.
    expect(resolvedStatus).toBeUndefined();
  });
});
