import { create } from 'zustand';
import { NoteTemplate, NOTE_TEMPLATES } from '../services/TemplateService';
import { StorageService } from '../services/StorageService';

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
      id: `custom-${Date.now()}`,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...get().customTemplates, template];
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });
    return template;
  },

  updateTemplate: async (id, updates) => {
    const next = get().customTemplates.map((t) => (t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t));
    await StorageService.saveCustomTemplates(next);
    set({ customTemplates: next });
  },

  deleteTemplate: async (id) => {
    const template = get().customTemplates.find((t) => t.id === id);
    if (!template?.isCustom) return;
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
