jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getFileShaOrNull: jest.fn(async () => null),
    updateFile: jest.fn(async () => ({ content: { sha: 'newsha' }, commit: { sha: 'commitsha' } })),
    deleteFile: jest.fn(async () => true),
    uploadBinaryFile: jest.fn(async () => null),
    getRepoPrivacy: jest.fn(async () => true),
  },
}));

jest.mock('../../src/services/CloneSyncService', () => ({
  CloneSyncService: {
    save: jest.fn(async () => ({ success: true })),
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
    getTokenById: jest.fn(async () => 'test-token'),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
  GitFsService: {
    isCloned: jest.fn(async () => false),
    readFile: jest.fn(async () => null),
  },
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, branch?: string) => branch ?? 'main'),
}));

jest.mock('../../src/services/git/gitHostFactory', () => ({
  getGitHostService: jest.fn(() => ({
    getAuthenticatedUser: jest.fn(async () => ({ login: 'testuser', email: 'test@test.com' })),
  })),
}));

jest.mock('../../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

import { syncNoteToGitHub, deleteNoteFromGitHub } from '../../src/services/NoteGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { CloneSyncService } from '../../src/services/CloneSyncService';

describe('NoteGitHubSyncService.syncNoteToGitHub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitHubService.getFileShaOrNull as jest.Mock).mockResolvedValue(null);
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(false);
    (GitFsService.readFile as jest.Mock).mockResolvedValue(null);
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('clone mode existence probe (#890)', () => {
    beforeEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
    });

    test('treats NotFoundError as a missing file without warning and commits as Create', async () => {
      const notFound = Object.assign(new Error('Could not find notes/foo.md'), {
        code: 'NotFoundError',
      });
      (GitFsService.readFile as jest.Mock).mockRejectedValue(notFound);

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await syncNoteToGitHub({
        repo: 'owner/repo',
        branch: 'main',
        title: 'Foo',
        content: '# Foo\n\nbody',
        format: 'markdown',
        tags: ['a'],
        color: null,
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('notes/foo.md');

      expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
      const saveArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
      expect(saveArg.repoPath).toBe('owner/repo');
      expect(saveArg.branch).toBe('main');
      expect(saveArg.filePath).toBe('notes/foo.md');
      expect(saveArg.intent).toBe('upsert');
      expect(saveArg.message).toMatch(/^Create note:/);

      const warned = warnSpy.mock.calls.some((args) =>
        String(args[0]).includes('fileExists check failed'),
      );
      expect(warned).toBe(false);

      warnSpy.mockRestore();
    });

    test('keeps warn + null fileExists on non-NotFound errors', async () => {
      (GitFsService.readFile as jest.Mock).mockRejectedValue(new Error('network down'));

      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

      const result = await syncNoteToGitHub({
        repo: 'owner/repo',
        branch: 'main',
        title: 'Foo',
        content: '# Foo',
        format: 'markdown',
      });

      expect(result.success).toBe(true);
      // Unknown probe failure -> fileExists null -> heuristic falls back to
      // caller intent (no filePath / knownSha) -> still a Create verb.
      expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
      const saveArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
      expect(saveArg.message).toMatch(/^Create note:/);

      const warned = warnSpy.mock.calls.some((args) =>
        String(args[0]).includes('fileExists check failed'),
      );
      expect(warned).toBe(true);

      warnSpy.mockRestore();
    });
  });

  describe('api mode expectExists (#882)', () => {
    test('passes expectExists:false when the probe authoritatively finds the file absent', async () => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      (GitHubService.getFileShaOrNull as jest.Mock).mockResolvedValue(null);

      const result = await syncNoteToGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: '/scratch/new.md',
        title: 'New note',
        content: '# New note',
        format: 'markdown',
      });

      expect(result.success).toBe(true);
      expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
      const opts = (GitHubService.updateFile as jest.Mock).mock.calls[0][6];
      expect(opts.expectExists).toBe(false);
    });

    test('passes expectExists:true when the probe finds the file present', async () => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      (GitHubService.getFileShaOrNull as jest.Mock).mockResolvedValue('sha123');

      const result = await syncNoteToGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: '/scratch/existing.md',
        title: 'Existing note',
        content: '# Existing note',
        format: 'markdown',
      });

      expect(result.success).toBe(true);
      expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
      const opts = (GitHubService.updateFile as jest.Mock).mock.calls[0][6];
      expect(opts.expectExists).toBe(true);
    });
  });
});

describe('NoteGitHubSyncService.deleteNoteFromGitHub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('clone mode', () => {
    beforeEach(() => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    });

    test('routes through CloneSyncService.save with intent delete', async () => {
      const result = await deleteNoteFromGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        title: 'Foo',
      });

      expect(result.success).toBe(true);
      expect(result.filePath).toBe('notes/foo.md');

      expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
      const saveArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
      expect(saveArg.repoPath).toBe('owner/repo');
      expect(saveArg.branch).toBe('main');
      expect(saveArg.filePath).toBe('notes/foo.md');
      expect(saveArg.message).toBe('Delete note: Foo');
      expect(saveArg.intent).toBe('delete');
    });

    test('returns failure when CloneSyncService.save fails', async () => {
      (CloneSyncService.save as jest.Mock).mockResolvedValue({
        success: false,
        error: 'queued',
      });

      const result = await deleteNoteFromGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        title: 'Foo',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('queued');
    });

    test('uses filePath fallback in message when title is absent', async () => {
      await deleteNoteFromGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/bar.md',
      });

      const saveArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
      expect(saveArg.message).toBe('Delete note: notes/bar.md');
    });

    test('does not call GitHubService in clone mode', async () => {
      await deleteNoteFromGitHub({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        title: 'Foo',
      });

      expect(GitHubService.getFileShaOrNull).not.toHaveBeenCalled();
    });
  });
});
