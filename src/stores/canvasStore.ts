import { create } from 'zustand';
import { Canvas, CanvasCreateInput, CanvasUpdateInput, sortCanvasesByUpdated } from '../models/Canvas';
import { StorageService } from '../services/StorageService';
import { GitHubService } from '../services/GitHubService';
import { formatSyncError } from '../services/git/formatSyncError';
import { deleteCanvasFromGitHub } from '../services/CanvasGitHubSyncService';
import { gitOperationRegistry } from './gitOperationStore';

interface CanvasState {
  canvases: Canvas[];
  isLoading: boolean;
  error: string | null;
}

interface CanvasActions {
  loadCanvases: () => Promise<void>;
  createCanvas: (input: CanvasCreateInput) => Promise<Canvas | null>;
  updateCanvas: (input: CanvasUpdateInput) => Promise<Canvas | null>;
  deleteCanvas: (id: string) => Promise<boolean>;
  refreshCanvases: () => Promise<void>;
  clearError: () => void;
}

export const useCanvasStore = create<CanvasState & CanvasActions>()((set, get) => ({
  canvases: [],
  isLoading: true,
  error: null,

  loadCanvases: async () => {
    try {
      set({ isLoading: true, error: null });
      const canvases = await StorageService.getAllCanvases();
      set({ canvases: sortCanvasesByUpdated(canvases), isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load canvases', isLoading: false });
      console.error('Error loading canvases:', err);
    }
  },

  createCanvas: async (input) => {
    try {
      set({ error: null });
      const newCanvas = await StorageService.createCanvas(input);
      set((state) => ({ canvases: sortCanvasesByUpdated([...state.canvases, newCanvas]) }));
      return newCanvas;
    } catch (err) {
      set({ error: 'Failed to create canvas' });
      console.error('Error creating canvas:', err);
      return null;
    }
  },

  updateCanvas: async (input) => {
    try {
      set({ error: null });
      const updated = await StorageService.updateCanvas(input);
      if (updated) {
        set((state) => ({
          canvases: sortCanvasesByUpdated(
            state.canvases.map((c) => (c.id === input.id ? updated : c))
          ),
        }));
      }
      return updated;
    } catch (err) {
      set({ error: 'Failed to update canvas' });
      console.error('Error updating canvas:', err);
      return null;
    }
  },

  deleteCanvas: async (id) => {
    try {
      set({ error: null });
      const canvas = get().canvases.find((c) => c.id === id);

      let opId: string | null = null;
      if (canvas?.repo && canvas.filePath) {
        opId = gitOperationRegistry.begin({
          kind: 'delete',
          repo: canvas.repo,
          branch: canvas.branch,
          path: canvas.filePath,
          entityIds: [id],
          status: 'running',
          attempts: 0,
        });
      }

      try {
        // Repo-backed canvases must purge the remote file first; otherwise the
        // next pull re-imports the row. The sync helper treats a missing remote
        // (sha null / 404) as success.
        if (canvas?.repo && canvas.filePath) {
          if (!GitHubService.isAuthenticated()) {
            set({ error: 'Sign in to GitHub to delete synced canvases' });
            if (opId) gitOperationRegistry.fail(opId, 'Sign in to GitHub to delete synced canvases');
            return false;
          }
          const staged = await deleteCanvasFromGitHub({
            repo: canvas.repo,
            branch: canvas.branch,
            filePath: canvas.filePath,
            title: canvas.title,
          });
          if (!staged.success) {
            if (staged.error) console.warn('[CanvasStore] delete failed:', staged.error);
            set({ error: formatSyncError(staged.error, 'delete') });
            if (opId) gitOperationRegistry.fail(opId, staged.error ?? 'Delete failed');
            return false;
          }
        }

        const success = await StorageService.deleteCanvas(id);
        if (success) {
          if (opId) gitOperationRegistry.succeed(opId);
          set((state) => ({ canvases: state.canvases.filter((c) => c.id !== id) }));
        }
        return success;
      } catch (err) {
        if (opId) gitOperationRegistry.fail(opId, err instanceof Error ? err.message : 'Delete failed');
        throw err;
      }
    } catch (err) {
      set({ error: 'Failed to delete canvas' });
      console.error('Error deleting canvas:', err);
      return false;
    }
  },

  refreshCanvases: async () => {
    await get().loadCanvases();
  },

  clearError: () => set({ error: null }),
}));

export const useCanvasById = (id: string) =>
  useCanvasStore((s) => s.canvases.find((c) => c.id === id));
