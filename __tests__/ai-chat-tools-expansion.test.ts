jest.mock('../src/stores/noteStore', () => {
  const state = {
    notes: [] as Array<Record<string, unknown>>,
    getNoteById: jest.fn((id: string) => state.notes.find((note) => note.id === id)),
    createNote: jest.fn(async (input: Record<string, unknown>) => ({
      id: 'created-note',
      createdAt: 100,
      updatedAt: 100,
      ...input,
    })),
    updateNote: jest.fn(async (input: Record<string, unknown>) => {
      const existing = state.notes.find((note) => note.id === input.id);
      return existing ? { ...existing, ...input } : null;
    }),
    deleteNote: jest.fn(async () => true),
  };
  return {
    useNoteStore: { getState: () => state, __state: state },
  };
});

jest.mock('../src/stores/todoStore', () => {
  const state = {
    todos: [] as Array<Record<string, unknown>>,
  };
  return {
    useTodoStore: { getState: () => state, __state: state },
  };
});

jest.mock('../src/stores/aiStore', () => {
  const state = {
    githubToolsEnabled: true,
    chatRepoOwner: null as string | null,
    chatRepoName: null as string | null,
    chatRepoBranch: 'main',
  };
  return {
    useAIStore: { getState: () => state, __state: state },
  };
});

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => undefined),
    drain: jest.fn(),
  },
}));

import { executeToolCall } from '../src/services/ai/actionExecutor';
import {
  chatTools,
  createQuestionerNoteParameters,
  distillThoughtDumpParameters,
  findNotesParameters,
  findTodosParameters,
  generateDailyBriefParameters,
  linkNotesParameters,
  summarizeNotesParameters,
} from '../src/services/ai/tools';
import { useNoteStore } from '../src/stores/noteStore';
import { useTodoStore } from '../src/stores/todoStore';
import { useAIStore } from '../src/stores/aiStore';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';

type StoreMock<T> = { getState: () => T; __state: T };

const noteState = (useNoteStore as unknown as StoreMock<{
  notes: Array<Record<string, unknown>>;
  getNoteById: jest.Mock;
  createNote: jest.Mock;
  updateNote: jest.Mock;
}>).__state;
const todoState = (useTodoStore as unknown as StoreMock<{
  todos: Array<Record<string, unknown>>;
}>).__state;
const aiState = (useAIStore as unknown as StoreMock<{
  githubToolsEnabled: boolean;
  chatRepoOwner: string | null;
  chatRepoName: string | null;
  chatRepoBranch: string;
}>).__state;

function makeNote(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: `note-${noteState.notes.length}`,
    title: 'Untitled',
    content: '',
    tags: [],
    createdAt: 100,
    updatedAt: 100,
    ...overrides,
  };
}

