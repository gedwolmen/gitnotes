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

export const createQuestionerNoteParameters = z.object({
  topic: z.string(),
  content: z.string(),
  sourceNotes: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  format: z.enum(['markdown', 'neorg', 'org']).optional(),
});

export const create_questioner_note = tool({
  description:
    "Create a quiz-style note with open questions on a topic for the user to answer. The result is automatically tagged 'questioner'; use grade_questioner_answers later to grade the user's answers.",
  inputSchema: createQuestionerNoteParameters,
  execute: async (params) => params,
});

export const gradeQuestionerNoteParameters = z.object({
  noteId: z.string(),
});

export const grade_questioner_answers = tool({
  description:
    "Grade a questioner note with the currently selected AI model — strips any previous grading section and appends a fresh '## Grading & Corrections' block. The note must carry the 'questioner' tag.",
  inputSchema: gradeQuestionerNoteParameters,
  execute: async (params) => params,
});

export const findNotesParameters = z.object({
  query: z.string(),
  tags: z.array(z.string()).optional(),
  excludeTags: z.array(z.string()).optional(),
  folderPath: z.string().optional(),
  sortBy: z.enum(['recent', 'alphabetical']).optional(),
  limit: z.number().int().positive().optional(),
});

export const find_notes = tool({
  description: 'Richer note search with full-text + tag inclusion/exclusion + folder scope + sort + limit.',
  inputSchema: findNotesParameters,
  execute: async (params) => params,
});

export const findTodosParameters = z.object({
  query: z.string().optional(),
  status: z.enum(['all', 'pending', 'completed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  tags: z.array(z.string()).optional(),
  dueBefore: z.string().optional(),
  sortBy: z.enum(['due', 'priority', 'recent']).optional(),
});

export const find_todos = tool({
  description: 'Richer todo search with status/priority/tags/due-before + sort.',
  inputSchema: findTodosParameters,
  execute: async (params) => params,
});

export const summarizeNotesParameters = z.object({
  noteIds: z.array(z.string()),
  content: z.string(),
  outputTitle: z.string().optional(),
  outputTags: z.array(z.string()).optional(),
  format: z.enum(['markdown', 'neorg', 'org']).optional(),
});

export const summarize_notes = tool({
  description:
    'Persist a summary note composed from multiple source notes. The agent synthesizes the summary in its response; this tool saves it with a source-note-ids marker.',
  inputSchema: summarizeNotesParameters,
  execute: async (params) => params,
});

export const distillThoughtDumpParameters = z.object({
  sourceNoteIds: z.array(z.string()),
  content: z.string(),
  outputTitle: z.string(),
  outputTags: z.array(z.string()).optional(),
});

export const distill_thought_dump = tool({
  description:
    'Distill raw thought-dump content into a clean, themed note. Creates one distilled note per call — loop for multiple.',
  inputSchema: distillThoughtDumpParameters,
  execute: async (params) => params,
});

export const linkNotesParameters = z.object({
  noteIds: z.array(z.string()).min(2),
  relationship: z.enum(['related', 'sequence', 'contradicts']).optional(),
});

export const link_notes = tool({
  description:
    "Add wiki-link cross-references between 2+ notes. Appends a '## Related' section with [[name]] links to each targeted note.",
  inputSchema: linkNotesParameters,
  execute: async (params) => params,
});

export const generateDailyBriefParameters = z.object({
  content: z.string(),
  topics: z.array(z.string()).optional(),
  outputTags: z.array(z.string()).optional(),
});

export const generate_daily_brief = tool({
  description: "Create a dated daily brief note aggregating today's open todos and recent notes.",
  inputSchema: generateDailyBriefParameters,
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
  create_questioner_note,
  grade_questioner_answers,
  find_notes,
  find_todos,
  summarize_notes,
  distill_thought_dump,
  link_notes,
  generate_daily_brief,
};

export const listReposParameters = z.object({});

export const list_repos = tool({
  description: 'List the repositories accessible with the linked account.',
  inputSchema: listReposParameters,
  execute: async (params) => params,
});

export const listIssuesParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).optional(),
});

export const list_issues = tool({
  description: 'List issues in a repository with an optional state filter.',
  inputSchema: listIssuesParameters,
  execute: async (params) => params,
});

export const createIssueParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string().optional(),
  labels: z.array(z.string()).optional(),
  assignees: z.array(z.string()).optional(),
});

export const create_issue = tool({
  description: 'Create a new issue in a repository.',
  inputSchema: createIssueParameters,
  execute: async (params) => params,
});

export const listPullRequestsParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  state: z.enum(['open', 'closed', 'all']).optional(),
});

export const list_pull_requests = tool({
  description: 'List pull requests in a repository with an optional state filter.',
  inputSchema: listPullRequestsParameters,
  execute: async (params) => params,
});

export const createPullRequestParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  title: z.string(),
  body: z.string().optional(),
  head: z.string(),
  base: z.string(),
});

export const create_pull_request = tool({
  description: 'Create a new pull request from a head branch into a base branch.',
  inputSchema: createPullRequestParameters,
  execute: async (params) => params,
});

export const getPullRequestDiffParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  pull_number: z.number(),
});

export const get_pull_request_diff = tool({
  description: 'Fetch the diff of a pull request by number.',
  inputSchema: getPullRequestDiffParameters,
  execute: async (params) => params,
});

export const reviewPullRequestParameters = z.object({
  owner: z.string(),
  repo: z.string(),
  pull_number: z.number(),
  body: z.string(),
  event: z.enum(['APPROVE', 'REQUEST_CHANGES', 'COMMENT']),
});

export const review_pull_request = tool({
  description: 'Submit a review on a pull request.',
  inputSchema: reviewPullRequestParameters,
  execute: async (params) => params,
});

export const githubTools = {
  list_repos,
  list_issues,
  create_issue,
  list_pull_requests,
  create_pull_request,
  get_pull_request_diff,
  review_pull_request,
};
