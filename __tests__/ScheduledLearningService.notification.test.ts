import { ScheduledLearningService } from '../src/services/ScheduledLearningService';
import { createScheduledLearningItem, ScheduledLearningItem } from '../src/models/ScheduledLearning';
import type { Note } from '../src/models/Note';

const mockNote: Note = {
  id: 'note-1',
  title: 'mock',
  content: 'content',
  tags: [],
  format: 'markdown',
  createdAt: 0,
  updatedAt: 0,
};

const mockScheduleNotification = jest.fn(async () => 'notif-id');

jest.mock('../src/services/NotificationService', () => ({
  NotificationService: {
    requestPermissions: jest.fn(async () => true),
    scheduleLearningNotification: (...args: unknown[]) => mockScheduleNotification(...args),
    cancelReminder: jest.fn(async () => undefined),
  },
}));

const mockAiState = {
  selectedModelId: 'model-1',
  providers: [
    {
      isEnabled: true,
      models: [{ id: 'model-1', name: 'Mock', providerId: 'prov-1', providerType: 'openai-compatible' }],
    },
  ],
  availableModels: [{ id: 'model-1', name: 'Mock', providerId: 'prov-1', providerType: 'openai-compatible' }],
};

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: {
    getState: () => ({
      ...mockAiState,
      getAvailableModels: () => mockAiState.availableModels,
    }),
  },
}));

const mockCreateNote = jest.fn(async () => ({ ...mockNote }));
const mockUpdateNote = jest.fn(async () => mockNote);

jest.mock('../src/stores/noteStore', () => ({
  useNoteStore: {
    getState: () => ({
      notes: [],
      createNote: (...args: unknown[]) => mockCreateNote(...args),
      updateNote: (...args: unknown[]) => mockUpdateNote(...args),
      getNoteById: () => mockNote,
    }),
  },
}));

jest.mock('../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({})),
}));

const mockMarkGenerated = jest.fn(async () => undefined);
const mockItems: ScheduledLearningItem[] = [];
jest.mock('../src/stores/scheduledLearningStore', () => ({
  useScheduledLearningStore: {
    getState: () => ({
      items: mockItems,
      markGenerated: (...args: unknown[]) => mockMarkGenerated(...args),
    }),
  },
}));

jest.mock('ai', () => ({
  generateText: jest.fn(async () => ({ text: 'mocked response body' })),
}));

beforeEach(() => {
  mockScheduleNotification.mockClear();
  mockMarkGenerated.mockClear();
  mockCreateNote.mockClear();
  mockItems.length = 0;
});

describe('ScheduledLearningService.scheduleNotification', () => {
  it('uses reminder copy and includes noteId in data for questioner items', async () => {
    const item: ScheduledLearningItem = createScheduledLearningItem({
      type: 'questioner',
      tags: ['algebra'],
      daysOfWeek: ['monday'],
      time: '09:00',
      wordCount: 250,
      questionerSource: 'tags',
      questionerPrompts: [],
      questionerFolders: [],
    });

    const id = await ScheduledLearningService.scheduleNotification(item, 'note-xyz');
    expect(id).toBe('notif-id');
    expect(mockScheduleNotification).toHaveBeenCalledTimes(1);
    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.title).toBe('Question time!');
    expect(call.body).toMatch(/algebra/);
    expect(call.data).toEqual({ scheduledLearningId: item.id, noteId: 'note-xyz' });
  });

  it('uses learning copy and omits noteId when not provided', async () => {
    const item: ScheduledLearningItem = createScheduledLearningItem({
      type: 'learn',
      tags: ['history'],
      daysOfWeek: ['tuesday'],
      time: '10:00',
      wordCount: 500,
    });
    await ScheduledLearningService.scheduleNotification(item);
    const call = mockScheduleNotification.mock.calls[0][0];
    expect(call.title).toBe('Time to learn!');
    expect(call.body).toMatch(/history/);
    expect(call.data).toEqual({ scheduledLearningId: item.id });
  });
});

describe('ScheduledLearningService.generateNow', () => {
  it('creates a note, marks generated, and returns the created note', async () => {
    mockCreateNote.mockResolvedValueOnce({ ...mockNote, id: 'fresh-note' });
    const item: ScheduledLearningItem = createScheduledLearningItem({
      type: 'questioner',
      tags: ['algebra'],
      daysOfWeek: ['monday'],
      time: '09:00',
      wordCount: 250,
      questionerSource: 'tags',
      questionerPrompts: [],
      questionerFolders: [],
    });
    const result = await ScheduledLearningService.generateNow(item);
    expect(result).toEqual({ ...mockNote, id: 'fresh-note' });
    expect(mockCreateNote).toHaveBeenCalledTimes(1);
    expect(mockMarkGenerated).toHaveBeenCalledTimes(1);
  });

  it('returns null and does not mark generated when AI initialization fails', async () => {
    const { initializeModel } = require('../src/services/AIService');
    (initializeModel as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    const item: ScheduledLearningItem = createScheduledLearningItem({
      type: 'learn',
      tags: ['history'],
      daysOfWeek: ['monday'],
      time: '09:00',
      wordCount: 500,
    });
    const result = await ScheduledLearningService.generateNow(item);
    expect(result).toBeNull();
    expect(mockCreateNote).not.toHaveBeenCalled();
    expect(mockMarkGenerated).not.toHaveBeenCalled();
  });
});