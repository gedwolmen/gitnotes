jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getAllTodos: jest.fn(),
    createTodo: jest.fn(),
    updateTodo: jest.fn(),
    deleteTodo: jest.fn(),
  },
}));

jest.mock('../../src/services/TodoGitHubSyncService', () => ({
  deleteTodoFromGitHub: jest.fn(),
}));

jest.mock('../../src/services/git/formatSyncError', () => ({
  formatSyncError: jest.fn((err) => err ?? 'sync error'),
}));

import { useTodoStore } from '../../src/stores/todoStore';
import { StorageService } from '../../src/services/StorageService';
import { deleteTodoFromGitHub } from '../../src/services/TodoGitHubSyncService';

import type { Todo } from '../../src/models/Todo';

const makeTodo = (id: string, overrides: Partial<Todo> = {}): Todo => ({
  id,
  text: `Todo ${id}`,
  completed: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  ...overrides,
});

describe('useTodoStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useTodoStore.setState({ todos: [], isLoading: false, error: null });
  });

  describe('loadTodos', () => {
    it('loads todos and reorders them', async () => {
      const todos = [makeTodo('1'), makeTodo('2')];
      (StorageService.getAllTodos as jest.Mock).mockResolvedValue(todos);

      await useTodoStore.getState().loadTodos();

      expect(useTodoStore.getState().todos).toHaveLength(2);
      expect(useTodoStore.getState().isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      (StorageService.getAllTodos as jest.Mock).mockRejectedValue(new Error('fail'));
      await useTodoStore.getState().loadTodos();
      expect(useTodoStore.getState().error).toBe('Failed to load todos');
    });
  });

  describe('createTodo', () => {
    it('creates todo and reloads the list', async () => {
      const created = makeTodo('new');
      (StorageService.createTodo as jest.Mock).mockResolvedValue(created);
      (StorageService.getAllTodos as jest.Mock).mockResolvedValue([created]);

      const result = await useTodoStore.getState().createTodo({ text: 'test' });

      expect(result?.id).toBe('new');
      expect(StorageService.getAllTodos).toHaveBeenCalled();
    });
  });

  describe('updateTodo', () => {
    it('updates existing todo in list', async () => {
      useTodoStore.setState({ todos: [makeTodo('1')] });
      const updated = makeTodo('1', { text: 'Updated' });
      (StorageService.updateTodo as jest.Mock).mockResolvedValue(updated);

      await useTodoStore.getState().updateTodo({ id: '1', text: 'Updated' });

      expect(useTodoStore.getState().todos[0].text).toBe('Updated');
    });
  });

  describe('deleteTodo', () => {
    it('deletes local-only todo directly from StorageService', async () => {
      useTodoStore.setState({ todos: [makeTodo('1')] });
      (StorageService.deleteTodo as jest.Mock).mockResolvedValue(true);

      await useTodoStore.getState().deleteTodo('1');

      expect(StorageService.deleteTodo).toHaveBeenCalledWith('1');
      expect(deleteTodoFromGitHub).not.toHaveBeenCalled();
      expect(useTodoStore.getState().todos).toHaveLength(0);
    });

    it('deletes repo-backed todos via git sync before local delete', async () => {
      const repoTodo = makeTodo('1', { repo: 'me/repo', branch: 'main', filePath: 'todos/test.json', text: 'test' });
      useTodoStore.setState({ todos: [repoTodo] });
      (deleteTodoFromGitHub as jest.Mock).mockResolvedValue({ success: true });
      (StorageService.deleteTodo as jest.Mock).mockResolvedValue(true);

      await useTodoStore.getState().deleteTodo('1');

      expect(deleteTodoFromGitHub).toHaveBeenCalledWith(
        expect.objectContaining({ repo: 'me/repo', filePath: 'todos/test.json' }),
      );
      expect(StorageService.deleteTodo).toHaveBeenCalledWith('1');
      expect(useTodoStore.getState().todos).toHaveLength(0);
    });

    it('keeps the todo and surfaces the error when git delete fails', async () => {
      const repoTodo = makeTodo('1', { repo: 'me/repo', branch: 'main', filePath: 'todos/test.json', text: 'test' });
      useTodoStore.setState({ todos: [repoTodo] });
      (deleteTodoFromGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'delete failed' });

      const result = await useTodoStore.getState().deleteTodo('1');

      expect(result).toBe(false);
      expect(StorageService.deleteTodo).not.toHaveBeenCalled();
      expect(useTodoStore.getState().todos).toHaveLength(1);
      expect(useTodoStore.getState().error).toBe('delete failed');
    });
  });
});