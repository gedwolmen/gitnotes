jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getAllTodos: jest.fn(),
    deleteTodo: jest.fn(),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getFileSha: jest.fn(),
    deleteFile: jest.fn(),
  },
}));

import { useTodoStore } from '../src/stores/todoStore';
import { StorageService } from '../src/services/StorageService';
import { GitHubService } from '../src/services/GitHubService';

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
    (GitHubService.getFileSha as jest.Mock).mockResolvedValue('todo-sha-123');
    (GitHubService.deleteFile as jest.Mock).mockResolvedValue({
      content: { sha: 'deleted-sha' },
      commit: { sha: 'commit-sha' },
    });
    useTodoStore.setState({ todos: [], isLoading: false, error: null });
  });

  test('deletes the remote todo file and keeps it gone after refresh', async () => {
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

    expect(StorageService.deleteTodo).toHaveBeenCalledWith('todo-1');
    expect(GitHubService.getFileSha).toHaveBeenCalledWith('owner', 'repo', 'todos/ship-it.json', 'main');
    expect(GitHubService.deleteFile).toHaveBeenCalledWith(
      'owner',
      'repo',
      'todos/ship-it.json',
      'Delete todo: Ship it',
      'todo-sha-123',
      'main',
    );
    expect(useTodoStore.getState().todos).toEqual([]);

    await useTodoStore.getState().refreshTodos();

    expect(useTodoStore.getState().todos).toEqual([]);
  });
});
