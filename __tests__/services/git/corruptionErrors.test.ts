import { isGitCorruptionError } from '@/services/git/corruptionErrors';

describe('isGitCorruptionError', () => {
  it('recognizes the native missing-object error', () => {
    expect(isGitCorruptionError('object not found - no match for id (abc123)')).toBe(true);
  });

  it('preserves existing corruption matches without matching unrelated errors', () => {
    expect(isGitCorruptionError('Packfile trailer mismatch')).toBe(true);
    expect(isGitCorruptionError('Bad credentials')).toBe(false);
  });
});
