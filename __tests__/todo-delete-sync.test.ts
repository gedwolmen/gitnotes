jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getAllTodos: jest.fn(),
    deleteTodo: jest.fn(),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getUser: jest.fn(() => null),
    getFileSha: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
  },
}));

jest.mock('../src/services/git/StagingService', () => ({
  StagingService: { stageDelete: jest.fn(), stageUpsert: jest.fn() },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: {
    getTokenById: jest.fn(async () => null),
    getToken: jest.fn(async () => null),
  },
}));

import { useTodoStore } from '../src/stores/todoStore';
import { StorageService } from '../src/services/StorageService';
import { GitHubService } from '../src/services/GitHubService';
import { StagingService } from '../src/services/git/StagingService';

describe('todo delete GitHub sync', () => {
  let storageTodos: Array<{
    id: string;
    text: string;
    completed: boolean;
    createdAt: number;
    updatedAt: number;
    repo?: string;
    branch?: string;
    filePath?: string;
  }>;

  beforeEach(() => {
    jest.clearAllMocks();
    storageTodos = [];
    (StorageService.getAllTodos as jest.Mock).mockImplementation(async () => storageTodos);
    (StorageService.deleteTodo as jest.Mock).mockImplementation(async (id: string) => {
      const next = storageTodos.filter((todo) => todo.id !== id);
      if (next.length === storageTodos.length) return false;
      storageTodos = next;
      return true;
    });
    (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'found', sha: 'todo-sha-123' });
    (GitHubService.deleteFile as jest.Mock).mockResolvedValue({
      content: { sha: 'deleted-sha' },
      commit: { sha: 'commit-sha' },
    });
    (StagingService.stageDelete as jest.Mock).mockResolvedValue({ success: true });
    useTodoStore.setState({ todos: [], isLoading: false, error: null });
  });

  test('stages the delete, removes the local row, and keeps it gone after refresh', async () => {
    const syncedTodo = {
      id: 'todo-1',
      text: 'Ship it',
      completed: false,
      createdAt: 1,
      updatedAt: 1,
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/ship-it.json',
    };

    storageTodos = [syncedTodo];
    useTodoStore.setState({ todos: [syncedTodo], isLoading: false, error: null });

    await useTodoStore.getState().deleteTodo('todo-1');

    expect(StagingService.stageDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'todos/ship-it.json',
        title: 'Ship it',
      }),
    );
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
    expect(StorageService.deleteTodo).toHaveBeenCalledWith('todo-1');
    expect(useTodoStore.getState().todos).toEqual([]);

    await useTodoStore.getState().refreshTodos();

    expect(useTodoStore.getState().todos).toEqual([]);
  });

  test('keeps the todo locally when the delete stage fails so pull does not re-import it', async () => {
    const syncedTodo = {
      id: 'todo-2',
      text: 'Keep on failure',
      completed: false,
      createdAt: 1,
      updatedAt: 1,
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/keep.json',
    };

    storageTodos = [syncedTodo];
    useTodoStore.setState({ todos: [syncedTodo], isLoading: false, error: null });

    (StagingService.stageDelete as jest.Mock).mockResolvedValueOnce({
      success: false,
      error: 'staging boom',
    });

    const ok = await useTodoStore.getState().deleteTodo('todo-2');

    expect(ok).toBe(false);
    // Local storage MUST NOT be mutated when staging fails — otherwise
    // the next pull-to-refresh would re-create the todo (issue #489).
    expect(StorageService.deleteTodo).not.toHaveBeenCalled();
    expect(useTodoStore.getState().todos).toEqual([syncedTodo]);
    expect(useTodoStore.getState().error).toBeTruthy();
  });

  test('refuses to delete repo-backed todo when signed out of GitHub', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValueOnce(false);

    const syncedTodo = {
      id: 'todo-3',
      text: 'Need auth',
      completed: false,
      createdAt: 1,
      updatedAt: 1,
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/need-auth.json',
    };

    storageTodos = [syncedTodo];
    useTodoStore.setState({ todos: [syncedTodo], isLoading: false, error: null });

    const ok = await useTodoStore.getState().deleteTodo('todo-3');

    expect(ok).toBe(false);
    expect(StorageService.deleteTodo).not.toHaveBeenCalled();
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
    expect(useTodoStore.getState().todos).toEqual([syncedTodo]);
    expect(useTodoStore.getState().error).toBeTruthy();
  });

  test('a successful stage clears a stale local row (missing remote handled by the stage engine)', async () => {
    const stale = {
      id: 'todo-stale',
      text: 'Already gone remotely',
      completed: false,
      createdAt: 1,
      updatedAt: 1,
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/stale.json',
    };
    storageTodos = [stale];
    useTodoStore.setState({ todos: [stale], isLoading: false, error: null });

    const ok = await useTodoStore.getState().deleteTodo('todo-stale');

    expect(ok).toBe(true);
    expect(StagingService.stageDelete).toHaveBeenCalledTimes(1);
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
    expect(StorageService.deleteTodo).toHaveBeenCalledWith('todo-stale');
    expect(useTodoStore.getState().todos).toEqual([]);
  });

  test('still deletes purely-local todos with no repo metadata', async () => {
    const localTodo = {
      id: 'todo-4',
      text: 'local only',
      completed: false,
      createdAt: 1,
      updatedAt: 1,
    };

    storageTodos = [localTodo];
    useTodoStore.setState({ todos: [localTodo], isLoading: false, error: null });

    const ok = await useTodoStore.getState().deleteTodo('todo-4');

    expect(ok).toBe(true);
    expect(StorageService.deleteTodo).toHaveBeenCalledWith('todo-4');
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
    expect(useTodoStore.getState().todos).toEqual([]);
  });
});
