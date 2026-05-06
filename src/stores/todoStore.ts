import { create } from 'zustand';
import { Todo, TodoCreateInput, TodoUpdateInput, reorderTodos } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { GitHubService } from '../services/GitHubService';
import { deleteTodoFromGitHub } from '../services/TodoGitHubSyncService';
import { formatSyncError } from '../services/git/formatSyncError';

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
      set({ todos: reorderTodos(todos), isLoading: false });
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
      const isRepoBacked = !!(todoToDelete?.repo && todoToDelete.filePath);

      // Repo-backed todos must purge the remote file first; otherwise the next
      // pull re-imports the row (#489). The sync helper already treats a
      // missing remote (sha null / 404) as success so a stale local row can
      // still be cleaned up.
      if (isRepoBacked) {
        if (!GitHubService.isAuthenticated()) {
          set({ error: 'Cannot delete repo-backed todo while signed out of GitHub' });
          return false;
        }
        const remote = await deleteTodoFromGitHub({
          repo: todoToDelete!.repo!,
          branch: todoToDelete!.branch,
          filePath: todoToDelete!.filePath!,
          text: todoToDelete!.text,
        });
        if (!remote.success) {
          if (remote.error) console.warn('[TodoStore] delete sync failed:', remote.error);
          set({ error: formatSyncError(remote.error, 'delete') });
          return false;
        }
      }

      const success = await StorageService.deleteTodo(id);
      if (success) {
        set((state) => ({ todos: state.todos.filter((t) => t.id !== id) }));
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
