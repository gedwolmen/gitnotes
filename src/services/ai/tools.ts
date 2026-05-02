import { tool } from 'ai';
import { z } from 'zod';

export const createNoteParameters = z.object({
  title: z.string(),
  content: z.string(),
  tags: z.array(z.string()).optional(),
  format: z.enum(['markdown', 'neorg', 'org']).optional(),
});

export const create_note = tool({
  description: 'Create a new note with optional tags and format.',
  inputSchema: createNoteParameters,
  execute: async (params) => params,
});

export const editNoteParameters = z.object({
  noteId: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const edit_note = tool({
  description: 'Edit an existing note by id.',
  inputSchema: editNoteParameters,
  execute: async (params) => params,
});

export const deleteNoteParameters = z.object({
  noteId: z.string(),
});

export const delete_note = tool({
  description: 'Delete a note by id.',
  inputSchema: deleteNoteParameters,
  execute: async (params) => params,
});

export const searchNotesParameters = z.object({
  query: z.string(),
});

export const search_notes = tool({
  description: 'Search notes by a text query.',
  inputSchema: searchNotesParameters,
  execute: async (params) => params,
});

export const getNoteParameters = z.object({
  noteId: z.string(),
});

export const get_note = tool({
  description: 'Fetch a single note by id.',
  inputSchema: getNoteParameters,
  execute: async (params) => params,
});

export const createTodoParameters = z.object({
  text: z.string(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
});

export const create_todo = tool({
  description: 'Create a new todo with optional scheduling metadata.',
  inputSchema: createTodoParameters,
  execute: async (params) => params,
});

export const editTodoParameters = z.object({
  todoId: z.string(),
  text: z.string().optional(),
  completed: z.boolean().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
});

export const edit_todo = tool({
  description: 'Edit an existing todo by id.',
  inputSchema: editTodoParameters,
  execute: async (params) => params,
});

export const deleteTodoParameters = z.object({
  todoId: z.string(),
});

export const delete_todo = tool({
  description: 'Delete a todo by id.',
  inputSchema: deleteTodoParameters,
  execute: async (params) => params,
});

export const searchTodosParameters = z.object({
  query: z.string(),
  includeCompleted: z.boolean().optional(),
});

export const search_todos = tool({
  description: 'Search todos by a text query.',
  inputSchema: searchTodosParameters,
  execute: async (params) => params,
});

export const getTodosParameters = z.object({
  filter: z.enum(['all', 'pending', 'completed']).optional(),
});

export const get_todos = tool({
  description: 'List todos using an optional completion filter.',
  inputSchema: getTodosParameters,
  execute: async (params) => params,
});

export const chatTools = {
  create_note,
  edit_note,
  delete_note,
  search_notes,
  get_note,
  create_todo,
  edit_todo,
  delete_todo,
  search_todos,
  get_todos,
};
