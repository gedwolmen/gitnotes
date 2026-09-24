import { requireNativeModule } from 'expo-modules-core';

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({
    pull: jest.fn(),
    fetch: jest.fn(),
    getCredential: jest.fn(),
    setCredential: jest.fn(),
    clearCredential: jest.fn(),
  })),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getHostConnection: jest.fn(),
  },
}));

import * as GitEngine from '@/services/git/engine/GitEngine';
import { AccountStorage } from '@/services/AccountStorage';

const mockAccountStorage = AccountStorage as jest.Mocked<typeof AccountStorage>;

const nativeModule = (requireNativeModule as jest.Mock).mock.results[0].value as {
  pull: jest.Mock;
  fetch: jest.Mock;
  getCredential: jest.Mock;
  setCredential: jest.Mock;
  clearCredential: jest.Mock;
};

describe('GitEngine.pull', () => {
  beforeEach(() => {
    nativeModule.pull.mockReset();
    nativeModule.getCredential.mockResolvedValue(null);
    nativeModule.setCredential.mockResolvedValue(undefined);
  });

  it('maps a native fast-forward result to the facade success contract', async () => {
    nativeModule.pull.mockResolvedValue({ kind: 'FastForward', message: 'updated', conflicts: [] });

    const result = await GitEngine.pull('/repo', 'origin');

    expect(result).toEqual({ ok: true });
  });

  it('maps a native conflict result to the facade failure contract', async () => {
    nativeModule.pull.mockResolvedValue({
      kind: 'Conflict',
      message: 'merge conflict',
      conflicts: [{ path: 'notes/example.md', ours: null, theirs: null, ancestor: null, status: 'both' }],
    });

    const result = await GitEngine.pull('/repo', 'origin');

    expect(result).toEqual({ ok: false, error: 'merge conflict' });
  });

  it('retries once on auth failure and throws on second failure', async () => {
    nativeModule.pull
      .mockRejectedValueOnce(new Error('authentication failed'))
      .mockResolvedValueOnce({ kind: 'FastForward', message: 'updated', conflicts: [] });

    const result = await GitEngine.pull('/repo', 'origin', 'github:default/owner/repo');

    expect(result).toEqual({ ok: true });
    expect(nativeModule.clearCredential).toHaveBeenCalledWith('github:default/owner/repo');
  });

  it('returns typed error when auth retry also fails', async () => {
    nativeModule.pull.mockRejectedValue(new Error('authentication failed'));

    const result = await GitEngine.pull('/repo', 'origin', 'github:default/owner/repo');

    expect(result.ok).toBe(false);
    expect(result.error).toBe('authentication failed');
    expect((result as { kind?: string }).kind).toBe('auth');
  });
});

describe('GitEngine.fetch', () => {
  beforeEach(() => {
    nativeModule.fetch.mockReset();
    nativeModule.getCredential.mockResolvedValue(null);
    nativeModule.setCredential.mockResolvedValue(undefined);
  });

  it('retries once on auth failure and succeeds on retry', async () => {
    nativeModule.fetch
      .mockRejectedValueOnce(new Error('authentication failed'))
      .mockResolvedValueOnce(undefined);

    await GitEngine.fetch('/repo', 'origin', 'github:default/owner/repo');

    expect(nativeModule.fetch).toHaveBeenCalledTimes(2);
    expect(nativeModule.clearCredential).toHaveBeenCalledWith('github:default/owner/repo');
  });

  it('throws typed error when auth retry also fails', async () => {
    nativeModule.fetch.mockRejectedValue(new Error('authentication failed'));

    try {
      await GitEngine.fetch('/repo', 'origin', 'github:default/owner/repo');
      throw new Error('should have thrown');
    } catch (error: unknown) {
      expect((error as Error).message).toBe('authentication failed');
      expect((error as { kind?: string }).kind).toBe('auth');
    }
  });
});

describe('classifyGitError', () => {
  it('classifies authentication errors', () => {
    const error = new Error('authentication failed');
    expect(GitEngine.classifyGitError(error)).toBe('auth');
  });

  it('classifies network errors', () => {
    const error = new Error('network connection refused');
    expect(GitEngine.classifyGitError(error)).toBe('network');
  });

  it('classifies permission errors', () => {
    const error = new Error('access denied');
    expect(GitEngine.classifyGitError(error)).toBe('permission');
  });

  it('classifies corruption errors', () => {
    const error = new Error('repository corrupt');
    expect(GitEngine.classifyGitError(error)).toBe('corruption');
  });

  it('returns unknown for unclassified errors', () => {
    const error = new Error('something went wrong');
    expect(GitEngine.classifyGitError(error)).toBe('unknown');
  });
});
