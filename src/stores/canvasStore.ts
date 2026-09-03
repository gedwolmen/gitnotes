import { create } from 'zustand';
import { Canvas, CanvasCreateInput, CanvasUpdateInput, sortCanvasesByUpdated } from '../models/Canvas';
import { DocumentService } from '../services/documents/DocumentService';

/**
 * Canvas store on the document model.
 *
 * A canvas is a `canvas` document: its scene (CanvasScene) is serialized as the
 * file body (`.json` under `documents/canvas/<slug>.json`). The document id is
 * the canvas id. All CRUD routes through DocumentService (type='canvas').
 */

let serviceRef: DocumentService | null = null;
function getService(): DocumentService {
  serviceRef = serviceRef ?? new DocumentService();
  return serviceRef;
}

function toCanvasFromDocument(doc: {
  id: string;
  title: string;
  body: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}): Canvas {
  let scene: Canvas['scene'];
  try {
    const parsed: unknown = JSON.parse(doc.body);
    if (parsed && typeof parsed === 'object' && Array.isArray((parsed as { elements?: unknown }).elements)) {
      scene = parsed as Canvas['scene'];
    } else {
      scene = { version: 1, width: 800, height: 600, background: '#FFFFFF', elements: [] };
    }
  } catch {
    scene = { version: 1, width: 800, height: 600, background: '#FFFFFF', elements: [] };
  }
  return {
    id: doc.id,
    title: doc.title,
    scene,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

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
      const service = getService();
      const metas = await service.list({ type: 'canvas' });
      const canvases: Canvas[] = [];
      for (const meta of metas) {
        const doc = await service.read(meta.id);
        if (doc === null) continue;
        canvases.push(toCanvasFromDocument(doc));
      }
      set({ canvases: sortCanvasesByUpdated(canvases), isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load canvases', isLoading: false });
      console.error('Error loading canvases:', err);
    }
  },

  createCanvas: async (input) => {
    try {
      set({ error: null });
      const scene = input.scene ?? { version: 1, width: 800, height: 600, background: '#FFFFFF', elements: [] };
      const doc = await getService().create({
        type: 'canvas',
        title: input.title || 'Untitled Canvas',
        body: JSON.stringify(scene, null, 2),
        tags: input.tags ?? [],
      });
      const canvas = toCanvasFromDocument(doc);
      set((state) => ({ canvases: sortCanvasesByUpdated([...state.canvases, canvas]) }));
      return canvas;
    } catch (err) {
      set({ error: 'Failed to create canvas' });
      console.error('Error creating canvas:', err);
      return null;
    }
  },

  updateCanvas: async (input) => {
    try {
      set({ error: null });
      const existing = get().canvases.find((c) => c.id === input.id);
      if (!existing) {
        set({ error: 'Canvas not found' });
        return null;
      }
      const scene = input.scene ?? existing.scene;
      await getService().update(input.id, {
        title: input.title !== undefined ? input.title : existing.title,
        body: JSON.stringify(scene, null, 2),
        tags: input.tags !== undefined ? input.tags : existing.tags,
      });
      const updated: Canvas = {
        ...existing,
        title: input.title !== undefined ? input.title : existing.title,
        scene,
        tags: input.tags !== undefined ? input.tags : existing.tags,
        updatedAt: Date.now(),
      };
      set((state) => ({
        canvases: sortCanvasesByUpdated(
          state.canvases.map((c) => (c.id === input.id ? updated : c)),
        ),
      }));
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
      const service = getService();
      const doc = await service.read(id);
      if (!doc) {
        set({ error: 'Canvas not found' });
        return false;
      }
      await service.purge(id);
      set((state) => ({ canvases: state.canvases.filter((c) => c.id !== id) }));
      return true;
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
