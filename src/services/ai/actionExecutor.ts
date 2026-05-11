import { NoteCreateInput, NoteFormat, NoteUpdateInput } from '../../models/Note';
import { TodoCreateInput, TodoPriority, TodoUpdateInput } from '../../models/Todo';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { useAIStore } from '../../stores/aiStore';
import { NoteSyncQueueService } from '../NoteSyncQueueService';

export interface ProposedChange {
  type: string;
  description: string;
  targetId?: string;
  details: Record<string, unknown>;
}

export interface ActionExecutorResult {
  success: boolean;
  data?: unknown;
  error?: string;
  requiresConfirmation: boolean;
  proposedChanges?: ProposedChange;
}

type ActionMode = 'auto' | 'confirm';

const NOTE_FORMATS: NoteFormat[] = ['markdown', 'neorg', 'org', 'pdf'];
const TODO_PRIORITIES: TodoPriority[] = ['low', 'medium', 'high'];

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid '${key}'`);
  }
  return value;
}

function getOptionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Invalid '${key}'`);
  }
  return value;
}

function getOptionalBooleanArg(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'boolean') {
    throw new Error(`Invalid '${key}'`);
  }
  return value;
}

function getOptionalStringArrayArg(args: Record<string, unknown>, key: string): string[] | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`Invalid '${key}'`);
  }
  return value;
}

function getOptionalNoteFormatArg(args: Record<string, unknown>, key: string): NoteFormat | undefined {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!NOTE_FORMATS.includes(value as NoteFormat)) {
    throw new Error(`Invalid '${key}'`);
  }
  return value as NoteFormat;
}

function getOptionalTodoPriorityArg(args: Record<string, unknown>, key: string): TodoPriority | undefined {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!TODO_PRIORITIES.includes(value as TodoPriority)) {
    throw new Error(`Invalid '${key}'`);
  }
  return value as TodoPriority;
}

function getOptionalDueDateArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Invalid '${key}'`);
}

function buildConfirmationResult(proposedChanges: ProposedChange): ActionExecutorResult {
  return {
    success: true,
    requiresConfirmation: true,
    proposedChanges,
  };
}

function buildSuccessResult(data?: unknown): ActionExecutorResult {
  return {
    success: true,
    requiresConfirmation: false,
    data,
  };
}

function toDetails(value: object): Record<string, unknown> {
  return Object.entries(value).reduce<Record<string, unknown>>((details, [key, entry]) => {
    if (entry !== undefined) {
      details[key] = entry;
    }
    return details;
  }, {});
}

function buildExcerpt(content: string): string {
  return content.length > 100 ? `${content.slice(0, 100)}...` : content;
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  mode: ActionMode,
): Promise<ActionExecutorResult> {
  try {
    switch (toolName) {
      case 'create_note': {
        const aiState = useAIStore.getState();
        const repoOwner = aiState.chatRepoOwner ?? undefined;
        const repoName = aiState.chatRepoName ?? undefined;
        const repoPath = repoOwner && repoName ? `${repoOwner}/${repoName}` : undefined;
        const branch = aiState.chatRepoBranch || 'main';

        const input: NoteCreateInput = {
          title: getStringArg(args, 'title'),
          content: getStringArg(args, 'content'),
          tags: getOptionalStringArrayArg(args, 'tags'),
          format: getOptionalNoteFormatArg(args, 'format'),
          // Attach chat-thread repo so the note shows up under the same
          // repo in the notes list and gets pushed by the sync queue.
          // Without this, AI-created notes were local-only and never
          // synced to other sessions until a manual push.
          ...(repoPath ? { repo: repoPath, branch } : {}),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'create_note',
            description: `Create note: '${input.title}'`,
            details: toDetails(input),
          });
        }

        const created = await useNoteStore.getState().createNote(input);
        if (!created) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create note.' };
        }

        // Enqueue an upsert so the note is pushed to GitHub on the next
        // queue drain. Other app sessions pick it up via the foreground
        // pull watcher (typically within the configured interval).
        //
        // Omit filePath so syncNoteToGitHub derives `notes/${slug}${ext}`
        // and treats this as a brand-new file (#732). Pre-computing a
        // bare `${slug}${ext}` here both pointed the file at repo root
        // and tripped the updateFile "remote was deleted" guard, leaving
        // the queue stuck with "GitHub API returned no result". The
        // store-side Note record gets its filePath populated from the
        // sync result on success (see applyPostSyncStorageUpdate), so
        // mirror the manual-note path in useNoteEditorDocument.
        if (repoPath) {
          try {
            await NoteSyncQueueService.enqueueNoteUpsert(
              {
                repo: repoPath,
                branch,
                title: input.title,
                content: input.content,
                format: input.format,
                tags: input.tags ?? [],
                color: null,
              },
              created.id,
            );
            void NoteSyncQueueService.drain();
          } catch (error) {
            void error;
          }
        }

        // Return a slim summary; the previous full-Note dump filled the
        // chat with JSON, the bubble renders this as a tappable link.
        return buildSuccessResult({
          noteId: created.id,
          title: created.title,
          format: created.format,
          repo: created.repo,
          synced: Boolean(repoPath),
        });
      }

      case 'edit_note': {
        const noteId = getStringArg(args, 'noteId');
        const input: NoteUpdateInput = {
          id: noteId,
          title: getOptionalStringArg(args, 'title'),
          content: getOptionalStringArg(args, 'content'),
          tags: getOptionalStringArrayArg(args, 'tags'),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'edit_note',
            description: `Edit note: '${noteId}'`,
            targetId: noteId,
            details: toDetails(input),
          });
        }

        const result = await useNoteStore.getState().updateNote(input);
        if (!result) {
          return { success: false, requiresConfirmation: false, error: 'Note not found.' };
        }
        return buildSuccessResult({ noteId: result.id, title: result.title });
      }

      case 'delete_note': {
        const noteId = getStringArg(args, 'noteId');

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'delete_note',
            description: `Delete note: '${noteId}'`,
            targetId: noteId,
            details: { noteId },
          });
        }

        const result = await useNoteStore.getState().deleteNote(noteId);
        return buildSuccessResult(result);
      }

      case 'search_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase();
        const matches = useNoteStore
          .getState()
          .notes.filter((note) => {
            if (!query) {
              return true;
            }
            return (
              note.title.toLowerCase().includes(query) ||
              note.content.toLowerCase().includes(query) ||
              note.tags.some((tag) => tag.toLowerCase().includes(query))
            );
          })
          .map((note) => ({
            id: note.id,
            title: note.title,
            excerpt: buildExcerpt(note.content),
          }));

        return buildSuccessResult(matches);
      }

      case 'get_note': {
        const noteId = getStringArg(args, 'noteId');
        const note = useNoteStore.getState().getNoteById(noteId);
        return buildSuccessResult(note);
      }

      case 'create_todo': {
        const input: TodoCreateInput = {
          text: getStringArg(args, 'text'),
          dueDate: getOptionalDueDateArg(args, 'dueDate'),
          priority: getOptionalTodoPriorityArg(args, 'priority'),
          tags: getOptionalStringArrayArg(args, 'tags'),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'create_todo',
            description: `Create todo: '${input.text}'`,
            details: toDetails(input),
          });
        }

        const result = await useTodoStore.getState().createTodo(input);
        return buildSuccessResult(result);
      }

      case 'edit_todo': {
        const todoId = getStringArg(args, 'todoId');
        const input: TodoUpdateInput = {
          id: todoId,
          text: getOptionalStringArg(args, 'text'),
          completed: getOptionalBooleanArg(args, 'completed'),
          dueDate: getOptionalDueDateArg(args, 'dueDate'),
          priority: getOptionalTodoPriorityArg(args, 'priority'),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'edit_todo',
            description: `Edit todo: '${todoId}'`,
            targetId: todoId,
            details: toDetails(input),
          });
        }

        const result = await useTodoStore.getState().updateTodo(input);
        return buildSuccessResult(result);
      }

      case 'delete_todo': {
        const todoId = getStringArg(args, 'todoId');

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'delete_todo',
            description: `Delete todo: '${todoId}'`,
            targetId: todoId,
            details: { todoId },
          });
        }

        const result = await useTodoStore.getState().deleteTodo(todoId);
        return buildSuccessResult(result);
      }

      case 'search_todos': {
        const query = getStringArg(args, 'query').trim().toLowerCase();
        const includeCompleted = getOptionalBooleanArg(args, 'includeCompleted') ?? true;
        const matches = useTodoStore
          .getState()
          .todos.filter((todo) => {
            if (!includeCompleted && todo.completed) {
              return false;
            }
            if (!query) {
              return true;
            }
            return (
              todo.text.toLowerCase().includes(query) ||
              (todo.notes?.toLowerCase().includes(query) ?? false) ||
              (todo.tags?.some((tag) => tag.toLowerCase().includes(query)) ?? false)
            );
          });

        return buildSuccessResult(matches);
      }

      case 'get_todos': {
        const filter = getOptionalStringArg(args, 'filter') ?? 'all';
        if (!['all', 'pending', 'completed'].includes(filter)) {
          throw new Error("Invalid 'filter'");
        }

        const todos = useTodoStore.getState().todos.filter((todo) => {
          if (filter === 'pending') {
            return !todo.completed;
          }
          if (filter === 'completed') {
            return todo.completed;
          }
          return true;
        });

        return buildSuccessResult(todos);
      }

      default:
        return {
          success: false,
          requiresConfirmation: false,
          error: `Unsupported tool: ${toolName}`,
        };
    }
  } catch (error) {
    return {
      success: false,
      requiresConfirmation: false,
      error: error instanceof Error ? error.message : 'Failed to execute tool call',
    };
  }
}
