jest.mock('../../src/stores/noteStore', () => {
  const state = {
    notes: [] as Array<Record<string, unknown>>,
    getNoteById: jest.fn((id: string) => state.notes.find((note) => note.id === id)),
    updateNote: jest.fn(async () => ({
      id: 'n1',
      title: 'New Title',
      content: 'New body',
      filePath: 'notes/new-title.md',
      format: 'markdown',
      tags: ['a'],
      createdAt: 100,
      updatedAt: 200,
    })),
  };
  return {
    useNoteStore: { getState: () => state, __state: state },
  };
});

jest.mock('../../src/stores/aiStore', () => {
  const state = {
    githubToolsEnabled: true,
    chatRepoOwner: null as string | null,
    chatRepoName: null as string | null,
    chatRepoBranch: 'main',
    selectedModel: undefined as Record<string, unknown> | undefined,
    providers: [] as Array<Record<string, unknown>>,
    getSelectedModel: () => state.selectedModel,
  };
  return {
    useAIStore: { getState: () => state, __state: state },
  };
});

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: { getState: () => ({ todos: [] }), __state: { todos: [] } },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => undefined),
    drain: jest.fn(),
  },
}));

jest.mock('ai', () => ({
  ...jest.requireActual('ai'),
  generateText: jest.fn(async () => ({ text: 'graded' })),
}));

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({})),
}));

import { executeToolCall } from '../../src/services/ai/actionExecutor';
import { useNoteStore } from '../../src/stores/noteStore';
import { useAIStore } from '../../src/stores/aiStore';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';

type StoreMock<T> = { getState: () => T; __state: T };

const noteState = (useNoteStore as unknown as StoreMock<{
  updateNote: jest.Mock;
}>).__state;
const aiState = (useAIStore as unknown as StoreMock<{
  githubToolsEnabled: boolean;
  chatRepoOwner: string | null;
  chatRepoName: string | null;
  chatRepoBranch: string;
}>).__state;

beforeEach(() => {
  jest.clearAllMocks();
  aiState.githubToolsEnabled = true;
  aiState.chatRepoOwner = null;
  aiState.chatRepoName = null;
  aiState.chatRepoBranch = 'main';
  noteState.updateNote.mockClear();
  (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mockClear();
});

describe('executeToolCall edit_note sync enqueue', () => {
  test('enqueues a sync upsert carrying repo, filePath, title, content and localNoteId when a chat repo is set', async () => {
    aiState.chatRepoOwner = 'owner';
    aiState.chatRepoName = 'repo';
    aiState.chatRepoBranch = 'dev';

    const result = await executeToolCall(
      'edit_note',
      { noteId: 'n1', title: 'New Title', content: 'New body' },
      'auto',
    );

    expect(result.success).toBe(true);
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);

    const [params, localNoteId] = (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mock
      .calls[0];
    expect(params).toEqual(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'dev',
        filePath: 'notes/new-title.md',
        title: 'New Title',
        content: 'New body',
        format: 'markdown',
        tags: ['a'],
      }),
    );
    expect(localNoteId).toBe('n1');
  });

  test('skips the sync queue when no chat repo is set but the edit still succeeds', async () => {
    const result = await executeToolCall(
      'edit_note',
      { noteId: 'n1', title: 'New Title', content: 'New body' },
      'auto',
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ noteId: 'n1', title: 'New Title' });
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
  });
});
