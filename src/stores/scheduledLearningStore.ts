import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import {
  ScheduledLearningItem,
  ScheduledLearningCreateInput,
  createScheduledLearningItem,
  updateScheduledLearningItem,
  DayOfWeek,
} from '../models/ScheduledLearning';

const SCHEDULED_LEARNING_STORAGE_KEY = '@gitnotes:scheduled-learning';

interface ScheduledLearningState {
  items: ScheduledLearningItem[];
  isLoading: boolean;
  error: string | null;
}

interface ScheduledLearningActions {
  loadItems: () => Promise<void>;
  createItem: (input: ScheduledLearningCreateInput) => Promise<ScheduledLearningItem | null>;
  updateItem: (id: string, updates: Partial<ScheduledLearningItem>) => Promise<ScheduledLearningItem | null>;
  deleteItem: (id: string) => Promise<boolean>;
  toggleItem: (id: string) => Promise<boolean>;
  refreshItems: () => Promise<void>;
  clearError: () => void;
  markGenerated: (id: string, day?: DayOfWeek) => Promise<void>;
}

export const useScheduledLearningStore = create<ScheduledLearningState & ScheduledLearningActions>()((set, get) => ({
  items: [],
  isLoading: true,
  error: null,

  loadItems: async () => {
    try {
      set({ isLoading: true, error: null });
      const raw = await AsyncStorage.getItem(SCHEDULED_LEARNING_STORAGE_KEY);
      const items: ScheduledLearningItem[] = raw ? JSON.parse(raw) : [];
      set({ items, isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load scheduled learning items', isLoading: false });
      console.error('Error loading scheduled learning items:', err);
    }
  },

  createItem: async (input) => {
    try {
      set({ error: null });
      const newItem = createScheduledLearningItem(input);
      const updatedItems = [...get().items, newItem];
      await AsyncStorage.setItem(SCHEDULED_LEARNING_STORAGE_KEY, JSON.stringify(updatedItems));
      set({ items: updatedItems });
      return newItem;
    } catch (err) {
      set({ error: 'Failed to create scheduled learning item' });
      console.error('Error creating scheduled learning item:', err);
      return null;
    }
  },

  updateItem: async (id, updates) => {
    try {
      set({ error: null });
      const existing = get().items.find((item) => item.id === id);
      if (!existing) return null;

      const updated = updateScheduledLearningItem(existing, updates);
      const updatedItems = get().items.map((item) => (item.id === id ? updated : item));
      await AsyncStorage.setItem(SCHEDULED_LEARNING_STORAGE_KEY, JSON.stringify(updatedItems));
      set({ items: updatedItems });
      return updated;
    } catch (err) {
      set({ error: 'Failed to update scheduled learning item' });
      console.error('Error updating scheduled learning item:', err);
      return null;
    }
  },

  deleteItem: async (id) => {
    try {
      set({ error: null });
      const updatedItems = get().items.filter((item) => item.id !== id);
      await AsyncStorage.setItem(SCHEDULED_LEARNING_STORAGE_KEY, JSON.stringify(updatedItems));
      set({ items: updatedItems });
      return true;
    } catch (err) {
      set({ error: 'Failed to delete scheduled learning item' });
      console.error('Error deleting scheduled learning item:', err);
      return false;
    }
  },

  toggleItem: async (id) => {
    const item = get().items.find((item) => item.id === id);
    if (!item) return false;
    return (await get().updateItem(id, { isEnabled: !item.isEnabled })) !== null;
  },

  refreshItems: async () => {
    await get().loadItems();
  },

  clearError: () => set({ error: null }),

  markGenerated: async (id, day) => {
    const item = get().items.find((item) => item.id === id);
    if (!item) return;
    const updates: Partial<ScheduledLearningItem> = { lastGeneratedAt: Date.now() };
    if (day !== undefined) {
      updates.dayLastGeneratedAt = { ...item.dayLastGeneratedAt, [day]: Date.now() };
    }
    await get().updateItem(id, updates);
  },
}));

void useScheduledLearningStore.getState().loadItems();