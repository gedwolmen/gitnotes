import { create } from 'zustand';
import { NoteTemplate, NOTE_TEMPLATES } from '../services/TemplateService';
import { StorageService } from '../services/StorageService';
import { TemplateRepoPreferenceService } from '../services/TemplateRepoPreferenceService';
import {
  syncTemplateToGitHub,
  deleteTemplateFromGitHub,
} from '../services/TemplateGitHubSyncService';
import { serializeTemplate, templateSlug } from '../services/TemplateMarkdownService';
import { generateId } from '../utils/ids';
import { formatSyncError } from '../services/git/formatSyncError';
import { FEATURE_STAGE_PUSH } from '../services/featureFlags';
import { StagingService } from '../services/git/StagingService';

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

    let synced = template;
    const pref = await TemplateRepoPreferenceService.get();
    if (pref) {
      if (FEATURE_STAGE_PUSH) {
        const staged = await StagingService.stageUpsert({
          repo: pref.repoPath,
          branch: pref.branch,
          filePath: template.filePath ?? `templates/${templateSlug(template.name)}.md`,
          title: template.name,
          content: serializeTemplate({ ...template, filePath: undefined }),
        });
        if (!staged.success) {
          console.warn(`[templateStore] Failed to stage template "${template.name}" to GitHub: ${formatSyncError(staged.error, 'upsert')}`);
        }
      } else {
        const result = await syncTemplateToGitHub({
          repoPath: pref.repoPath,
          branch: pref.branch,
          template,
        });
        if (result.success && result.filePath) {
          synced = { ...template, filePath: result.filePath };
        } else if (!result.success) {
          console.warn(`[templateStore] Failed to sync template "${template.name}" to GitHub: ${formatSyncError(result.error, 'upsert')}`);
        }
      }
    }

    const next = [...get().customTemplates, synced];
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });
    return synced;
  },

  updateTemplate: async (id, updates) => {
    const current = get().customTemplates.find((t) => t.id === id);
    if (!current) return;

    const merged: NoteTemplate = { ...current, ...updates, updatedAt: Date.now() };

    const pref = await TemplateRepoPreferenceService.get();
    if (pref) {
      if (FEATURE_STAGE_PUSH) {
        const staged = await StagingService.stageUpsert({
          repo: pref.repoPath,
          branch: pref.branch,
          filePath: merged.filePath ?? `templates/${templateSlug(merged.name)}.md`,
          title: merged.name,
          content: serializeTemplate({ ...merged, filePath: undefined }),
        });
        if (!staged.success) {
          console.warn(`[templateStore] Failed to stage template "${merged.name}" to GitHub: ${formatSyncError(staged.error, 'upsert')}`);
        }
      } else {
        const result = await syncTemplateToGitHub({
          repoPath: pref.repoPath,
          branch: pref.branch,
          template: merged,
        });
        if (result.success && result.filePath) {
          merged.filePath = result.filePath;
        } else if (!result.success) {
          console.warn(`[templateStore] Failed to sync template "${merged.name}" to GitHub: ${formatSyncError(result.error, 'upsert')}`);
        }
      }
    }

    const next = get().customTemplates.map((t) => (t.id === id ? merged : t));
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });
  },

  deleteTemplate: async (id) => {
    const template = get().customTemplates.find((t) => t.id === id);
    if (!template?.isCustom) return;

    const pref = await TemplateRepoPreferenceService.get();
    if (pref && template.filePath) {
      if (FEATURE_STAGE_PUSH) {
        const staged = await StagingService.stageDelete({
          repo: pref.repoPath,
          branch: pref.branch,
          filePath: template.filePath,
          title: template.name,
        });
        if (!staged.success) {
          console.warn(`[templateStore] Failed to stage template "${template.name}" deletion: ${formatSyncError(staged.error, 'delete')}`);
        }
      } else {
        const delResult = await deleteTemplateFromGitHub({
          repoPath: pref.repoPath,
          branch: pref.branch,
          filePath: template.filePath,
          name: template.name,
        });
        if (!delResult.success) {
          console.warn(`[templateStore] Failed to delete template "${template.name}" from GitHub: ${formatSyncError(delResult.error, 'delete')}`);
        }
      }
    }

    const next = get().customTemplates.filter((t) => t.id !== id);
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });
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
