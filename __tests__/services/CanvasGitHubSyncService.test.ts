jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getUser: jest.fn(() => ({
      name: 'Test User',
      login: 'testuser',
      email: 'test@test.com',
    })),
    updateFile: jest.fn(async () => ({ content: { sha: 'newsha' } })),
    deleteFile: jest.fn(async () => true),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'abc123' })),
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

jest.mock('../../src/services/git/CommitService', () => ({
  CommitService: {
    commit: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/utils/gitPathParser', () => ({
  parseRepoPath: jest.fn((path: string) => {
    const parts = path.split('/');
    if (parts.length === 2) return { owner: parts[0], repo: parts[1] };
    return null;
  }),
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, branch?: string) => branch ?? 'main'),
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: jest.fn(async () => ({ success: true })),
    deleteAndCommit: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    readFile: jest.fn(async () => null),
    getCommitOid: jest.fn(async () => 'abc123'),
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    findMergeBase: jest.fn(async () => 'mergebase123'),
    getChangedFilesBetweenRefs: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({
    promises: { readFile: jest.fn(), writeFile: jest.fn(), unlink: jest.fn() },
  })),
}));

jest.mock('../../src/services/git/gitHttp', () => ({ gitHttp: {} }));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: jest.fn(() => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => { throw new Error('not found'); }),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  makeDirectoryAsync: jest.fn(async () => {}),
}));

import { syncCanvasToGitHub, deleteCanvasFromGitHub } from '../../src/services/CanvasGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { CommitService } from '../../src/services/git/CommitService';

const mockScene = { nodes: [], edges: [] };

describe('CanvasGitHubSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitHubService.getUser as jest.Mock).mockReturnValue({
      name: 'Test User',
      login: 'testuser',
      email: 'test@test.com',
    });
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    (CommitService.commit as jest.Mock).mockResolvedValue({ success: true });
  });

  describe('syncCanvasToGitHub', () => {
    describe('clone mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      });

      test('calls CommitService.commit with correct params for create', async () => {
        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('canvases/my-canvas.json');

        expect(CommitService.commit).toHaveBeenCalledTimes(1);
        const call = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(call.repo).toBe('owner/repo');
        expect(call.branch).toBe('main');
        expect(call.filePath).toBe('canvases/my-canvas.json');
        expect(call.content).toBe(JSON.stringify(mockScene, null, 2));
        expect(call.message).toBe('Create canvas: My Canvas');
        expect(call.author).toEqual({
          name: 'Test User',
          email: 'test@test.com',
        });
        expect(call.delete).toBeUndefined();
      });

      test('calls CommitService.commit with Update message when filePath is provided', async () => {
        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/existing.json',
          title: 'Updated Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('canvases/existing.json');

        const call = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(call.message).toBe('Update canvas: Updated Canvas');
        expect(call.filePath).toBe('canvases/existing.json');
      });

      test('returns error when CommitService.commit fails', async () => {
        (CommitService.commit as jest.Mock).mockResolvedValue({
          success: false,
          error: 'write failed',
        });

        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('write failed');
      });

      test('does not call GitHubService.updateFile in clone mode', async () => {
        await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(GitHubService.updateFile).not.toHaveBeenCalled();
      });
    });

    describe('api mode', () => {
      test('calls GitHubService.updateFile with correct params', async () => {
        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('canvases/my-canvas.json');

        expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
        const call = (GitHubService.updateFile as jest.Mock).mock.calls[0];
        expect(call[0]).toBe('owner');
        expect(call[1]).toBe('repo');
        expect(call[2]).toBe('canvases/my-canvas.json');
        expect(call[3]).toBe(JSON.stringify(mockScene, null, 2));
        expect(call[4]).toBe('Create canvas: My Canvas');
        expect(call[5]).toBe('main');
      });

      test('does not call CommitService.commit in api mode', async () => {
        await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(CommitService.commit).not.toHaveBeenCalled();
      });

      test('returns error when GitHubService.updateFile fails', async () => {
        (GitHubService.updateFile as jest.Mock).mockRejectedValue(
          new Error('API error'),
        );

        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('API error');
      });

      test('returns error when GitHub returns no result', async () => {
        (GitHubService.updateFile as jest.Mock).mockResolvedValue(null);

        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub API returned no result');
      });
    });

    describe('auth guards', () => {
      test('returns error when not authenticated and no token', async () => {
        (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');

        const result = await syncCanvasToGitHub({
          repo: 'owner/repo',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub not authenticated');
      });

      test('returns error for invalid repo path', async () => {
        const result = await syncCanvasToGitHub({
          repo: 'invalid',
          title: 'My Canvas',
          scene: mockScene as any,
        });

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/Invalid repo path/);
      });
    });
  });

  describe('deleteCanvasFromGitHub', () => {
    describe('clone mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      });

      test('calls CommitService.commit with delete:true for clone mode', async () => {
        const result = await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('canvases/my-canvas.json');

        expect(CommitService.commit).toHaveBeenCalledTimes(1);
        const call = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(call.repo).toBe('owner/repo');
        expect(call.branch).toBe('main');
        expect(call.filePath).toBe('canvases/my-canvas.json');
        expect(call.message).toBe('Delete canvas: My Canvas');
        expect(call.delete).toBe(true);
        expect(call.author).toEqual({
          name: 'Test User',
          email: 'test@test.com',
        });
      });

      test('uses filePath as message fallback when title is missing', async () => {
        await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
        });

        const call = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(call.message).toBe('Delete canvas: canvases/my-canvas.json');
      });

      test('returns error when CommitService.commit fails', async () => {
        (CommitService.commit as jest.Mock).mockResolvedValue({
          success: false,
          error: 'delete failed',
        });

        const result = await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('delete failed');
      });

      test('does not call GitHubService.deleteFile in clone mode', async () => {
        await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
        expect(GitHubService.getFileSha).not.toHaveBeenCalled();
      });
    });

    describe('api mode', () => {
      test('calls GitHubService.getFileSha and deleteFile with correct params', async () => {
        const result = await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('canvases/my-canvas.json');

        expect(GitHubService.getFileSha).toHaveBeenCalledTimes(1);
        expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);

        const deleteArgs = (GitHubService.deleteFile as jest.Mock).mock.calls[0];
        expect(deleteArgs[0]).toBe('owner');
        expect(deleteArgs[1]).toBe('repo');
        expect(deleteArgs[2]).toBe('canvases/my-canvas.json');
        expect(deleteArgs[3]).toBe('Delete canvas: My Canvas');
      });

      test('does not call CommitService.commit in api mode', async () => {
        await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(CommitService.commit).not.toHaveBeenCalled();
      });

      test('treats not-found as success', async () => {
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({
          kind: 'not-found',
        });

        const result = await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      });

      test('returns error when getFileSha fails', async () => {
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({
          kind: 'error',
          message: 'network error',
        });

        const result = await deleteCanvasFromGitHub({
          repo: 'owner/repo',
          filePath: 'canvases/my-canvas.json',
          title: 'My Canvas',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('network error');
      });
    });
  });
});
