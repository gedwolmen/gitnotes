import AsyncStorage from '@react-native-async-storage/async-storage';
import { useScheduledLearningStore } from '../src/stores/scheduledLearningStore';
import { createScheduledLearningItem } from '../src/models/ScheduledLearning';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}));

describe('ScheduledLearningStore', () => {
  beforeEach(async () => {
    jest.resetAllMocks();
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    useScheduledLearningStore.setState({
      items: [],
      isLoading: false,
      error: null,
    });
    await useScheduledLearningStore.getState().loadItems();
  });

  describe('loadItems', () => {
    it('loads items from AsyncStorage', async () => {
      const mockItems = [
        createScheduledLearningItem({
          tags: ['react'],
          daysOfWeek: ['monday'],
          time: '09:00',
          wordCount: 500,
        }),
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(mockItems));

      await useScheduledLearningStore.getState().loadItems();

      const state = useScheduledLearningStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].tags).toEqual(['react']);
    });

    it('sets loading state during fetch', async () => {
      (AsyncStorage.getItem as jest.Mock).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('[]'), 50))
      );

      const loadPromise = useScheduledLearningStore.getState().loadItems();

      expect(useScheduledLearningStore.getState().isLoading).toBe(true);

      await loadPromise;
      expect(useScheduledLearningStore.getState().isLoading).toBe(false);
    });

    it('handles empty storage gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await useScheduledLearningStore.getState().loadItems();

      const state = useScheduledLearningStore.getState();
      expect(state.items).toHaveLength(0);
    });

    it('handles JSON parse errors', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid json');

      await useScheduledLearningStore.getState().loadItems();

      const state = useScheduledLearningStore.getState();
      expect(state.error).toBe('Failed to load scheduled learning items');
    });
  });

  describe('createItem', () => {
    it('creates a new scheduled learning item', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['typescript'],
        daysOfWeek: ['tuesday', 'thursday'],
        time: '14:00',
        wordCount: 750,
        description: 'Learn TypeScript',
      });

      expect(newItem).not.toBeNull();
      expect(newItem?.tags).toEqual(['typescript']);
      expect(newItem?.daysOfWeek).toEqual(['tuesday', 'thursday']);
      expect(newItem?.time).toBe('14:00');
      expect(newItem?.wordCount).toBe(750);
      expect(newItem?.description).toBe('Learn TypeScript');
      expect(newItem?.isEnabled).toBe(true);
    });

    it('persists item to AsyncStorage', async () => {
      await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@gitnotes:scheduled-learning',
        expect.any(String)
      );
    });

    it('returns null on error', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      expect(result).toBeNull();
      expect(useScheduledLearningStore.getState().error).toBe('Failed to create scheduled learning item');
    });
  });

  describe('updateItem', () => {
    it('updates existing item', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['old-tag'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      const updated = await useScheduledLearningStore.getState().updateItem(newItem!.id, {
        tags: ['new-tag'],
        description: 'Updated description',
      });

      expect(updated).not.toBeNull();
      expect(updated?.tags).toEqual(['new-tag']);
      expect(updated?.description).toBe('Updated description');
    });

    it('preserves unchanged fields', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['keep'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
        modelId: 'gpt-4',
      });

      const updated = await useScheduledLearningStore.getState().updateItem(newItem!.id, {
        wordCount: 750,
      });

      expect(updated?.tags).toEqual(['keep']);
      expect(updated?.modelId).toBe('gpt-4');
      expect(updated?.wordCount).toBe(750);
    });

    it('returns null for non-existent item', async () => {
      const result = await useScheduledLearningStore.getState().updateItem('non-existent', {
        tags: ['test'],
      });

      expect(result).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('removes item from list', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      expect(useScheduledLearningStore.getState().items).toHaveLength(1);

      const result = await useScheduledLearningStore.getState().deleteItem(newItem!.id);

      expect(result).toBe(true);
      expect(useScheduledLearningStore.getState().items).toHaveLength(0);
    });

    it('updates AsyncStorage after deletion', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      await useScheduledLearningStore.getState().deleteItem(newItem!.id);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@gitnotes:scheduled-learning',
        '[]'
      );
    });
  });

  describe('toggleItem', () => {
    it('toggles item enabled state', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      expect(newItem?.isEnabled).toBe(true);

      const result = await useScheduledLearningStore.getState().toggleItem(newItem!.id);

      expect(result).toBe(true);
      const toggled = useScheduledLearningStore.getState().items.find((i) => i.id === newItem!.id);
      expect(toggled?.isEnabled).toBe(false);
    });

    it('returns false for non-existent item', async () => {
      const result = await useScheduledLearningStore.getState().toggleItem('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('markGenerated', () => {
    it('updates lastGeneratedAt timestamp', async () => {
      const newItem = await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      expect(newItem?.lastGeneratedAt).toBeNull();

      await useScheduledLearningStore.getState().markGenerated(newItem!.id);

      const updated = useScheduledLearningStore.getState().items.find((i) => i.id === newItem!.id);
      expect(updated?.lastGeneratedAt).not.toBeNull();
      expect(updated?.lastGeneratedAt).toBeGreaterThan(0);
    });
  });

  describe('refreshItems', () => {
    it('reloads items from storage', async () => {
      await useScheduledLearningStore.getState().createItem({
        tags: ['test'],
        daysOfWeek: ['monday'],
        time: '10:00',
        wordCount: 500,
      });

      const newMockItems = [
        createScheduledLearningItem({
          tags: ['loaded'],
          daysOfWeek: ['wednesday'],
          time: '15:00',
          wordCount: 300,
        }),
      ];
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(newMockItems));

      await useScheduledLearningStore.getState().refreshItems();

      const state = useScheduledLearningStore.getState();
      expect(state.items).toHaveLength(1);
      expect(state.items[0].tags).toEqual(['loaded']);
    });
  });

  describe('clearError', () => {
    it('clears error state', () => {
      useScheduledLearningStore.setState({ error: 'Some error' });

      useScheduledLearningStore.getState().clearError();

      expect(useScheduledLearningStore.getState().error).toBeNull();
    });
  });
});