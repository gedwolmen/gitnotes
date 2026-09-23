import { create } from 'zustand';
import type { Diagram, DiagramCreateInput, DiagramUpdateInput } from '../models/Diagram';
import { DEFAULT_DIAGRAM_DOCUMENT, sortDiagramsByUpdated } from '../models/Diagram';
import { DocumentService } from '../services/documents/DocumentService';
import { CloneSyncService } from '../services/cloneSyncServiceImpl';
import { resolveBranch } from '../services/git/resolveBranch';
import { parseFrontmatter } from '../utils/frontmatterParser';
import { parseDiagramDocument, DiagramParseError } from '../services/diagram/core/parser';

let serviceRef: DocumentService | null = null;
function getService(): DocumentService {
  serviceRef = serviceRef ?? new DocumentService();
  return serviceRef;
}

function toDiagramFromDocument(doc: {
  id: string;
  title: string;
  body: string;
  tags: readonly string[];
  createdAt: number;
  updatedAt: number;
  raw: string;
}): Diagram {
  const document = parseDiagramDocument(doc.body);
  const frontmatter = parseFrontmatter(doc.raw).frontmatter;
  const stringField = (key: string): string | undefined => {
    const value = frontmatter[key];
    return typeof value === 'string' ? value : undefined;
  };

  return {
    id: doc.id,
    title: doc.title,
    document,
    tags: doc.tags,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    repo: stringField('repo'),
    branch: stringField('branch'),
    filePath: stringField('filePath'),
    accountId: stringField('accountId'),
  };
}

function diagramExtra(input: Pick<DiagramCreateInput, 'repo' | 'branch' | 'filePath' | 'accountId'>) {
  return {
    repo: input.repo,
    branch: input.branch,
    filePath: input.filePath,
    accountId: input.accountId,
  };
}

interface DiagramState {
  diagrams: Diagram[];
  isLoading: boolean;
  error: string | null;
}

interface DiagramActions {
  loadDiagrams: () => Promise<void>;
  createDiagram: (input: DiagramCreateInput) => Promise<Diagram | null>;
  updateDiagram: (input: DiagramUpdateInput) => Promise<Diagram | null>;
  deleteDiagram: (id: string) => Promise<boolean>;
  refreshDiagrams: () => Promise<void>;
  clearError: () => void;
}

export const useDiagramStore = create<DiagramState & DiagramActions>()((set, get) => ({
  diagrams: [],
  isLoading: true,
  error: null,

  loadDiagrams: async () => {
    try {
      set({ isLoading: true, error: null });
      const service = getService();
      const metas = await service.list({ type: 'diagram' });
      const diagrams: Diagram[] = [];
      const parseErrors: string[] = [];
      for (const meta of metas) {
        const doc = await service.read(meta.id);
        if (doc === null) continue;
        try {
          diagrams.push(toDiagramFromDocument(doc));
        } catch (err) {
          if (err instanceof DiagramParseError) {
            parseErrors.push(`${meta.title ?? meta.id}: ${err.message}`);
          } else {
            parseErrors.push(`${meta.title ?? meta.id}: ${err instanceof Error ? err.message : String(err)}`);
          }
        }
      }
      if (parseErrors.length > 0) {
        set({
          diagrams: sortDiagramsByUpdated(diagrams),
          error: `Failed to parse ${parseErrors.length} diagram(s): ${parseErrors.join('; ')}`,
          isLoading: false,
        });
      } else {
        set({ diagrams: sortDiagramsByUpdated(diagrams), isLoading: false });
      }
    } catch (err) {
      set({ error: 'Failed to load diagrams', isLoading: false });
      console.error('Error loading diagrams:', err);
    }
  },

  createDiagram: async (input) => {
    try {
      set({ error: null });
      const document = input.document ?? DEFAULT_DIAGRAM_DOCUMENT;
      const doc = await getService().create({
        type: 'diagram',
        title: input.title || 'Untitled Diagram',
        body: JSON.stringify(document, null, 2),
        tags: [...(input.tags ?? [])],
        extra: diagramExtra(input),
      });
      const diagram = toDiagramFromDocument(doc);
      set((state) => ({ diagrams: sortDiagramsByUpdated([...state.diagrams, diagram]) }));
      return diagram;
    } catch (err) {
      set({ error: 'Failed to create diagram' });
      console.error('Error creating diagram:', err);
      return null;
    }
  },

  updateDiagram: async (input) => {
    try {
      set({ error: null });
      const existing = get().diagrams.find((d) => d.id === input.id);
      if (!existing) {
        set({ error: 'Diagram not found' });
        return null;
      }
      const document = input.document ?? existing.document;
      await getService().update(input.id, {
        title: input.title !== undefined ? input.title : existing.title,
        body: JSON.stringify(document, null, 2),
        tags: input.tags !== undefined ? [...input.tags] : [...existing.tags],
        extra: diagramExtra({
          repo: input.repo ?? existing.repo,
          branch: input.branch ?? existing.branch,
          filePath: input.filePath ?? existing.filePath,
          accountId: input.accountId ?? existing.accountId,
        }),
      });
      const updated: Diagram = {
        ...existing,
        title: input.title !== undefined ? input.title : existing.title,
        document,
        tags: input.tags !== undefined ? input.tags : existing.tags,
        repo: input.repo ?? existing.repo,
        branch: input.branch ?? existing.branch,
        filePath: input.filePath ?? existing.filePath,
        accountId: input.accountId ?? existing.accountId,
        updatedAt: Date.now(),
      };
      set((state) => ({
        diagrams: sortDiagramsByUpdated(
          state.diagrams.map((d) => (d.id === input.id ? updated : d)),
        ),
      }));
      return updated;
    } catch (err) {
      set({ error: 'Failed to update diagram' });
      console.error('Error updating diagram:', err);
      return null;
    }
  },

  deleteDiagram: async (id) => {
    try {
      set({ error: null });
      const service = getService();
      const doc = await service.read(id);
      if (!doc) {
        set({ error: 'Diagram not found' });
        return false;
      }
      const diagram = get().diagrams.find((d) => d.id === id);
      if (diagram?.repo && diagram.filePath) {
        const result = await CloneSyncService.save({
          repoPath: diagram.repo,
          branch: diagram.branch ?? await resolveBranch(diagram.repo),
          filePath: diagram.filePath,
          message: `Delete diagram: ${diagram.title}`,
          intent: 'delete',
        });
        if (!result.success && result.error !== 'queued') {
          set({ error: result.error ?? 'Failed to delete diagram from Git' });
          return false;
        }
      }
      await service.purge(id);
      set((state) => ({ diagrams: state.diagrams.filter((d) => d.id !== id) }));
      return true;
    } catch (err) {
      set({ error: 'Failed to delete diagram' });
      console.error('Error deleting diagram:', err);
      return false;
    }
  },

  refreshDiagrams: async () => {
    await get().loadDiagrams();
  },

  clearError: () => set({ error: null }),
}));

export const useDiagramById = (id: string) =>
  useDiagramStore((s) => s.diagrams.find((d) => d.id === id));
