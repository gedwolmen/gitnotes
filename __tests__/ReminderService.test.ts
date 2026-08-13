import { ReminderService } from '../src/services/ReminderService';
import { NotificationService } from '../src/services/NotificationService';
import { useReminderStore } from '../src/stores/reminderStore';
import { useNoteStore } from '../src/stores/noteStore';
import type { ReminderItem } from '../src/models/Reminder';

jest.mock('../src/services/NotificationService', () => ({
  NotificationService: {
    scheduleLearningNotification: jest.fn(),
    cancelReminder: jest.fn(),
    requestPermissions: jest.fn(),
  },
}));

jest.mock('../src/stores/reminderStore', () => ({
  useReminderStore: {
    getState: jest.fn(),
  },
}));

jest.mock('../src/stores/noteStore', () => ({
  useNoteStore: {
    getState: jest.fn(),
  },
}));

const mockNotification = NotificationService as jest.Mocked<
  typeof NotificationService
>;
const mockReminderStore = useReminderStore as jest.Mocked<
  typeof useReminderStore
>;
const mockNoteStore = useNoteStore as jest.Mocked<typeof useNoteStore>;

function makeItem(
  overrides: Partial<ReminderItem> = {},
): ReminderItem {
  return {
    id: 'rem-1',
    entityType: 'tag',
    noteId: null,
    repoPath: null,
    folderPath: null,
    tag: 'test',
    entityLabel: 'test',
    time: '09:00',
    repeat: 'weekly',
    daysOfWeek: ['monday'],
    isEnabled: true,
    notificationId: null,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockReminderStore.getState.mockReturnValue({
    updateItem: jest.fn().mockResolvedValue(null),
    getItem: jest.fn(),
    items: [],
    isLoading: false,
    error: null,
    pendingFilter: null,
    loadItems: jest.fn(),
    createItem: jest.fn(),
    deleteItem: jest.fn(),
    toggleItem: jest.fn(),
    setPendingFilter: jest.fn(),
    consumePendingFilter: jest.fn(),
    clearError: jest.fn(),
    refreshItems: jest.fn(),
  } as any);
  mockNoteStore.getState.mockReturnValue({
    getNoteById: jest.fn().mockReturnValue({
      id: 'n-1',
      title: 'Test Note',
    }),
  } as any);
});

describe('ReminderService', () => {
  describe('scheduleNotification', () => {
    it('schedules notification with correct data for a tag reminder', async () => {
      mockNotification.scheduleLearningNotification.mockResolvedValue('nid-1');
      const item = makeItem({ entityType: 'tag', tag: 'important', entityLabel: 'important' });
      const result = await ReminderService.scheduleNotification(item);
      expect(result).toBe('nid-1');
      expect(
        mockNotification.scheduleLearningNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Review tagged notes',
          body: '#important',
          data: expect.objectContaining({
            kind: 'tag',
            reminderId: 'rem-1',
            tag: 'important',
          }),
        }),
      );
    });

    it('schedules notification for a note reminder', async () => {
      mockNotification.scheduleLearningNotification.mockResolvedValue('nid-2');
      const item = makeItem({
        entityType: 'note',
        noteId: 'n-1',
        entityLabel: 'Test Note',
      });
      const result = await ReminderService.scheduleNotification(item);
      expect(result).toBe('nid-2');
      expect(
        mockNotification.scheduleLearningNotification,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Time to read',
          body: 'Test Note',
        }),
      );
    });

    it('cancels existing notification before scheduling', async () => {
      mockNotification.cancelReminder.mockResolvedValue(undefined);
      mockNotification.scheduleLearningNotification.mockResolvedValue('nid-new');
      const item = makeItem({ notificationId: 'old-nid' });
      await ReminderService.scheduleNotification(item);
      expect(mockNotification.cancelReminder).toHaveBeenCalledWith('old-nid');
    });

    it('persists notificationId back on the item', async () => {
      const updateMock = jest.fn().mockResolvedValue(null);
      mockReminderStore.getState.mockReturnValue({
        updateItem: updateMock,
      } as any);
      mockNotification.scheduleLearningNotification.mockResolvedValue('nid-3');
      const item = makeItem();
      await ReminderService.scheduleNotification(item);
      expect(updateMock).toHaveBeenCalledWith('rem-1', {
        notificationId: 'nid-3',
      });
    });

    it('returns null when no future dates are available', async () => {
      const item = makeItem({ daysOfWeek: [], repeat: 'weekly' });
      const result = await ReminderService.scheduleNotification(item);
      expect(result).toBeNull();
      expect(
        mockNotification.scheduleLearningNotification,
      ).not.toHaveBeenCalled();
    });
  });

  describe('cancelNotification', () => {
    it('cancels by stored notificationId', async () => {
      mockNotification.cancelReminder.mockResolvedValue(undefined);
      const item = makeItem({ notificationId: 'cancel-me' });
      await ReminderService.cancelNotification(item);
      expect(mockNotification.cancelReminder).toHaveBeenCalledWith(
        'cancel-me',
      );
    });

    it('does nothing when notificationId is null', async () => {
      const item = makeItem({ notificationId: null });
      await ReminderService.cancelNotification(item);
      expect(mockNotification.cancelReminder).not.toHaveBeenCalled();
    });
  });
});
