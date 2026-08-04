jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    updateFile: jest.fn(async () => ({ ok: true })),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'abc123' })),
    deleteFile: jest.fn(async () => ({ ok: true })),
    getTreeRecursiveOrThrow: jest.fn(async () => []),
    getFileContent: jest.fn(),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => [
      { path: 'org/repo', branch: 'main' },
    ]),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(async () => 'test-token'),
  },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: jest.fn(async () => ({ success: true })),
    deleteAndCommit: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(async (_repo: string, branch?: string) => branch ?? 'main'),
}));

jest.mock('../../src/services/git/gitHostFactory', () => ({
  getGitHostService: jest.fn(() => ({
    getAuthenticatedUser: jest.fn(async () => ({ login: 'testuser', email: 'test@test.com' })),
    updateFile: jest.fn(async () => {}),
    getTreeRecursive: jest.fn(async () => []),
    getFileText: jest.fn(),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'abc123' })),
    deleteFile: jest.fn(async () => {}),
  })),
}));

jest.mock('../../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

import { ThoughtDumpService } from '../../src/services/ThoughtDumpService';
import { GitHubService } from '../../src/services/GitHubService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { LocalGitWriter } from '../../src/services/git/LocalGitWriter';
import { parseThoughtDump, serializeThoughtDump, createThoughtDump } from '../../src/models/ThoughtDump';

beforeEach(() => {
  jest.clearAllMocks();
  (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
  (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
});

describe('ThoughtDumpService.create', () => {
  it('creates a thought dump via API mode', async () => {
    const dump = await ThoughtDumpService.create('my random thought', {
      repoPath: 'org/repo',
      branch: 'main',
    });

    expect(dump).not.toBeNull();
    expect(dump!.text).toBe('my random thought');
    expect(dump!.filePath).toMatch(/^thoughts\/\d{8}-\d{6}-[a-z0-9]+\.md$/);
    expect(dump!.id).toBeTruthy();
    expect(dump!.createdAt).toBeTruthy();

    expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
    const call = (GitHubService.updateFile as jest.Mock).mock.calls[0];
    expect(call[2]).toBe(dump!.filePath);
    expect(call[3]).toContain('<!-- thought-dump');
    expect(call[3]).toContain('my random thought');
  });

  it('returns null when not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
    const dump = await ThoughtDumpService.create('test', { repoPath: 'org/repo' });
    expect(dump).toBeNull();
  });

  it('uses clone mode when configured', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    const dump = await ThoughtDumpService.create('clone thought', {
      repoPath: 'org/repo',
      branch: 'main',
    });

    expect(dump).not.toBeNull();
    expect(LocalGitWriter.writeAndCommit).toHaveBeenCalledTimes(1);
    expect(GitHubService.updateFile).not.toHaveBeenCalled();
  });
});

describe('ThoughtDumpService.list', () => {
  it('lists thought dumps from repo tree', async () => {
    const dump1 = createThoughtDump('first thought');
    const dump2 = createThoughtDump('second thought');

    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: dump1.filePath, sha: 'a' },
      { type: 'blob', path: dump2.filePath, sha: 'b' },
      { type: 'blob', path: 'notes/regular.md', sha: 'c' },
    ]);

    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce(serializeThoughtDump(dump1))
      .mockResolvedValueOnce(serializeThoughtDump(dump2));

    const dumps = await ThoughtDumpService.list({ repoPath: 'org/repo', branch: 'main' });

    expect(dumps).toHaveLength(2);
    expect(dumps[0].text).toBe('first thought');
    expect(dumps[1].text).toBe('second thought');
  });

  it('skips corrupt files gracefully', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'thoughts/20240101-120000-abc12345.md', sha: 'a' },
      { type: 'blob', path: 'thoughts/20240101-130000-def67890.md', sha: 'b' },
    ]);

    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce('this is not a valid thought dump')
      .mockResolvedValueOnce(
        serializeThoughtDump(createThoughtDump('valid thought')),
      );

    const dumps = await ThoughtDumpService.list({ repoPath: 'org/repo', branch: 'main' });

    expect(dumps).toHaveLength(1);
    expect(dumps[0].text).toBe('valid thought');
  });

  it('returns empty array when not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
    const dumps = await ThoughtDumpService.list({ repoPath: 'org/repo' });
    expect(dumps).toEqual([]);
  });
});

describe('ThoughtDumpService.delete', () => {
  it('deletes a thought dump via API mode', async () => {
    const result = await ThoughtDumpService.delete('some-id', {
      repoPath: 'org/repo',
      branch: 'main',
      filePath: 'thoughts/20240101-120000-some-id.md',
    });

    expect(result).toBe(true);
    expect(GitHubService.getFileSha).toHaveBeenCalledWith(
      'org', 'repo', 'thoughts/20240101-120000-some-id.md', 'main',
    );
    expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);
  });

  it('uses clone mode for delete when configured', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

    const result = await ThoughtDumpService.delete('some-id', {
      repoPath: 'org/repo',
      branch: 'main',
      filePath: 'thoughts/20240101-120000-some-id.md',
    });

    expect(result).toBe(true);
    expect(LocalGitWriter.deleteAndCommit).toHaveBeenCalledTimes(1);
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
  });

  it('returns false when not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
    const result = await ThoughtDumpService.delete('some-id', {
      repoPath: 'org/repo',
      filePath: 'thoughts/x.md',
    });
    expect(result).toBe(false);
  });
});

describe('ThoughtDump model', () => {
  it('serializes and parses round-trip', () => {
    const dump = createThoughtDump('Hello world thought');
    const serialized = serializeThoughtDump(dump);
    const parsed = parseThoughtDump(serialized, dump.filePath);

    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(dump.id);
    expect(parsed!.text).toBe('Hello world thought');
    expect(parsed!.createdAt).toBe(dump.createdAt);
    expect(parsed!.filePath).toBe(dump.filePath);
  });

  it('parseThoughtDump returns null for invalid content', () => {
    expect(parseThoughtDump('just plain text', 'thoughts/x.md')).toBeNull();
    expect(parseThoughtDump('', 'thoughts/x.md')).toBeNull();
  });
});
