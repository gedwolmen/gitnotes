import AsyncStorage from '@react-native-async-storage/async-storage';
import { useReminderStore } from '../src/stores/reminderStore';

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
  multiGet: jest.fn(),
  multiSet: jest.fn(),
  multiRemove: jest.fn(),
  multiMerge: jest.fn(),
}));

const mockStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

function resetStore() {
  useReminderStore.setState({
    items: [],
    isLoading: false,
    error: null,
    pendingFilter: null,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
});

describe('reminderStore', () => {
  describe('loadItems', () => {
    it('loads items from AsyncStorage', async () => {
      const items = [
        {
          id: 'rem-1',
          entityType: 'tag' as const,
          noteId: null,
          repoPath: null,
          folderPath: null,
          tag: 'test',
          entityLabel: 'test',
          time: '09:00',
          repeat: 'weekly' as const,
          daysOfWeek: ['monday' as const],
          isEnabled: true,
          notificationId: null,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ];
      mockStorage.getItem.mockResolvedValue(JSON.stringify(items));
      await useReminderStore.getState().loadItems();
      expect(useReminderStore.getState().items).toHaveLength(1);
      expect(useReminderStore.getState().items[0].id).toBe('rem-1');
    });

    it('defaults to empty array when storage is empty', async () => {
      mockStorage.getItem.mockResolvedValue(null);
      await useReminderStore.getState().loadItems();
      expect(useReminderStore.getState().items).toEqual([]);
    });
  });

  describe('createItem', () => {
    it('creates an item and persists it', async () => {
      mockStorage.setItem.mockResolvedValue(undefined);
      const item = await useReminderStore.getState().createItem({
        entityType: 'note',
        noteId: 'n-1',
        entityLabel: 'My Note',
        time: '09:00',
      });
      expect(item).not.toBeNull();
      expect(item!.entityType).toBe('note');
      expect(useReminderStore.getState().items).toHaveLength(1);
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateItem', () => {
    it('updates an existing item and persists', async () => {
      useReminderStore.setState({
        items: [
          {
            id: 'rem-1',
            entityType: 'tag',
            noteId: null,
            repoPath: null,
            folderPath: null,
            tag: 'old',
            entityLabel: 'old',
            time: '09:00',
            repeat: 'weekly',
            daysOfWeek: ['monday'],
            isEnabled: true,
            notificationId: null,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });
      mockStorage.setItem.mockResolvedValue(undefined);
      const result = await useReminderStore.getState().updateItem('rem-1', {
        entityLabel: 'updated',
      });
      expect(result).not.toBeNull();
      expect(result!.entityLabel).toBe('updated');
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('returns null for non-existent id', async () => {
      const result = await useReminderStore.getState().updateItem('nope', {
        entityLabel: 'x',
      });
      expect(result).toBeNull();
    });
  });

  describe('deleteItem', () => {
    it('removes an item and persists', async () => {
      useReminderStore.setState({
        items: [
          {
            id: 'rem-1',
            entityType: 'tag',
            noteId: null,
            repoPath: null,
            folderPath: null,
            tag: 'x',
            entityLabel: 'x',
            time: '09:00',
            repeat: 'weekly',
            daysOfWeek: ['monday'],
            isEnabled: true,
            notificationId: null,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });
      mockStorage.setItem.mockResolvedValue(undefined);
      const ok = await useReminderStore.getState().deleteItem('rem-1');
      expect(ok).toBe(true);
      expect(useReminderStore.getState().items).toHaveLength(0);
    });
  });

  describe('toggleItem', () => {
    it('flips isEnabled and persists', async () => {
      useReminderStore.setState({
        items: [
          {
            id: 'rem-1',
            entityType: 'tag',
            noteId: null,
            repoPath: null,
            folderPath: null,
            tag: 'x',
            entityLabel: 'x',
            time: '09:00',
            repeat: 'weekly',
            daysOfWeek: ['monday'],
            isEnabled: true,
            notificationId: null,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });
      mockStorage.setItem.mockResolvedValue(undefined);
      const ok = await useReminderStore.getState().toggleItem('rem-1');
      expect(ok).toBe(true);
      expect(useReminderStore.getState().items[0].isEnabled).toBe(false);
    });
  });

  describe('consumePendingFilter', () => {
    it('returns current value and sets to null on second call', () => {
      useReminderStore.getState().setPendingFilter({
        kind: 'folder',
        repoPath: 'me/repo',
        folderPath: 'docs',
      });
      const first = useReminderStore.getState().consumePendingFilter();
      expect(first).not.toBeNull();
      expect(first!.kind).toBe('folder');
      expect(first!.repoPath).toBe('me/repo');
      const second = useReminderStore.getState().consumePendingFilter();
      expect(second).toBeNull();
    });

    it('returns null when no filter is set', () => {
      const result = useReminderStore.getState().consumePendingFilter();
      expect(result).toBeNull();
    });
  });

  describe('getItem', () => {
    it('returns the item by id', () => {
      useReminderStore.setState({
        items: [
          {
            id: 'rem-a',
            entityType: 'tag',
            noteId: null,
            repoPath: null,
            folderPath: null,
            tag: 'x',
            entityLabel: 'x',
            time: '09:00',
            repeat: 'weekly',
            daysOfWeek: ['monday'],
            isEnabled: true,
            notificationId: null,
            createdAt: 1000,
            updatedAt: 1000,
          },
        ],
      });
      expect(useReminderStore.getState().getItem('rem-a')).toBeDefined();
      expect(useReminderStore.getState().getItem('rem-z')).toBeUndefined();
    });
  });
});
