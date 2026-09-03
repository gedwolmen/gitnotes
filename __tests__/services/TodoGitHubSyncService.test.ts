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

jest.mock('expo-file-system', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  getInfoAsync: jest.fn(() => ({ exists: false })),
  readAsStringAsync: jest.fn(async () => { throw new Error('not found'); }),
  writeAsStringAsync: jest.fn(async () => {}),
  deleteAsync: jest.fn(async () => {}),
  makeDirectoryAsync: jest.fn(async () => {}),
}));

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      isWifi: true,
    })),
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

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

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(async () => 'test-token'),
    getTokenById: jest.fn(async () => 'test-token'),
  },
}));

jest.mock('../../src/services/syncStubs', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
  },
  CloneSyncService: {
    save: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/git/defaultsPolicy', () => ({
  resolveDefaultFolder: jest.fn(() => 'todos/'),
  resolveDefaultRepo: jest.fn(async () => 'owner/repo'),
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    readFile: jest.fn(async () => null),
    workingTreeUri: jest.fn(({ repoPath }: { repoPath: string }) => `file:///doc/GitNotes/${repoPath}`),
    getCommitOid: jest.fn(async () => 'abc123'),
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    findMergeBase: jest.fn(async () => 'mergebase123'),
    getChangedFilesBetweenRefs: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/git/engine/GitEngine', () => ({
  remove: jest.fn(async () => {}),
  stage: jest.fn(async () => {}),
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, branch?: string) => branch ?? 'main'),
}));

jest.mock('../../src/utils/gitPathParser', () => ({
  parseRepoPath: jest.fn((path: string) => {
    if (!path) return null;
    const parts = path.split('/');
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1] };
  }),
}));

import { syncTodoToGitHub, deleteTodoFromGitHub } from '../../src/services/TodoGitHubSyncService';
import { GitHubService } from '../../src/services/GitHubService';
import { GitFsService } from '../../src/services/git/GitFsService';
import * as GitEngine from '../../src/services/git/engine/GitEngine';
import { resolveBranch } from '../../src/services/git/resolveBranch';
import { SyncEngineService, CloneSyncService } from '../../src/services/syncStubs';

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
    (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'found', sha: 'existing-sha' });
    (GitHubService.deleteFile as jest.Mock).mockResolvedValue(true);
    (GitFsService.isCloned as jest.Mock).mockResolvedValue(false);
    (GitFsService.readFile as jest.Mock).mockResolvedValue(null);
    (CloneSyncService.save as jest.Mock).mockResolvedValue({ success: true });
    (GitEngine.remove as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('syncTodoToGitHub', () => {
    describe('clone mode uses CloneSyncService.save', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
      });

      test('calls CloneSyncService.save with correct params for create', async () => {
        const result = await syncTodoToGitHub({
          repo: 'owner/repo',
          branch: 'main',
          text: 'Buy groceries',
          todo: mockTodo,
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('todos/buy-groceries.json');

        expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.repoPath).toBe('owner/repo');
        expect(callArg.branch).toBe('main');
        expect(callArg.filePath).toBe('todos/buy-groceries.json');
        expect(callArg.intent).toBe('upsert');
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
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
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
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.filePath).toBe('/todos/my-todo.json');
      });

      test('returns error when CloneSyncService.save fails', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValue({
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
        expect(CloneSyncService.save).not.toHaveBeenCalled();
      });
    });
  });

  describe('deleteTodoFromGitHub', () => {
    describe('clone mode with a local clone', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (GitFsService.isCloned as jest.Mock).mockResolvedValue(true);
      });

      test('routes the deletion through CloneSyncService.save with delete intent', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(result.filePath).toBe('todos/buy-groceries.json');

        expect(CloneSyncService.save).toHaveBeenCalledTimes(1);
        expect(CloneSyncService.save).toHaveBeenCalledWith({
          repoPath: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          message: 'Delete todo: Buy groceries',
          intent: 'delete',
        });
        expect(GitHubService.getFileSha).not.toHaveBeenCalled();
        expect(GitHubService.deleteFile).not.toHaveBeenCalled();
      });

      test('passes the resolved branch to the clone writer', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(resolveBranch).toHaveBeenCalledWith('owner/repo', undefined);
        const callArg = (CloneSyncService.save as jest.Mock).mock.calls[0][0];
        expect(callArg.branch).toBe('main');
      });

      test('hands filePath to the clone writer untouched', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: '/todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(CloneSyncService.save).toHaveBeenCalledWith(
          expect.objectContaining({ filePath: '/todos/buy-groceries.json', intent: 'delete' }),
        );
      });

      test('returns error when the clone writer fails', async () => {
        (CloneSyncService.save as jest.Mock).mockResolvedValueOnce({
          success: false,
          error: 'repo locked',
        });

        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('repo locked');
      });
    });

    describe('clone mode without a local clone', () => {
      beforeEach(() => {
        (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
        (GitFsService.isCloned as jest.Mock).mockResolvedValue(false);
      });

      test('purges the remote file via the Contents API', async () => {
        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(true);
        expect(GitHubService.getFileSha).toHaveBeenCalledTimes(1);
        expect(GitHubService.deleteFile).toHaveBeenCalledTimes(1);
        expect(GitEngine.remove).not.toHaveBeenCalled();
      });

      test('fails when signed out with no local clone', async () => {
        (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);

        const result = await deleteTodoFromGitHub({
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'todos/buy-groceries.json',
          text: 'Buy groceries',
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe('GitHub not authenticated');
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
        expect(CloneSyncService.save).not.toHaveBeenCalled();
        expect(GitEngine.remove).not.toHaveBeenCalled();
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
