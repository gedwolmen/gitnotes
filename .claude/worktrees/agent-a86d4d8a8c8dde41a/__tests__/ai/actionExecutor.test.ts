jest.mock('../../src/stores/noteStore', () => {
  const state = {
    notes: [] as Array<{ id: string; title: string; content: string; tags: string[] }>,
    createNote: jest.fn(async (input: unknown) => ({ id: 'new-note', ...(input as object) })),
    updateNote: jest.fn(async (input: unknown) => ({ id: 'updated', ...(input as object) })),
    deleteNote: jest.fn(async () => true),
    getNoteById: jest.fn((id: string) => state.notes.find((n: { id: string }) => n.id === id)),
  };
  return {
    useNoteStore: { getState: () => state, __state: state },
  };
});

jest.mock('../../src/stores/todoStore', () => {
  const state = {
    todos: [] as Array<{ id: string; text: string; completed: boolean; tags?: string[]; notes?: string }>,
    createTodo: jest.fn(async (input: unknown) => ({ id: 'new-todo', completed: false, ...(input as object) })),
    updateTodo: jest.fn(async (input: unknown) => ({ id: 'updated', ...(input as object) })),
    deleteTodo: jest.fn(async () => true),
  };
  return {
    useTodoStore: { getState: () => state, __state: state },
  };
});

import { executeToolCall } from '../../src/services/ai/actionExecutor';
import { useNoteStore } from '../../src/stores/noteStore';
import { useTodoStore } from '../../src/stores/todoStore';

type StoreMock<T> = { getState: () => T; __state: T };
const noteState = (useNoteStore as unknown as StoreMock<{
  notes: Array<{ id: string; title: string; content: string; tags: string[] }>;
  createNote: jest.Mock;
  updateNote: jest.Mock;
  deleteNote: jest.Mock;
  getNoteById: jest.Mock;
}>).__state;
const todoState = (useTodoStore as unknown as StoreMock<{
  todos: Array<{ id: string; text: string; completed: boolean; tags?: string[]; notes?: string }>;
  createTodo: jest.Mock;
  updateTodo: jest.Mock;
  deleteTodo: jest.Mock;
}>).__state;

beforeEach(() => {
  noteState.notes = [];
  todoState.todos = [];
  noteState.createNote.mockClear();
  noteState.updateNote.mockClear();
  noteState.deleteNote.mockClear();
  noteState.getNoteById.mockClear();
  todoState.createTodo.mockClear();
  todoState.updateTodo.mockClear();
  todoState.deleteTodo.mockClear();
});

describe('executeToolCall - unsupported / arg validation', () => {
  test('returns failure for unknown tool name', async () => {
    const result = await executeToolCall('totally_made_up', {}, 'auto');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unsupported tool/);
    expect(result.requiresConfirmation).toBe(false);
  });

  test('returns failure when required string arg is missing', async () => {
    const result = await executeToolCall('create_note', { content: 'body' }, 'auto');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/title/);
  });

  test('returns failure when string arg has wrong type', async () => {
    const result = await executeToolCall('create_note', { title: 123, content: 'b' }, 'auto');
    expect(result.success).toBe(false);
  });

  test('returns failure when tags is not a string array', async () => {
    const result = await executeToolCall(
      'create_note',
      { title: 't', content: 'c', tags: ['ok', 1] },
      'auto',
    );
    expect(result.success).toBe(false);
  });

  test('returns failure for invalid format enum', async () => {
    const result = await executeToolCall(
      'create_note',
      { title: 't', content: 'c', format: 'rtf' },
      'auto',
    );
    expect(result.success).toBe(false);
  });

  test('returns failure for invalid todo priority', async () => {
    const result = await executeToolCall('create_todo', { text: 't', priority: 'urgent' }, 'auto');
    expect(result.success).toBe(false);
  });

  test('parses dueDate strings into a numeric timestamp', async () => {
    await executeToolCall('create_todo', { text: 't', dueDate: '2026-01-01T00:00:00Z' }, 'auto');
    const arg = todoState.createTodo.mock.calls[0][0] as { dueDate: number };
    expect(typeof arg.dueDate).toBe('number');
    expect(arg.dueDate).toBe(Date.parse('2026-01-01T00:00:00Z'));
  });

  test('rejects unparseable dueDate strings', async () => {
    const result = await executeToolCall('create_todo', { text: 't', dueDate: 'not-a-date' }, 'auto');
    expect(result.success).toBe(false);
  });

  test('rejects invalid filter for get_todos', async () => {
    const result = await executeToolCall('get_todos', { filter: 'archived' }, 'auto');
    expect(result.success).toBe(false);
  });
});

