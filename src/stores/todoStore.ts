import { create } from 'zustand';
import { Todo, TodoCreateInput, TodoUpdateInput } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { GitHubService } from '../services/GitHubService';
import { parseRepoPath } from '../utils/gitPathParser';

interface TodoState {
  todos: Todo[];
  isLoading: boolean;
  error: string | null;
}

interface TodoActions {
  loadTodos: () => Promise<void>;
  createTodo: (input: TodoCreateInput) => Promise<Todo | null>;
  updateTodo: (input: TodoUpdateInput) => Promise<Todo | null>;
  deleteTodo: (id: string) => Promise<boolean>;
  refreshTodos: () => Promise<void>;
  clearError: () => void;
}

export const useTodoStore = create<TodoState & TodoActions>()((set, get) => ({
  todos: [],
  isLoading: true,
  error: null,

  loadTodos: async () => {
    try {
      set({ isLoading: true, error: null });
      const todos = await StorageService.getAllTodos();
      set({ todos, isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load todos', isLoading: false });
      console.error('Error loading todos:', err);
    }
  },

  createTodo: async (input) => {
    try {
      set({ error: null });
      const todo = await StorageService.createTodo(input);
      set((state) => ({ todos: state.todos }));
      await get().loadTodos();
      return todo;
    } catch (err) {
      set({ error: 'Failed to create todo' });
      console.error('Error creating todo:', err);
      return null;
    }
  },

  updateTodo: async (input) => {
    try {
      set({ error: null });
      const updated = await StorageService.updateTodo(input);
      if (updated) {
        set((state) => ({
          todos: state.todos.map((t) => (t.id === input.id ? updated : t)),
        }));
      }
      return updated;
    } catch (err) {
      set({ error: 'Failed to update todo' });
      console.error('Error updating todo:', err);
      return null;
    }
  },

  deleteTodo: async (id) => {
    try {
      set({ error: null });
      const todoToDelete = get().todos.find((t) => t.id === id);
      const success = await StorageService.deleteTodo(id);
      if (success) {
        set((state) => ({ todos: state.todos.filter((t) => t.id !== id) }));
        if (todoToDelete?.repo && todoToDelete.filePath && GitHubService.isAuthenticated()) {
          const repoInfo = parseRepoPath(todoToDelete.repo);
          if (repoInfo) {
            const branch = todoToDelete.branch || 'main';
            const sha = await GitHubService.getFileSha(repoInfo.owner, repoInfo.repo, todoToDelete.filePath, branch);
            if (sha) {
              const result = await GitHubService.deleteFile(
                repoInfo.owner,
                repoInfo.repo,
                todoToDelete.filePath,
                `Delete todo: ${todoToDelete.text}`,
                sha,
                branch,
              );
              if (!result) {
                console.warn('[TodoStore] GitHub delete failed for todo:', id);
              }
            }
          }
        }
      }
      return success;
    } catch (err) {
      set({ error: 'Failed to delete todo' });
      console.error('Error deleting todo:', err);
      return false;
    }
  },

  refreshTodos: async () => {
    await get().loadTodos();
  },

  clearError: () => set({ error: null }),
}));
