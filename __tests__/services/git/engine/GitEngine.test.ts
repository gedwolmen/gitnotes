import { requireNativeModule } from 'expo-modules-core';

jest.mock('expo-modules-core', () => ({
  requireNativeModule: jest.fn(() => ({
    pull: jest.fn(),
    pushWithIntegrate: jest.fn(),
    getCredential: jest.fn(),
    setCredential: jest.fn(),
  })),
}));

jest.mock('@/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(),
  },
}));

jest.mock('@/services/AccountStorage', () => ({
  AccountStorage: {
    getHostConnection: jest.fn(),
    getHostToken: jest.fn(),
  },
}));

jest.mock('@/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

import * as GitEngine from '@/services/git/engine/GitEngine';
import { AuthService } from '@/services/AuthService';
import { AccountStorage } from '@/services/AccountStorage';
import { StorageService } from '@/services/StorageService';

const nativeModule = (requireNativeModule as jest.Mock).mock.results[0].value as {
  pull: jest.Mock;
  pushWithIntegrate: jest.Mock;
  getCredential: jest.Mock;
  setCredential: jest.Mock;
};

describe('GitEngine.pull', () => {
  beforeEach(() => {
    nativeModule.pull.mockReset();
    nativeModule.pushWithIntegrate.mockReset();
    nativeModule.getCredential.mockReset();
    nativeModule.setCredential.mockReset();
    jest.mocked(AuthService.getToken).mockReset();
    jest.mocked(AccountStorage.getHostConnection).mockReset();
    jest.mocked(AccountStorage.getHostToken).mockReset();
    jest.mocked(StorageService.getSavedRepositories).mockReset();
    nativeModule.pull.mockResolvedValue({ kind: 'UpToDate', message: 'up to date', conflicts: [] });
    nativeModule.pushWithIntegrate.mockResolvedValue({
      ok: false,
      kind: 'Error',
      message: '',
      conflicts: [],
      pushed: 0,
    });
    nativeModule.getCredential.mockResolvedValue(null);
    nativeModule.setCredential.mockResolvedValue(undefined);
    jest.mocked(AuthService.getToken).mockResolvedValue('new-token');
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([]);
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue(null);
    jest.mocked(AccountStorage.getHostToken).mockResolvedValue(null);
  });

  it('maps a native fast-forward result to the facade success contract', async () => {
    nativeModule.pull.mockResolvedValue({ kind: 'FastForward', message: 'updated', conflicts: [] });

    const result = await GitEngine.pull('/repo', 'origin');

    expect(result).toEqual({ ok: true });
  });

  it('maps an unborn native result to the facade success contract', async () => {
    nativeModule.pull.mockResolvedValue({ kind: 'Unborn', message: 'unborn HEAD: nothing to pull', conflicts: [] });

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

  it('refreshes a cached HTTPS credential from the active token', async () => {
    nativeModule.getCredential.mockResolvedValue({
      kind: 'userpass',
      username: 'x-access-token',
      password: 'old-token',
    });

    await GitEngine.pull('/repo', 'origin', 'repo-1');

    expect(nativeModule.setCredential).toHaveBeenCalledWith('repo-1', {
      kind: 'userpass',
      username: 'x-access-token',
      password: 'new-token',
    });
  });

  it('keeps a cached SSH credential instead of replacing it with the active token', async () => {
    const sshCredential = {
      kind: 'ssh',
      username: 'git',
      privateKey: 'private-key',
      publicKey: 'public-key',
      passphrase: null,
    };
    nativeModule.getCredential.mockResolvedValue(sshCredential);

    await GitEngine.pull('/repo', 'origin', 'repo-1');

    expect(nativeModule.setCredential).not.toHaveBeenCalled();
  });

  it('restores a Forgejo credential from the repository host after reload', async () => {
    nativeModule.getCredential.mockResolvedValue(null);
    jest.mocked(StorageService.getSavedRepositories).mockResolvedValue([
      {
        id: 'repo-forgejo',
        path: 'forgeadmin/test-repo',
        name: 'test-repo',
        provider: 'forgejo',
        hostId: 'account:forgejo:instance',
      },
    ]);
    jest.mocked(AccountStorage.getHostConnection).mockResolvedValue({
      id: 'account:forgejo:instance',
      accountId: 'account',
      provider: 'forgejo',
      instanceBaseUrl: 'http://192.168.1.16:3030/api/v1',
      hostLogin: 'forgeadmin',
      hostUserId: 1,
      name: 'Forgejo',
      email: null,
      avatarUrl: null,
      addedAt: 0,
    });
    jest.mocked(AccountStorage.getHostToken).mockResolvedValue('forgejo-token');

    await GitEngine.pull('/repo', 'origin', 'repo-forgejo');

    expect(nativeModule.setCredential).toHaveBeenCalledWith('repo-forgejo', {
      kind: 'userpass',
      username: 'forgeadmin',
      password: 'forgejo-token',
    });
    expect(AuthService.getToken).not.toHaveBeenCalled();
  });

  it('rejects a push when no credential source is available', async () => {
    jest.mocked(AuthService.getToken).mockResolvedValue(null);

    await expect(GitEngine.pushWithIntegrate('/repo', 'origin', 'repo-without-credentials'))
      .rejects.toThrow('No credentials found for repo repo-without-credentials');
    expect(nativeModule.pushWithIntegrate).not.toHaveBeenCalled();
  });
});