describe('executeToolCall - confirm mode', () => {
  test('create_note in confirm mode returns proposedChanges and does not call store', async () => {
    const result = await executeToolCall(
      'create_note',
      { title: 'Hello', content: 'World' },
      'confirm',
    );
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedChanges?.type).toBe('create_note');
    expect(result.proposedChanges?.description).toContain('Hello');
    expect(noteState.createNote).not.toHaveBeenCalled();
  });

  test('delete_note in confirm mode emits targetId', async () => {
    const result = await executeToolCall('delete_note', { noteId: 'n1' }, 'confirm');
    expect(result.proposedChanges?.targetId).toBe('n1');
    expect(noteState.deleteNote).not.toHaveBeenCalled();
  });

  test('edit_todo in confirm mode strips undefined fields from details', async () => {
    const result = await executeToolCall(
      'edit_todo',
      { todoId: 't1', completed: true },
      'confirm',
    );
    expect(result.proposedChanges?.details).toEqual({ id: 't1', completed: true });
  });
});

describe('executeToolCall - auto mode mutations', () => {
  test('create_note dispatches store.createNote', async () => {
    const result = await executeToolCall(
      'create_note',
      { title: 'T', content: 'C' },
      'auto',
    );
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(noteState.createNote).toHaveBeenCalledWith({
      title: 'T',
      content: 'C',
      tags: undefined,
      format: undefined,
    });
  });

  test('delete_todo dispatches store.deleteTodo', async () => {
    await executeToolCall('delete_todo', { todoId: 't9' }, 'auto');
    expect(todoState.deleteTodo).toHaveBeenCalledWith('t9');
  });
});

describe('executeToolCall - read tools', () => {
  test('search_notes filters across title, content, tags', async () => {
    noteState.notes = [
      { id: 'a', title: 'Hello world', content: '', tags: [] },
      { id: 'b', title: '', content: 'totally relevant', tags: [] },
      { id: 'c', title: '', content: '', tags: ['react'] },
      { id: 'd', title: 'unrelated', content: 'nope', tags: [] },
    ];
    const result = await executeToolCall('search_notes', { query: 'react' }, 'auto');
    expect(result.success).toBe(true);
    expect((result.data as Array<{ id: string }>).map((n) => n.id)).toEqual(['c']);
  });

  test('search_notes builds excerpt for long content', async () => {
    const long = 'x'.repeat(500);
    noteState.notes = [{ id: 'a', title: 'k', content: long, tags: [] }];
    const result = await executeToolCall('search_notes', { query: '' }, 'auto');
    const matches = result.data as Array<{ excerpt: string }>;
    expect(matches[0].excerpt.endsWith('...')).toBe(true);
    expect(matches[0].excerpt.length).toBe(103);
  });

  test('get_note returns the note from store', async () => {
    noteState.notes = [{ id: 'a', title: 'A', content: 'b', tags: [] }];
    const result = await executeToolCall('get_note', { noteId: 'a' }, 'auto');
    expect(result.success).toBe(true);
    expect((result.data as { id: string }).id).toBe('a');
  });

  test('search_todos honors includeCompleted=false', async () => {
    todoState.todos = [
      { id: 't1', text: 'open task', completed: false },
      { id: 't2', text: 'done task', completed: true },
    ];
    const result = await executeToolCall(
      'search_todos',
      { query: 'task', includeCompleted: false },
      'auto',
    );
    expect((result.data as Array<{ id: string }>).map((t) => t.id)).toEqual(['t1']);
  });

  test('get_todos applies filter', async () => {
    todoState.todos = [
      { id: 't1', text: 'open', completed: false },
      { id: 't2', text: 'done', completed: true },
    ];
    const pending = await executeToolCall('get_todos', { filter: 'pending' }, 'auto');
    expect((pending.data as Array<{ id: string }>).map((t) => t.id)).toEqual(['t1']);
    const completed = await executeToolCall('get_todos', { filter: 'completed' }, 'auto');
    expect((completed.data as Array<{ id: string }>).map((t) => t.id)).toEqual(['t2']);
    const all = await executeToolCall('get_todos', {}, 'auto');
    expect((all.data as Array<{ id: string }>)).toHaveLength(2);
  });
});
