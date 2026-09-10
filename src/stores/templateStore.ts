import { create } from 'zustand';
import { NoteTemplate, NOTE_TEMPLATES } from '../services/TemplateService';
import { StorageService } from '../services/StorageService';
import { generateId } from '../utils/ids';
import { syncTemplateToGitHub, deleteTemplateFromGitHub } from '../services/TemplateGitHubSyncService';
import { TemplateRepoPreferenceService } from '../services/TemplateRepoPreferenceService';
import { getActiveBranch } from '../services/git/activeBranchStore';
import { useRepoStore } from './repoStore';

async function syncTemplateToGitHubIfConfigured(template: NoteTemplate): Promise<void> {
  try {
    const templatesRepoPref = await TemplateRepoPreferenceService.get();
    if (!templatesRepoPref) return;

    const repositories = useRepoStore.getState().repositories;
    const repoId = repositories.find((r) => r.path === templatesRepoPref.repoPath)?.id;
    if (!repoId) return;

    const activeBranchState = await getActiveBranch(repoId);
    const branch = activeBranchState?.activeBranch ?? 'main';

    await syncTemplateToGitHub({ repoPath: templatesRepoPref.repoPath, branch, template });
  } catch (error) {
    console.warn('[templateStore] GitHub sync failed:', error);
  }
}

async function deleteTemplateFromGitHubIfConfigured(filePath: string, name: string): Promise<void> {
  try {
    const templatesRepoPref = await TemplateRepoPreferenceService.get();
    if (!templatesRepoPref) return;

    const repositories = useRepoStore.getState().repositories;
    const repoId = repositories.find((r) => r.path === templatesRepoPref.repoPath)?.id;
    if (!repoId) return;

    const activeBranchState = await getActiveBranch(repoId);
    const branch = activeBranchState?.activeBranch ?? 'main';

    await deleteTemplateFromGitHub({ repoPath: templatesRepoPref.repoPath, branch, filePath, name });
  } catch (error) {
    console.warn('[templateStore] GitHub template deletion sync failed:', error);
  }
}

interface TemplateState {
  customTemplates: NoteTemplate[];
  pinnedIds: string[];
  isLoading: boolean;
  loadTemplates: () => Promise<void>;
  createTemplate: (template: Omit<NoteTemplate, 'id' | 'isCustom' | 'createdAt' | 'updatedAt'>) => Promise<NoteTemplate>;
  updateTemplate: (id: string, updates: Partial<NoteTemplate>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  getAllTemplates: () => NoteTemplate[];
}

export const useTemplateStore = create<TemplateState>()((set, get) => ({
  customTemplates: [],
  pinnedIds: [],
  isLoading: false,

  loadTemplates: async () => {
    set({ isLoading: true });
    const [customs, pins] = await Promise.all([
      StorageService.loadCustomTemplates(),
      StorageService.loadTemplatePins(),
    ]);
    set({ customTemplates: customs || [], pinnedIds: pins || [], isLoading: false });
  },

  createTemplate: async (input) => {
    const template: NoteTemplate = {
      ...input,
      id: `custom-${generateId()}`,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const next = [...get().customTemplates, template];
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });

    await syncTemplateToGitHubIfConfigured(template);

    return template;
  },

  updateTemplate: async (id, updates) => {
    const current = get().customTemplates.find((t) => t.id === id);
    if (!current) return;

    const merged: NoteTemplate = { ...current, ...updates, updatedAt: Date.now() };

    const next = get().customTemplates.map((t) => (t.id === id ? merged : t));
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });

    await syncTemplateToGitHubIfConfigured(merged);
  },

  deleteTemplate: async (id) => {
    const template = get().customTemplates.find((t) => t.id === id);
    if (!template?.isCustom) return;

    const next = get().customTemplates.filter((t) => t.id !== id);
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });

    if (template.filePath) {
      await deleteTemplateFromGitHubIfConfigured(template.filePath, template.name);
    }
  },

  togglePin: async (id) => {
    const current = get().pinnedIds;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    await StorageService.saveTemplatePins(next);
    set({ pinnedIds: next });
  },

  getAllTemplates: () => {
    const { customTemplates, pinnedIds } = get();
    const all = [
      ...NOTE_TEMPLATES.map((t) => ({ ...t, isPinned: pinnedIds.includes(t.id) })),
      ...customTemplates.map((t) => ({ ...t, isPinned: pinnedIds.includes(t.id) })),
    ];
    return all.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return 0;
    });
  },
}));
