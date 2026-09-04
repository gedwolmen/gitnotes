import { describe, expect, test, jest, beforeEach } from '@jest/globals';
import { remoteUrlForHost } from '../../../src/services/git/GitFsService';
import { formatSyncError } from '../../../src/services/git/formatSyncError';

jest.mock('../../../src/services/AccountStorage', () => ({
  AccountStorage: {
    getSshKey: jest.fn(),
    setSshKey: jest.fn(),
    deleteSshKey: jest.fn(),
    getHostUseSsh: jest.fn(),
    setHostUseSsh: jest.fn(),
  },
}));

jest.mock('../../../src/services/git/engine/GitEngine', () => ({
  generateSshKey: jest.fn(),
  setCredential: jest.fn(),
  getCredential: jest.fn(),
  clearCredential: jest.fn(),
}));

describe('remoteUrlForHost', () => {
  test('GitHub HTTPS when useSsh=false', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: false,
      provider: 'github',
      instanceBaseUrl: null,
    });
    expect(url).toBe('https://github.com/owner/repo.git');
  });

  test('GitHub SSH when useSsh=true', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'github',
      instanceBaseUrl: null,
    });
    expect(url).toBe('git@github.com:owner/repo.git');
  });

  test('GitLab SSH when useSsh=true', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'gitlab',
      instanceBaseUrl: null,
    });
    expect(url).toBe('git@gitlab.com:owner/repo.git');
  });

  test('GitLab HTTPS when useSsh=false', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: false,
      provider: 'gitlab',
      instanceBaseUrl: null,
    });
    expect(url).toBe('https://gitlab.com/owner/repo.git');
  });

  test('Gitea SSH with custom instanceBaseUrl', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'gitea',
      instanceBaseUrl: 'https://gitea.example.com',
    });
    expect(url).toBe('git@gitea.example.com:owner/repo.git');
  });

  test('Gitea HTTPS with custom instanceBaseUrl', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: false,
      provider: 'gitea',
      instanceBaseUrl: 'https://gitea.example.com',
    });
    expect(url).toBe('https://gitea.example.com/owner/repo.git');
  });

  test('Forgejo SSH with custom instanceBaseUrl', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'forgejo',
      instanceBaseUrl: 'https://forgejo.example.org',
    });
    expect(url).toBe('git@forgejo.example.org:owner/repo.git');
  });

  test('unknown provider falls back to GitHub HTTPS', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: false,
      provider: 'unknown' as any,
      instanceBaseUrl: null,
    });
    expect(url).toBe('https://github.com/owner/repo.git');
  });

  test('unknown provider with useSsh=true falls back to GitHub SSH', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'unknown' as any,
      instanceBaseUrl: null,
    });
    expect(url).toBe('git@github.com:owner/repo.git');
  });

  test('instanceBaseUrl trailing slash is stripped', () => {
    const url = remoteUrlForHost('owner', 'repo', {
      useSsh: true,
      provider: 'gitea',
      instanceBaseUrl: 'https://gitea.example.com/',
    });
    expect(url).toBe('git@gitea.example.com:owner/repo.git');
  });
});

describe('formatSyncError - SSH auth failures', () => {
  test('Permission denied (publickey) maps to SSH auth message', () => {
    const message = formatSyncError('Git remote: Permission denied (publickey).');
    expect(message).toContain('SSH key');
    expect(message).toContain('not recognized');
  });

  test('publickey in error maps to SSH auth message', () => {
    const message = formatSyncError('fatal: Could not read from remote repository. publickey');
    expect(message).toContain('SSH key');
  });

  test('ssh auth maps to SSH auth message', () => {
    const message = formatSyncError('SSH_AUTH error: authentication failed');
    expect(message).toContain('SSH key');
  });

  test('authentication failed maps to SSH auth message', () => {
    const message = formatSyncError('fatal: authentication failed');
    expect(message).toContain('SSH key');
  });

  test('git@github.com permission denied maps to SSH auth message', () => {
    const message = formatSyncError('git@github.com: permission denied (publickey)');
    expect(message).toContain('SSH key');
  });

  test('HTTPS 403 still shows HTTPS-specific message not SSH', () => {
    const message = formatSyncError('GitHub API error: 403');
    expect(message).toContain('token');
    expect(message).toContain('Contents: Read and write');
    expect(message).not.toContain('SSH');
  });

  test('SSH auth failure is non-retryable', () => {
    const message = formatSyncError('Permission denied (publickey)');
    expect(message).not.toContain('retry');
  });
});
