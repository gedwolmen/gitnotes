import { create } from 'zustand';
import { Todo, TodoCreateInput, TodoUpdateInput, reorderTodos } from '../models/Todo';
import { StorageService } from '../services/StorageService';
import { GitHubService } from '../services/GitHubService';
import { formatSyncError } from '../services/git/formatSyncError';
import { StagingService } from '../services/git/StagingService';
import { gitOperationRegistry } from './gitOperationStore';

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

      let opId: string | null = null;
      if (isRepoBacked) {
        opId = gitOperationRegistry.begin({
          kind: 'delete',
          repo: todoToDelete!.repo!,
          branch: todoToDelete!.branch,
          path: todoToDelete!.filePath!,
          entityIds: [id],
          status: 'running',
          attempts: 0,
        });
      }

      try {
        // Repo-backed todos must purge the remote file first; otherwise the next
        // pull re-imports the row (#489). The sync helper already treats a
        // missing remote (sha null / 404) as success so a stale local row can
        // still be cleaned up.
        if (isRepoBacked) {
          if (!GitHubService.isAuthenticated()) {
            set({ error: 'Cannot delete repo-backed todo while signed out of GitHub' });
            if (opId) gitOperationRegistry.fail(opId, 'Cannot delete repo-backed todo while signed out of GitHub');
            return false;
          }
          const staged = await StagingService.stageDelete({
            repo: todoToDelete!.repo!,
            branch: todoToDelete!.branch,
            filePath: todoToDelete!.filePath!,
            title: todoToDelete!.text,
          });
          if (!staged.success) {
            if (staged.error) console.warn('[TodoStore] delete stage failed:', staged.error);
            set({ error: formatSyncError(staged.error, 'delete') });
            if (opId) gitOperationRegistry.fail(opId, staged.error ?? 'Delete failed');
            return false;
          }
        }

        const success = await StorageService.deleteTodo(id);
        if (success) {
          if (opId) gitOperationRegistry.succeed(opId);
          set((state) => ({ todos: state.todos.filter((t) => t.id !== id) }));
        }
        return success;
      } catch (err) {
        if (opId) gitOperationRegistry.fail(opId, err instanceof Error ? err.message : 'Delete failed');
        throw err;
      }
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
