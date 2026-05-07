jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    updateTodo: jest.fn(),
    getAllTodos: jest.fn(),
    saveAllTodos: jest.fn(),
  },
}));

jest.mock('../src/services/NotificationService', () => ({
  NotificationService: {
    cancelAllForTodo: jest.fn(),
    scheduleReminder: jest.fn(),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => false),
  },
}));

jest.mock('../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(() => Promise.resolve({ success: true })),
}));

import { act, renderHook } from '@testing-library/react-native';
import { useTodos } from '../src/contexts/TodoContext';
import { Todo } from '../src/models/Todo';
import { StorageService } from '../src/services/StorageService';
import { NotificationService } from '../src/services/NotificationService';
import { syncTodoToGitHub } from '../src/services/TodoGitHubSyncService';
import { useTodoStore } from '../src/stores/todoStore';

const makeTodo = (overrides: Partial<Todo>): Todo => ({
  id: overrides.id ?? 'todo-id',
  text: overrides.text ?? 'Todo',
  completed: overrides.completed ?? false,
  createdAt: overrides.createdAt ?? 1,
  updatedAt: overrides.updatedAt ?? overrides.createdAt ?? 1,
  priority: overrides.priority ?? 'medium',
  tags: overrides.tags ?? [],
  ...overrides,
});

describe('todo completion ordering and refresh', () => {
  let storageTodos: Todo[];

  beforeEach(() => {
    jest.clearAllMocks();
    storageTodos = [];

    (StorageService.getAllTodos as jest.Mock).mockImplementation(async () => storageTodos);
    (StorageService.updateTodo as jest.Mock).mockImplementation(async (input: { id: string; completed?: boolean; notificationId?: string }) => {
      const index = storageTodos.findIndex((todo) => todo.id === input.id);
      if (index === -1) return null;

      storageTodos[index] = {
        ...storageTodos[index],
        ...input,
        updatedAt: storageTodos[index].updatedAt + 1,
      };

      return storageTodos[index];
    });
    (StorageService.saveAllTodos as jest.Mock).mockImplementation(async (todos: Todo[]) => {
      storageTodos = todos.map((todo) => ({ ...todo }));
    });
    (NotificationService.cancelAllForTodo as jest.Mock).mockResolvedValue(undefined);
    (NotificationService.scheduleReminder as jest.Mock).mockResolvedValue(undefined);

    useTodoStore.setState({ todos: [], isLoading: false, error: null });
  });

  test('completing the top todo reorders atomically and stays stable after refresh', async () => {
    const topTodo = makeTodo({
      id: 'todo-1',
      text: 'Top todo',
      completed: false,
      priority: 'high',
      createdAt: 30,
      updatedAt: 30,
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/top-todo.json',
    });
    const middleTodo = makeTodo({ id: 'todo-2', text: 'Middle todo', priority: 'medium', createdAt: 20, updatedAt: 20 });
    const bottomTodo = makeTodo({ id: 'todo-3', text: 'Bottom todo', priority: 'low', createdAt: 10, updatedAt: 10 });

    storageTodos = [topTodo, middleTodo, bottomTodo].map((todo) => ({ ...todo }));
    useTodoStore.setState({ todos: [topTodo, middleTodo, bottomTodo], isLoading: false, error: null });

    const { result } = renderHook(() => useTodos());

    await act(async () => {
      await result.current.toggleTodo('todo-1');
    });

    expect(useTodoStore.getState().todos.map((todo) => todo.id)).toEqual(['todo-2', 'todo-3', 'todo-1']);
    expect(useTodoStore.getState().todos[0]).toBeDefined();
    expect(useTodoStore.getState().todos[0]?.id).toBe('todo-2');
    expect(useTodoStore.getState().todos[2]).toMatchObject({ id: 'todo-1', completed: true });
    expect(StorageService.saveAllTodos).toHaveBeenCalled();
    expect(syncTodoToGitHub).toHaveBeenCalledWith(expect.objectContaining({
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'todos/top-todo.json',
      text: 'Top todo',
      todo: expect.objectContaining({ completed: true }),
    }));

    await act(async () => {
      await result.current.refreshTodos();
    });

    expect(useTodoStore.getState().todos.map((todo) => todo.id)).toEqual(['todo-2', 'todo-3', 'todo-1']);
    expect(useTodoStore.getState().todos[2]).toMatchObject({ id: 'todo-1', completed: true });
  });
});
