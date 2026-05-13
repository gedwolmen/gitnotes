import { formatSyncError } from '../../src/services/git/formatSyncError';

describe('formatSyncError', () => {
  test('maps raw Axios 409 copy to a GitHub conflict message', () => {
    expect(formatSyncError('Request failed with status code 409', 'upsert')).toBe(
      'This file changed on GitHub. Pull and try again.',
    );
  });

  test('falls back for unknown sync errors', () => {
    expect(formatSyncError('Something unusual happened', 'upsert')).toBe('Sync to GitHub failed');
  });
});