beforeEach(() => {
  noteState.notes = [];
  todoState.todos = [];
  aiState.githubToolsEnabled = true;
  aiState.chatRepoOwner = null;
  aiState.chatRepoName = null;
  aiState.chatRepoBranch = 'main';
  noteState.createNote.mockClear();
  noteState.updateNote.mockClear();
  (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mockClear();
  (NoteSyncQueueService.drain as jest.Mock).mockClear();
});

describe('chat-tools expansion — schema validation', () => {
  interface SchemaCase {
    label: string;
    schema: { parse: (value: unknown) => unknown };
    valid: Record<string, unknown>;
    invalid: Record<string, unknown>;
  }

  const cases: SchemaCase[] = [
    {
      label: 'createQuestionerNoteParameters',
      schema: createQuestionerNoteParameters,
      valid: { topic: 'Type theory', content: 'Q1? Q2?', sourceNotes: ['n1'], tags: ['study'] },
      invalid: { topic: 'Type theory' },
    },
    {
      label: 'findNotesParameters',
      schema: findNotesParameters,
      valid: { query: 'react', tags: ['web'], sortBy: 'alphabetical', limit: 5 },
      invalid: { query: 'react', limit: 0 },
    },
    {
      label: 'findTodosParameters',
      schema: findTodosParameters,
      valid: { query: 'review', status: 'pending', priority: 'high', sortBy: 'due' },
      invalid: { status: 'archived' },
    },
    {
      label: 'summarizeNotesParameters',
      schema: summarizeNotesParameters,
      valid: { noteIds: ['n1', 'n2'], content: 'Combined summary', outputTitle: 'Sum' },
      invalid: { noteIds: 'n1', content: 'body' },
    },
    {
      label: 'distillThoughtDumpParameters',
      schema: distillThoughtDumpParameters,
      valid: { sourceNoteIds: ['n1'], content: 'Distilled body', outputTitle: 'Clean note' },
      invalid: { sourceNoteIds: ['n1'], content: 'Distilled body' },
    },
    {
      label: 'linkNotesParameters',
      schema: linkNotesParameters,
      valid: { noteIds: ['n1', 'n2'], relationship: 'contradicts' },
      invalid: { noteIds: ['only-one'] },
    },
    {
      label: 'generateDailyBriefParameters',
      schema: generateDailyBriefParameters,
      valid: { content: 'Brief body', topics: ['work'], outputTags: ['daily'] },
      invalid: { topics: ['work'] },
    },
  ];

  test.each(cases)('$label accepts valid args', ({ schema, valid }) => {
    expect(() => schema.parse(valid)).not.toThrow();
  });

  test.each(cases)('$label rejects invalid args', ({ schema, invalid }) => {
    expect(() => schema.parse(invalid)).toThrow();
  });

  test('chatTools exposes all 7 new tools alongside the original 10', () => {
    expect(Object.keys(chatTools).sort()).toEqual(
      [
        'create_note',
        'edit_note',
        'delete_note',
        'search_notes',
        'get_note',
        'create_todo',
        'edit_todo',
        'delete_todo',
        'search_todos',
        'get_todos',
        'create_questioner_note',
        'find_notes',
        'find_todos',
        'summarize_notes',
        'distill_thought_dump',
        'link_notes',
        'generate_daily_brief',
      ].sort(),
    );
  });
});

describe('chat-tools expansion — read tools return data', () => {
  test('find_notes returns matches and total for all matching notes', async () => {
    noteState.notes = [
      makeNote({ id: 'n1', title: 'Review notes', content: 'review hooks', tags: ['web'], updatedAt: 5 }),
      makeNote({ id: 'n2', title: 'Rust ownership', content: 'review borrow', tags: ['lang'], updatedAt: 4 }),
      makeNote({ id: 'n3', title: 'React testing', content: 'review jest', tags: ['web', 'test'], updatedAt: 3 }),
      makeNote({ id: 'n4', title: 'Cooking', content: 'review pasta', tags: ['home'], updatedAt: 2 }),
      makeNote({ id: 'n5', title: 'React internals', content: 'review fiber', tags: ['web'], updatedAt: 1 }),
    ];

    const result = await executeToolCall('find_notes', { query: 'review' }, 'auto');

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    const data = result.data as {
      matches: Array<{ id: string; excerpt: string; updatedAt: number | null }>;
      total: number;
    };
    expect(data.total).toBe(5);
    expect(data.matches.map((note) => note.id)).toEqual(['n1', 'n2', 'n3', 'n4', 'n5']);
    expect(data.matches[0].excerpt).toBe('review hooks');
    expect(data.matches[0].updatedAt).toBe(5);
  });

  test('find_notes applies tag exclusion, alphabetical sort and limit', async () => {
    noteState.notes = [
      makeNote({ id: 'n1', title: 'Beta', tags: ['web'], updatedAt: 5 }),
      makeNote({ id: 'n2', title: 'Alpha', tags: ['web'], updatedAt: 4 }),
      makeNote({ id: 'n3', title: 'Gamma', tags: ['web', 'skip'], updatedAt: 3 }),
    ];

    const result = await executeToolCall(
      'find_notes',
      { query: '', tags: ['web'], excludeTags: ['skip'], sortBy: 'alphabetical', limit: 1 },
      'auto',
    );

    const data = result.data as { matches: Array<{ id: string; title: string }>; total: number };
    expect(data.total).toBe(2);
    expect(data.matches.map((note) => ({ id: note.id, title: note.title }))).toEqual([
      { id: 'n2', title: 'Alpha' },
    ]);
  });

  test('find_todos filters by status and priority and returns filterApplied', async () => {
    todoState.todos = [
      { id: 't1', text: 'open high', completed: false, priority: 'high', createdAt: 30, tags: ['work'] },
      { id: 't2', text: 'open low', completed: false, priority: 'low', createdAt: 20 },
      { id: 't3', text: 'done high', completed: true, priority: 'high', createdAt: 10 },
    ];

    const result = await executeToolCall(
      'find_todos',
      { status: 'pending', priority: 'high', sortBy: 'priority' },
      'auto',
    );

    const data = result.data as {
      matches: Array<{ id: string }>;
      total: number;
      filterApplied: { status: string; priority: string | null; query: string };
    };
    expect(data.total).toBe(1);
    expect(data.matches.map((todo) => todo.id)).toEqual(['t1']);
    expect(data.filterApplied).toEqual({ status: 'pending', priority: 'high', query: '' });
  });

  test('find_todos dueBefore drops todos without or beyond the due date', async () => {
    const cutoff = Date.parse('2026-08-01T00:00:00Z');
    todoState.todos = [
      { id: 't1', text: 'due before', completed: false, dueDate: cutoff - 1000, createdAt: 2 },
      { id: 't2', text: 'due after', completed: false, dueDate: cutoff + 1000, createdAt: 1 },
      { id: 't3', text: 'no due date', completed: false, createdAt: 3 },
    ];

    const result = await executeToolCall(
      'find_todos',
      { dueBefore: '2026-08-01T00:00:00Z' },
      'auto',
    );

    const data = result.data as { matches: Array<{ id: string }>; total: number };
    expect(data.matches.map((todo) => todo.id)).toEqual(['t1']);
    expect(data.total).toBe(1);
  });
});

describe('chat-tools expansion — write tools respect confirm mode', () => {
  test.each([
    {
      tool: 'create_questioner_note',
      args: { topic: 'Topic', content: 'Question?' },
      expectedType: 'create_questioner_note',
    },
    {
      tool: 'summarize_notes',
      args: { noteIds: ['n1', 'n2'], content: 'The summary body' },
      expectedType: 'summarize_notes',
      seedNotes: [makeNote({ id: 'n1', title: 'One' }), makeNote({ id: 'n2', title: 'Two' })],
    },
    {
      tool: 'distill_thought_dump',
      args: { sourceNoteIds: ['n1'], content: 'Clean body', outputTitle: 'Clean' },
      expectedType: 'distill_thought_dump',
    },
    {
      tool: 'link_notes',
      args: { noteIds: ['n1', 'n2'] },
      expectedType: 'link_notes',
      seedNotes: [makeNote({ id: 'n1', title: 'One' }), makeNote({ id: 'n2', title: 'Two' })],
    },
    {
      tool: 'generate_daily_brief',
      args: { content: 'Today in review' },
      expectedType: 'generate_daily_brief',
    },
  ] as Array<{ tool: string; args: Record<string, unknown>; expectedType: string; seedNotes?: Array<Record<string, unknown>> }>)(
    '$tool in confirm mode returns proposedChanges without touching the store',
    async ({ tool, args, expectedType, seedNotes }) => {
      if (seedNotes) {
        noteState.notes = seedNotes;
      }

      const result = await executeToolCall(tool, args, 'confirm');

      expect(result.success).toBe(true);
      expect(result.requiresConfirmation).toBe(true);
      expect(result.proposedChanges?.type).toBe(expectedType);
      expect(noteState.createNote).not.toHaveBeenCalled();
      expect(noteState.updateNote).not.toHaveBeenCalled();
    },
  );

  test.each(['auto', 'confirm'] as const)(
    'grade_questioner_answers (%s mode) returns a clean error — feature removed in #836',
    async (mode) => {
      noteState.notes = [makeNote({ id: 'q1', title: 'Quiz', tags: ['questioner'] })];

      const result = await executeToolCall('grade_questioner_answers', { noteId: 'q1' }, mode);

      expect(result.success).toBe(false);
      expect(result.requiresConfirmation).toBe(false);
      expect(result.error).toMatch(/replaced by the Reminder system in PR #836/);
    },
  );
});

describe('chat-tools expansion — create_questioner_note forces the questioner tag', () => {
  test('merge user tags with the forced questioner tag', async () => {
    const result = await executeToolCall(
      'create_questioner_note',
      { topic: 'Type theory', content: 'What is a monad?', tags: ['study'] },
      'auto',
    );

    expect(result.success).toBe(true);
    const input = noteState.createNote.mock.calls[0][0] as { tags: string[]; content: string };
    expect(input.tags).toEqual(['study', 'questioner']);
    expect(input.content).toContain('<!-- sl-item-id: chat-gen-');
    const data = result.data as { tag: string; questionCount: number };
    expect(data.tag).toBe('questioner');
    expect(data.questionCount).toBe(1);
  });

  test('does not duplicate the questioner tag when the user already supplies it', async () => {
    await executeToolCall(
      'create_questioner_note',
      { topic: 'Topic', content: 'Q?', tags: ['questioner'] },
      'auto',
    );

    const input = noteState.createNote.mock.calls[0][0] as { tags: string[] };
    expect(input.tags).toEqual(['questioner']);
  });
});

describe('chat-tools expansion — chatRepoSync behavior', () => {
  test('write tools enqueue sync and drain when a chat repo is selected', async () => {
    aiState.chatRepoOwner = 'me';
    aiState.chatRepoName = 'notes-repo';
    aiState.chatRepoBranch = 'dev';

    await executeToolCall(
      'generate_daily_brief',
      { content: 'Open items: 3', outputTags: ['morning'] },
      'auto',
    );

    const createInput = noteState.createNote.mock.calls[0][0] as { repo?: string; branch?: string };
    expect(createInput.repo).toBe('me/notes-repo');
    expect(createInput.branch).toBe('dev');
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(NoteSyncQueueService.drain).toHaveBeenCalled();
  });

  test('write tools skip the sync queue when no chat repo is selected', async () => {
    await executeToolCall('generate_daily_brief', { content: 'Body' }, 'auto');

    expect(noteState.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'markdown', tags: ['daily-brief'] }),
    );
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });

  test('link_notes appends link sections and enqueues an upsert per updated note', async () => {
    aiState.chatRepoOwner = 'me';
    aiState.chatRepoName = 'notes-repo';
    noteState.notes = [
      makeNote({ id: 'n1', title: 'First', content: 'aaa' }),
      makeNote({ id: 'n2', title: 'Second', content: 'bbb' }),
    ];

    const result = await executeToolCall(
      'link_notes',
      { noteIds: ['n1', 'n2'], relationship: 'sequence' },
      'auto',
    );

    expect(result.success).toBe(true);
    expect(noteState.updateNote).toHaveBeenCalledTimes(2);
    const firstUpdate = noteState.updateNote.mock.calls[0][0] as { id: string; content: string };
    expect(firstUpdate.content).toContain('## Sequence');
    expect(firstUpdate.content).toContain('[[Second]]');
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(2);
    expect(NoteSyncQueueService.drain).toHaveBeenCalled();
    expect((result.data as { linked: number }).linked).toBe(2);
  });
});

describe('chat-tools expansion — regression guards', () => {
  test('GitHub gate still fires for GitHub tools when disabled', async () => {
    aiState.githubToolsEnabled = false;

    const result = await executeToolCall('list_repos', {}, 'auto');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/GitHub tools are disabled/);
  });

  test('create_note still works unchanged after the enqueueNoteSync extraction', async () => {
    const result = await executeToolCall('create_note', { title: 'T', content: 'C' }, 'auto');

    expect(result.success).toBe(true);
    expect(noteState.createNote).toHaveBeenCalledWith({
      title: 'T',
      content: 'C',
      tags: undefined,
      format: undefined,
    });
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();

    const data = result.data as { synced: boolean };
    expect(data.synced).toBe(false);
  });
});
