import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import {
  type ReminderCreateInput,
  type ReminderItem,
  createReminder,
  updateReminder,
} from '../models/Reminder';

const STORAGE_KEY = '@gitnotes:reminders';

/**
 * Navigation filter pushed by App.tsx when the user taps a folder/repo/tag
 * reminder notification. Consumed atomically by NotesListScreen on focus.
 * In-memory only — never persisted.
 */
export interface ReminderNavigationFilter {
  kind: 'folder' | 'repo' | 'tag';
  repoPath?: string;
  folderPath?: string;
  tag?: string;
}

interface ReminderState {
  items: ReminderItem[];
  isLoading: boolean;
  error: string | null;
  pendingFilter: ReminderNavigationFilter | null;
}

interface ReminderActions {
  loadItems: () => Promise<void>;
  createItem: (input: ReminderCreateInput) => Promise<ReminderItem | null>;
  updateItem: (
    id: string,
    updates: Partial<ReminderItem>,
  ) => Promise<ReminderItem | null>;
  deleteItem: (id: string) => Promise<boolean>;
  toggleItem: (id: string) => Promise<boolean>;
  setPendingFilter: (filter: ReminderNavigationFilter | null) => void;
  consumePendingFilter: () => ReminderNavigationFilter | null;
  getItem: (id: string) => ReminderItem | undefined;
  clearError: () => void;
}

async function persist(items: ReminderItem[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error('[reminderStore] persistence failed:', err);
  }
}

export const useReminderStore = create<ReminderState & ReminderActions>()(
  (set, get) => ({
    items: [],
    isLoading: true,
    error: null,
    pendingFilter: null,

    loadItems: async () => {
      try {
        set({ isLoading: true, error: null });
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const items: ReminderItem[] = raw ? JSON.parse(raw) : [];
        set({ items, isLoading: false });
      } catch (err) {
        set({ error: 'Failed to load reminders', isLoading: false });
        console.error('[reminderStore] loadItems failed:', err);
      }
    },

    createItem: async (input) => {
      try {
        set({ error: null });
        const newItem = createReminder(input);
        const next = [...get().items, newItem];
        await persist(next);
        set({ items: next });
        return newItem;
      } catch (err) {
        set({ error: 'Failed to create reminder' });
        console.error('[reminderStore] createItem failed:', err);
        return null;
      }
    },

    updateItem: async (id, updates) => {
      try {
        set({ error: null });
        const existing = get().items.find((item) => item.id === id);
        if (!existing) return null;
        // updateReminder expects ReminderCreateInput-shaped partial, but
        // callers also pass { notificationId, isEnabled } — spread directly.
        const updated: ReminderItem = {
          ...existing,
          ...updates,
          updatedAt: Date.now(),
        };
        const next = get().items.map((it) => (it.id === id ? updated : it));
        await persist(next);
        set({ items: next });
        return updated;
      } catch (err) {
        set({ error: 'Failed to update reminder' });
        console.error('[reminderStore] updateItem failed:', err);
        return null;
      }
    },

    deleteItem: async (id) => {
      try {
        set({ error: null });
        const next = get().items.filter((item) => item.id !== id);
        await persist(next);
        set({ items: next });
        return true;
      } catch (err) {
        set({ error: 'Failed to delete reminder' });
        console.error('[reminderStore] deleteItem failed:', err);
        return false;
      }
    },

    toggleItem: async (id) => {
      const item = get().items.find((i) => i.id === id);
      if (!item) return false;
      return (await get().updateItem(id, { isEnabled: !item.isEnabled })) !== null;
    },

    setPendingFilter: (filter) => set({ pendingFilter: filter }),

    consumePendingFilter: () => {
      const current = get().pendingFilter;
      if (current !== null) {
        set({ pendingFilter: null });
      }
      return current;
    },

    getItem: (id) => get().items.find((i) => i.id === id),

    clearError: () => set({ error: null }),
  }),
);

// Suppress the "unused import" warning when the module is loaded purely for
// the store export. `updateReminder` is re-exported below for callers that
// prefer the pure-function form over the store action.
export { updateReminder };

void useReminderStore.getState().loadItems();
