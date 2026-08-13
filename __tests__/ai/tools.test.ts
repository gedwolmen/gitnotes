import {
  chatTools,
  createNoteParameters,
  createTodoParameters,
  deleteNoteParameters,
  deleteTodoParameters,
  editNoteParameters,
  editTodoParameters,
  getNoteParameters,
  getTodosParameters,
  searchNotesParameters,
  searchTodosParameters,
} from '../../src/services/ai/tools';

describe('chatTools registry', () => {
  test('exposes all 17 expected tools', () => {
    expect(Object.keys(chatTools).sort()).toEqual(
      [
        'create_note',
        'create_questioner_note',
        'create_todo',
        'delete_note',
        'delete_todo',
        'distill_thought_dump',
        'edit_note',
        'edit_todo',
        'find_notes',
        'find_todos',
        'generate_daily_brief',
        'get_note',
        'get_todos',
        'link_notes',
        'search_notes',
        'search_todos',
        'summarize_notes',
      ].sort(),
    );
  });
});

describe('createNoteParameters', () => {
  test('accepts minimal valid input', () => {
    expect(() =>
      createNoteParameters.parse({ title: 'a', content: 'b' }),
    ).not.toThrow();
  });

  test('rejects when title or content missing', () => {
    expect(() => createNoteParameters.parse({ content: 'b' })).toThrow();
    expect(() => createNoteParameters.parse({ title: 'a' })).toThrow();
  });

  test('format is restricted to known values', () => {
    expect(() =>
      createNoteParameters.parse({ title: 'a', content: 'b', format: 'markdown' }),
    ).not.toThrow();
    expect(() =>
      createNoteParameters.parse({ title: 'a', content: 'b', format: 'pdf' }),
    ).toThrow();
  });

  test('tags must be string[]', () => {
    expect(() =>
      createNoteParameters.parse({ title: 'a', content: 'b', tags: ['x', 'y'] }),
    ).not.toThrow();
    expect(() =>
      createNoteParameters.parse({ title: 'a', content: 'b', tags: [1] }),
    ).toThrow();
  });
});

describe('editNoteParameters', () => {
  test('requires noteId', () => {
    expect(() => editNoteParameters.parse({})).toThrow();
    expect(() => editNoteParameters.parse({ noteId: 'n1' })).not.toThrow();
  });
});

describe('deleteNoteParameters / getNoteParameters', () => {
  test('require noteId', () => {
    expect(() => deleteNoteParameters.parse({})).toThrow();
    expect(() => deleteNoteParameters.parse({ noteId: 'n' })).not.toThrow();
    expect(() => getNoteParameters.parse({})).toThrow();
    expect(() => getNoteParameters.parse({ noteId: 'n' })).not.toThrow();
  });
});

describe('searchNotesParameters', () => {
  test('requires a query string', () => {
    expect(() => searchNotesParameters.parse({})).toThrow();
    expect(() => searchNotesParameters.parse({ query: 'react' })).not.toThrow();
  });
});

describe('createTodoParameters', () => {
  test('requires text and constrains priority', () => {
    expect(() => createTodoParameters.parse({})).toThrow();
    expect(() => createTodoParameters.parse({ text: 'do' })).not.toThrow();
    expect(() =>
      createTodoParameters.parse({ text: 'do', priority: 'low' }),
    ).not.toThrow();
    expect(() =>
      createTodoParameters.parse({ text: 'do', priority: 'urgent' }),
    ).toThrow();
  });
});

describe('editTodoParameters', () => {
  test('requires todoId, accepts partial fields', () => {
    expect(() => editTodoParameters.parse({})).toThrow();
    expect(() =>
      editTodoParameters.parse({ todoId: 't', completed: true }),
    ).not.toThrow();
  });
});

describe('deleteTodoParameters', () => {
  test('requires todoId', () => {
    expect(() => deleteTodoParameters.parse({})).toThrow();
    expect(() => deleteTodoParameters.parse({ todoId: 't' })).not.toThrow();
  });
});

describe('searchTodosParameters / getTodosParameters', () => {
  test('searchTodosParameters requires query', () => {
    expect(() => searchTodosParameters.parse({})).toThrow();
    expect(() =>
      searchTodosParameters.parse({ query: 'x', includeCompleted: true }),
    ).not.toThrow();
  });

  test('getTodosParameters filter is optional but constrained', () => {
    expect(() => getTodosParameters.parse({})).not.toThrow();
    expect(() => getTodosParameters.parse({ filter: 'pending' })).not.toThrow();
    expect(() => getTodosParameters.parse({ filter: 'archived' })).toThrow();
  });
});
