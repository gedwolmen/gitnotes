jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getUser: jest.fn(() => ({
      name: 'Test User',
      login: 'testuser',
      email: 'test@test.com',
    })),
    getFileShaOrNull: jest.fn(async () => null),
    getFileSha: jest.fn(async () => ({ kind: 'found', sha: 'existing-sha' })),
    updateFile: jest.fn(async () => ({ content: { sha: 'newsha' }, commit: { sha: 'commitsha' } })),
    deleteFile: jest.fn(async () => true),
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
    commit: jest.fn(async () => ({ success: true, oid: 'abc123' })),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    readFile: jest.fn(async () => null),
  },
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

import { syncTodoToGitHub, deleteTodoFromGitHub } from '../../src/services/TodoGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { CommitService } from '../../src/services/git/CommitService';
import { GitFsService } from '../../src/services/git/GitFsService';

const mockTodo = {
  text: 'Buy groceries',
  completed: false,
  priority: 'high' as const,
  tags: ['shopping'],
};

describe('TodoGitHubSyncService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitHubService.getUser as jest.Mock).mockReturnValue({
      name: 'Test User',
      login: 'testuser',
      email: 'test@test.com',
    });
    (GitHubService.getFileShaOrNull as jest.Mock).mockResolvedValue(null);
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(false);
    (GitFsService.readFile as jest.Mock).mockResolvedValue(null);
    (CommitService.commit as jest.Mock).mockResolvedValue({ success: true, oid: 'abc123' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncTodoToGitHub', () => {
    describe('clone mode uses CommitService.commit', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
      });

      test('calls CommitService.commit with correct params for create', async () => {
        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          text: 'Buy groceries',
          todo: mockTodo,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('todos/buy-groceries.json');

        expect(CommitService.commit).toHaveBeenCalledTimes(1);
        const callArg = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(callArg.repo).toBe('owner/repo');
        expect(callArg.branch).toBe('main');
        expect(callArg.filePath).toBe('todos/buy-groceries.json');
        expect(callArg.message).toMatch(/^Create todo: Buy groceries/);
      });

      test('uses Update verb when file already exists', async () => {
        (GitFsService.readFile as jest.Mock).mockResolvedValue('existing content');

        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          text: 'Buy groceries',
          todo: mockTodo,
        });

        expect(result.success).toBe(true);
        const callArg = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(callArg.message).toMatch(/^Update todo: Buy groceries/);
      });

      test('falls back to caller filePath when probe fails', async () => {
        (GitFsService.readFile as jest.Mock).mockRejectedValue(new Error('network'));

        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: '/todos/my-todo.json',
          text: 'My todo',
          todo: mockTodo,
        });

        expect(result.success).toBe(true);
        const callArg = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(callArg.filePath).toBe('/todos/my-todo.json');
      });

      test('returns error when CommitService fails', async () => {
        (CommitService.commit as jest.Mock).mockResolvedValue({
          success: false,
          error: 'commit failed',
        });

        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          text: 'Buy groceries',
          todo: mockTodo,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('commit failed');
      });
    });

    describe('api mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('uses GitHubService.updateFile in API mode', async () => {
        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          text: 'Buy groceries',
          todo: mockTodo,
        });

        expect(result.success).toBe(true);
        expect(GitHubService.updateFile).toHaveBeenCalledTimes(1);
        expect(CommitService.commit).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteTodoFromGitHub', () => {
    describe('clone mode uses CommitService.commit', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
      });

      test('calls CommitService.commit with delete:true', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('todos/buy-groceries.json');

        expect(CommitService.commit).toHaveBeenCalledTimes(1);
        const callArg = (CommitService.commit as jest.Mock).mock.calls[0][0];
        expect(callArg.repo).toBe('owner/repo');
        expect(callArg.branch).toBe('main');
        expect(callArg.filePath).toBe('todos/buy-groceries.json');
        expect(callArg.delete).toBe(true);
        expect(callArg.message).toBe('Delete todo: Buy groceries');
      });

      test('returns error when CommitService.delete fails', async () => {
        (CommitService.commit as jest.Mock).mockResolvedValue({
          success: false,
          error: 'delete failed',
        });

        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('delete failed');
      });
    });

    describe('api mode', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      });

      test('uses GitHubService.deleteFile in API mode', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);
        expect(CommitService.commit).not.toHaveBeenCalled();
      });

      test('returns success when file not found on remote', async () => {
        (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'not-found' });

        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/ghost.json',
          text: 'Ghost',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      });
    });
  });
});
