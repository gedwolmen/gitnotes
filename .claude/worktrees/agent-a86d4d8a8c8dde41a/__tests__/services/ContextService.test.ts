jest.mock('../../src/stores/noteStore', () => {
  const state = {
    notes: [] as Array<{
      id: string;
      title: string;
      content: string;
      tags: string[];
      folderPath?: string;
    }>,
  };
  return {
    useNoteStore: { getState: () => state, __state: state },
  };
});

jest.mock('../../src/stores/todoStore', () => {
  const state = {
    todos: [] as Array<{
      id: string;
      text: string;
      completed: boolean;
      priority?: 'low' | 'medium' | 'high';
    }>,
  };
  return {
    useTodoStore: { getState: () => state, __state: state },
  };
});

jest.mock('../../src/services/AuthService', () => ({
  __esModule: true,
  default: { getToken: jest.fn(async () => 'token') },
}));

jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import {
  getLocalNotesForContext,
  getLocalTodosForContext,
  isBinaryFile,
} from '../../src/services/ContextService';
import { useNoteStore } from '../../src/stores/noteStore';
import { useTodoStore } from '../../src/stores/todoStore';

type StoreMock<T> = { getState: () => T; __state: T };
const noteState = (useNoteStore as unknown as StoreMock<{
  notes: Array<{ id: string; title: string; content: string; tags: string[]; folderPath?: string }>;
}>).__state;
const todoState = (useTodoStore as unknown as StoreMock<{
  todos: Array<{ id: string; text: string; completed: boolean; priority?: 'low' | 'medium' | 'high' }>;
}>).__state;

beforeEach(() => {
  noteState.notes = [];
  todoState.todos = [];
});

describe('isBinaryFile', () => {
  test('detects common binary extensions case-insensitively', () => {
    expect(isBinaryFile('photo.PNG')).toBe(true);
    expect(isBinaryFile('clip.mp4')).toBe(true);
    expect(isBinaryFile('archive.tar.gz')).toBe(true);
    expect(isBinaryFile('doc.pdf')).toBe(true);
  });

  test('treats text files as non-binary', () => {
    expect(isBinaryFile('README.md')).toBe(false);
    expect(isBinaryFile('app.tsx')).toBe(false);
    expect(isBinaryFile('config.yaml')).toBe(false);
  });
});

describe('getLocalNotesForContext', () => {
  test('returns sentinel when no notes', () => {
    expect(getLocalNotesForContext()).toBe('No local notes found.');
  });

  test('renders title, content, and tags for each note', () => {
    noteState.notes = [
      { id: 'a', title: 'A', content: 'body-a', tags: ['x', 'y'] },
      { id: 'b', title: 'B', content: 'body-b', tags: [] },
    ];
    const out = getLocalNotesForContext();
    expect(out).toContain('## A');
    expect(out).toContain('body-a');
    expect(out).toContain('Tags: x, y');
    expect(out).toContain('## B');
    expect(out).toContain('Tags: none');
  });

  test('filters by normalized folderPath (matches with or without leading slash)', () => {
    noteState.notes = [
      { id: 'a', title: 'A', content: '', tags: [], folderPath: '/foo' },
      { id: 'b', title: 'B', content: '', tags: [], folderPath: 'foo/' },
      { id: 'c', title: 'C', content: '', tags: [], folderPath: '/other' },
      { id: 'd', title: 'D', content: '', tags: [] },
    ];
    const out = getLocalNotesForContext('foo');
    expect(out).toContain('## A');
    expect(out).toContain('## B');
    expect(out).not.toContain('## C');
    expect(out).not.toContain('## D');
  });
});

describe('getLocalTodosForContext', () => {
  test('returns sentinel when no todos', () => {
    expect(getLocalTodosForContext()).toBe('No local todos found.');
  });

  test('splits pending and completed sections, defaulting priority to medium', () => {
    todoState.todos = [
      { id: 't1', text: 'open hi', completed: false },
      { id: 't2', text: 'open lo', completed: false, priority: 'low' },
      { id: 't3', text: 'done', completed: true, priority: 'high' },
    ];
    const out = getLocalTodosForContext();
    expect(out).toContain('## Pending');
    expect(out).toContain('## Completed');
    expect(out).toContain('- [ ] open hi (medium)');
    expect(out).toContain('- [ ] open lo (low)');
    expect(out).toContain('- [x] done (high)');
  });

  test('renders empty section as "- none"', () => {
    todoState.todos = [{ id: 't1', text: 'only-open', completed: false }];
    const out = getLocalTodosForContext();
    expect(out).toMatch(/## Completed\n- none/);
  });
});
