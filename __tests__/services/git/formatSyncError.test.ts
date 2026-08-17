import { describe, expect, test } from '@jest/globals';
import { formatSyncError } from '../../../src/services/git/formatSyncError';

describe('formatSyncError', () => {
  test('maps a 403 to a scopes message instead of mislabeling it a rate limit', () => {
    const message = formatSyncError('GitHub API error: 403');
    expect(message).toContain('token');
    expect(message).toContain('Contents: Read and write');
    expect(message).not.toContain('rate limit');
  });

  test('maps a 403 with a GitHub permission reason to the scopes message', () => {
    const message = formatSyncError('GitHub API error: 403 (Resource not accessible by integration)');
    expect(message).toContain('Contents: Read and write');
    expect(message).not.toContain('rate limit');
  });

  test('keeps a genuine rate-limit 403 on the rate-limit message', () => {
    const message = formatSyncError('GitHub API error: 403 (API rate limit exceeded for 1.2.3.4)');
    expect(message).toBe('GitHub rate limit hit — try again in a few minutes.');
  });

  test('maps an explicit 429 to the rate-limit message', () => {
    const message = formatSyncError('GitHub API error: 429');
    expect(message).toBe('GitHub rate limit hit — try again in a few minutes.');
  });

  test.each([
    ['push rejected', 'Someone else changed this on GitHub. Pull and try again.'],
    ['GitHub API error: 401', 'Sign in to GitHub again.'],
    ['GitHub API error: 409', 'This file changed on GitHub. Pull and try again.'],
    ['GitHub API error: 422', 'GitHub rejected the change. Try again.'],
    ['GitHub API error: 503', 'GitHub is having trouble — will retry.'],
    ['Network Error', "No connection. Will retry when you're back online."],
  ])('preserves the existing behavior for %s', (raw, expected) => {
    expect(formatSyncError(raw)).toBe(expected);
  });

  test('strips jargon and returns the deliberate fallback for unknown errors', () => {
    const message = formatSyncError('Error: something went wrong in (src/foo/bar.ts:12:34)');
    expect(message).toBe('Sync to GitHub failed');
  });

  test('uses the delete fallback when the operation is a delete', () => {
    expect(formatSyncError('weird unknown errz', 'delete')).toBe("Couldn't delete from GitHub");
  });
});