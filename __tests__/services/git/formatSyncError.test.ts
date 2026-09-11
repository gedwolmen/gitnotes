import { formatSyncError } from '@/services/git/formatSyncError';

describe('formatSyncError', () => {
  it('uses provider-neutral guidance for rejected credentials', () => {
    const message = formatSyncError('bad credentials');

    expect(message).toContain('provider rejected the token');
    expect(message).not.toContain('GitHub');
    expect(message).not.toContain('ghp_');
  });

  it('explains how to recover from missing repository access', () => {
    const message = formatSyncError('403');

    expect(message).toContain('repository access');
    expect(message).toContain('write permissions');
    expect(message).not.toContain('GitHub');
  });

  it('keeps generic sync fallbacks provider-neutral', () => {
    expect(formatSyncError(undefined)).toBe('Sync failed');
    expect(formatSyncError(undefined, 'delete')).toBe("Couldn't delete from the remote");
  });

  it('gives remote-change recovery guidance without naming a provider', () => {
    const message = formatSyncError('non-fast-forward');

    expect(message).toContain('Pull and try again');
    expect(message).not.toContain('GitHub');
  });
});
