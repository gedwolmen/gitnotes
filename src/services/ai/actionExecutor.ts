import { Note, NoteCreateInput, NoteFormat, NoteUpdateInput } from '../../models/Note';
import { TodoCreateInput, TodoPriority, TodoUpdateInput } from '../../models/Todo';
import { useNoteStore } from '../../stores/noteStore';
import { useTodoStore } from '../../stores/todoStore';
import { useAIStore } from '../../stores/aiStore';
import { GITHUB_ITEM_STATES, GitHubItemState, GitHubService } from '../GitHubService';
import { NoteSyncQueueService } from '../NoteSyncQueueService';
import { ScheduledLearningService } from '../ScheduledLearningService';

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

const GITHUB_TOOL_NAMES = new Set<string>([
  'list_repos',
  'list_issues',
  'create_issue',
  'list_pull_requests',
  'create_pull_request',
  'get_pull_request_diff',
  'review_pull_request',
]);

function getStringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid '${key}'`);
  }
  return value;
}

function getNumberArg(args: Record<string, unknown>, key: string): number {
  const value = args[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
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

function getOptionalItemStateArg(args: Record<string, unknown>, key: string): GitHubItemState | undefined {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!GITHUB_ITEM_STATES.includes(value as GitHubItemState)) {
    throw new Error(`Invalid '${key}' — must be open, closed, or all`);
  }
  return value as GitHubItemState;
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

/**
 * Enqueue a note upsert so it is pushed to GitHub on the next queue drain.
 * Other app sessions pick it up via the foreground pull watcher (typically
 * within the configured interval).
 *
 * Omit filePath so syncNoteToGitHub derives `notes/${slug}${ext}` and
 * treats this as a brand-new file (#732). Pre-computing a bare
 * `${slug}${ext}` here both pointed the file at repo root and tripped the
 * updateFile "remote was deleted" guard, leaving the queue stuck with
 * "GitHub API returned no result". The store-side Note record gets its
 * filePath populated from the sync result on success (see
 * applyPostSyncStorageUpdate), so mirror the manual-note path in
 * useNoteEditorDocument.
 */
async function enqueueNoteSync(
  createInput: NoteCreateInput,
  noteId: string,
  repoPath: string,
  branch: string,
): Promise<void> {
  try {
    await NoteSyncQueueService.enqueueNoteUpsert(
      {
        repo: repoPath,
        branch,
        title: createInput.title,
        content: createInput.content,
        format: createInput.format,
        tags: createInput.tags ?? [],
        color: null,
      },
      noteId,
    );
    void NoteSyncQueueService.drain();
  } catch (error) {
    console.warn('[actionExecutor] enqueueNoteUpsert failed:', error);
  }
}

export async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  mode: ActionMode,
): Promise<ActionExecutorResult> {
  try {
    // GitHub tools gate — checked here as defence-in-depth
    // (the chat controller also gates registration)
    if (GITHUB_TOOL_NAMES.has(toolName) && !useAIStore.getState().githubToolsEnabled) {
      return {
        success: false,
        requiresConfirmation: false,
        error: 'GitHub tools are disabled. Enable them in Settings → AI → GitHub Tools.',
      };
    }

    // Chat-thread repo context: attaching repo/branch to created notes
    // keeps them visible under the same repo and lets the sync queue
    // push them (see enqueueNoteSync).
    const aiState = useAIStore.getState();
    const repoOwner = aiState.chatRepoOwner ?? undefined;
    const repoName = aiState.chatRepoName ?? undefined;
    const repoPath = repoOwner && repoName ? `${repoOwner}/${repoName}` : undefined;
    const branch = aiState.chatRepoBranch || 'main';

    switch (toolName) {
      case 'create_note': {
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

        if (repoPath) {
          await enqueueNoteSync(input, created.id, repoPath, branch);
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

      case 'create_questioner_note': {
        const topic = getStringArg(args, 'topic');
        const content = getStringArg(args, 'content');
        const sourceNotes = getOptionalStringArrayArg(args, 'sourceNotes') ?? [];
        const userTags = getOptionalStringArrayArg(args, 'tags') ?? [];
        // Force the 'questioner' tag — NoteEditorScreen shows the
        // Grade Answers button only for notes carrying it.
        const tags = Array.from(new Set([...userTags, 'questioner']));
        const format = getOptionalNoteFormatArg(args, 'format');
        const questionCount = (content.match(/\?/g) || []).length;

        const sourceList = sourceNotes.length
          ? `## Sources\n\n${sourceNotes.map((id) => `- ${id}`).join('\n')}\n\n`
          : '';
        const marker = `<!-- sl-item-id: chat-gen-${Date.now()} -->\n`;

        const input: NoteCreateInput = {
          title: topic,
          content: `${marker}${sourceList}${content}`,
          tags,
          format: format ?? 'markdown',
          ...(repoPath ? { repo: repoPath, branch } : {}),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'create_questioner_note',
            description: `Create questioner note on: ${topic}`,
            details: { topic, tags, questionCount },
          });
        }

        const created = await useNoteStore.getState().createNote(input);
        if (!created) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create questioner note.' };
        }
        if (repoPath) {
          await enqueueNoteSync(input, created.id, repoPath, branch);
        }

        return buildSuccessResult({
          noteId: created.id,
          title: created.title,
          format: created.format,
          repo: created.repo,
          synced: Boolean(repoPath),
          questionCount,
          tag: 'questioner',
        });
      }

      case 'grade_questioner_answers': {
        const noteId = getStringArg(args, 'noteId');
        const note = useNoteStore.getState().getNoteById(noteId);
        if (!note) {
          return { success: false, requiresConfirmation: false, error: 'Note not found.' };
        }
        if (!note.tags.includes('questioner')) {
          return {
            success: false,
            requiresConfirmation: false,
            error: "Note doesn't have the 'questioner' tag required for grading.",
          };
        }

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'grade_questioner_answers',
            description: `Grade answers in note: '${note.title}'`,
            targetId: noteId,
            details: { noteId, title: note.title },
          });
        }

        const contentLenBefore = (useNoteStore.getState().getNoteById(noteId)?.content ?? '').length;
        const graded = await ScheduledLearningService.gradeQuestionerNote(noteId);
        if (!graded) {
          return {
            success: false,
            requiresConfirmation: false,
            error: 'Grading failed. Check your AI model is configured.',
          };
        }
        const contentLenAfter = (useNoteStore.getState().getNoteById(noteId)?.content ?? '').length;
        return buildSuccessResult({
          noteId,
          graded: true,
          gradingAppended: Math.max(0, contentLenAfter - contentLenBefore),
        });
      }

      case 'find_notes': {
        const query = getStringArg(args, 'query').trim().toLowerCase();
        const requiredTags = getOptionalStringArrayArg(args, 'tags');
        const excludeTags = getOptionalStringArrayArg(args, 'excludeTags');
        const folderPath = getOptionalStringArg(args, 'folderPath');
        const sortBy = getOptionalStringArg(args, 'sortBy') ?? 'recent';
        if (!['recent', 'alphabetical'].includes(sortBy)) {
          throw new Error("Invalid 'sortBy' — must be recent or alphabetical");
        }
        const limit =
          args.limit === undefined ? 20 : Math.max(1, Math.min(100, getNumberArg(args, 'limit')));

        const filtered = useNoteStore.getState().notes.filter((note) => {
          if (
            query &&
            !(
              note.title.toLowerCase().includes(query) ||
              note.content.toLowerCase().includes(query) ||
              note.tags.some((tag) => tag.toLowerCase().includes(query))
            )
          ) {
            return false;
          }
          if (requiredTags && !requiredTags.every((tag) => note.tags.includes(tag))) {
            return false;
          }
          if (excludeTags && excludeTags.some((tag) => note.tags.includes(tag))) {
            return false;
          }
          if (folderPath && !(note.folderPath ?? '').startsWith(folderPath)) {
            return false;
          }
          return true;
        });

        filtered.sort((a, b) => {
          if (sortBy === 'alphabetical') {
            return a.title.localeCompare(b.title);
          }
          return b.updatedAt - a.updatedAt;
        });

        return buildSuccessResult({
          matches: filtered.slice(0, limit).map((note) => ({
            id: note.id,
            title: note.title,
            tags: note.tags,
            folderPath: note.folderPath ?? null,
            excerpt: buildExcerpt(note.content),
            updatedAt: note.updatedAt,
          })),
          total: filtered.length,
        });
      }

      case 'find_todos': {
        const query = getOptionalStringArg(args, 'query')?.trim().toLowerCase() ?? '';
        const status = getOptionalStringArg(args, 'status') ?? 'all';
        if (!['all', 'pending', 'completed'].includes(status)) {
          throw new Error("Invalid 'status' — must be all, pending, or completed");
        }
        const priority = getOptionalTodoPriorityArg(args, 'priority');
        const tags = getOptionalStringArrayArg(args, 'tags');
        const dueBeforeRaw = getOptionalStringArg(args, 'dueBefore');
        const dueBeforeMs = dueBeforeRaw ? Date.parse(dueBeforeRaw) : NaN;
        if (dueBeforeRaw && Number.isNaN(dueBeforeMs)) {
          throw new Error("Invalid 'dueBefore' — must be a parseable date string");
        }
        const sortBy = getOptionalStringArg(args, 'sortBy') ?? 'recent';
        if (!['due', 'priority', 'recent'].includes(sortBy)) {
          throw new Error("Invalid 'sortBy' — must be due, priority, or recent");
        }

        const priorityRank: Record<TodoPriority, number> = { high: 0, medium: 1, low: 2 };

        const filtered = useTodoStore.getState().todos.filter((todo) => {
          if (status === 'pending' && todo.completed) {
            return false;
          }
          if (status === 'completed' && !todo.completed) {
            return false;
          }
          if (priority && todo.priority !== priority) {
            return false;
          }
          if (tags && !tags.every((tag) => (todo.tags ?? []).includes(tag))) {
            return false;
          }
          if (dueBeforeRaw && (!todo.dueDate || todo.dueDate > dueBeforeMs)) {
            return false;
          }
          if (
            query &&
            !(
              todo.text.toLowerCase().includes(query) ||
              (todo.notes?.toLowerCase().includes(query) ?? false) ||
              (todo.tags?.some((tag) => tag.toLowerCase().includes(query)) ?? false)
            )
          ) {
            return false;
          }
          return true;
        });

        filtered.sort((a, b) => {
          if (sortBy === 'due') {
            const aDue = a.dueDate ?? Number.MAX_SAFE_INTEGER;
            const bDue = b.dueDate ?? Number.MAX_SAFE_INTEGER;
            return aDue - bDue;
          }
          if (sortBy === 'priority') {
            return priorityRank[a.priority ?? 'medium'] - priorityRank[b.priority ?? 'medium'];
          }
          return b.createdAt - a.createdAt;
        });

        return buildSuccessResult({
          matches: filtered.map((todo) => ({
            id: todo.id,
            text: todo.text,
            completed: todo.completed,
            priority: todo.priority ?? null,
            dueDate: todo.dueDate ?? null,
            tags: todo.tags ?? [],
          })),
          total: filtered.length,
          filterApplied: { status, priority: priority ?? null, query },
        });
      }

      case 'summarize_notes': {
        const noteIds = getOptionalStringArrayArg(args, 'noteIds') ?? [];
        if (noteIds.length === 0) {
          return { success: false, requiresConfirmation: false, error: 'noteIds must be non-empty' };
        }
        const content = getStringArg(args, 'content');
        const outputTags = getOptionalStringArrayArg(args, 'outputTags') ?? [];
        const format = getOptionalNoteFormatArg(args, 'format');

        const noteStore = useNoteStore.getState();
        const sources = noteIds
          .map((id) => noteStore.getNoteById(id))
          .filter((found): found is Note => found !== undefined);
        if (sources.length === 0) {
          return { success: false, requiresConfirmation: false, error: 'None of the source notes exist.' };
        }

        const title = getOptionalStringArg(args, 'outputTitle') ?? `Summary (${sources.length} notes)`;
        const tags = Array.from(new Set([...outputTags, 'summary']));
        const marker = `<!-- source-note-ids: ${noteIds.join(',')} -->\n`;
        const sourceListMd = `## Sources\n\n${sources
          .map((source) => `- ${source.title} (${source.id})`)
          .join('\n')}\n\n`;

        const input: NoteCreateInput = {
          title,
          content: `${marker}${sourceListMd}${content}`,
          tags,
          format: format ?? 'markdown',
          ...(repoPath ? { repo: repoPath, branch } : {}),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'summarize_notes',
            description: `Summarize ${sources.length} notes into '${title}'`,
            details: { sourceCount: sources.length, title, tags },
          });
        }

        const created = await useNoteStore.getState().createNote(input);
        if (!created) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create summary note.' };
        }
        if (repoPath) {
          await enqueueNoteSync(input, created.id, repoPath, branch);
        }

        return buildSuccessResult({
          noteId: created.id,
          title: created.title,
          sourceCount: sources.length,
          synced: Boolean(repoPath),
        });
      }

      case 'distill_thought_dump': {
        const sourceIds = getOptionalStringArrayArg(args, 'sourceNoteIds') ?? [];
        if (sourceIds.length === 0) {
          return { success: false, requiresConfirmation: false, error: 'sourceNoteIds must be non-empty' };
        }
        const content = getStringArg(args, 'content');
        const title = getStringArg(args, 'outputTitle');
        const userTags = getOptionalStringArrayArg(args, 'outputTags') ?? [];
        const tags = Array.from(new Set([...userTags, 'distilled']));
        const marker = `<!-- distilled-from: ${sourceIds.join(',')} -->\n`;

        const input: NoteCreateInput = {
          title,
          content: `${marker}${content}`,
          tags,
          format: 'markdown',
          ...(repoPath ? { repo: repoPath, branch } : {}),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'distill_thought_dump',
            description: `Distill ${sourceIds.length} thought-dumps into '${title}'`,
            details: { sourceIds, title, tags },
          });
        }

        const created = await useNoteStore.getState().createNote(input);
        if (!created) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create distilled note.' };
        }
        if (repoPath) {
          await enqueueNoteSync(input, created.id, repoPath, branch);
        }

        return buildSuccessResult({
          noteId: created.id,
          title: created.title,
          sourceIds,
          synced: Boolean(repoPath),
        });
      }

      case 'link_notes': {
        const ids = getOptionalStringArrayArg(args, 'noteIds') ?? [];
        if (ids.length < 2) {
          return { success: false, requiresConfirmation: false, error: 'link_notes requires at least 2 noteIds' };
        }
        const relationship = getOptionalStringArg(args, 'relationship') ?? 'related';
        if (!['related', 'sequence', 'contradicts'].includes(relationship)) {
          throw new Error("Invalid 'relationship' — must be related, sequence, or contradicts");
        }
        const heading =
          relationship === 'contradicts'
            ? '## Contradicts'
            : relationship === 'sequence'
              ? '## Sequence'
              : '## Related';

        const noteStore = useNoteStore.getState();
        const targets = ids
          .map((id) => noteStore.getNoteById(id))
          .filter((found): found is Note => found !== undefined);
        if (targets.length < 2) {
          return { success: false, requiresConfirmation: false, error: 'At least 2 of the given noteIds must exist' };
        }

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'link_notes',
            description: `Cross-link ${targets.length} notes with '${heading.replace('## ', '')}' references`,
            details: { noteIds: targets.map((note) => note.id), relationship },
          });
        }

        let linked = 0;
        for (const self of targets) {
          const siblings = targets.filter((note) => note.id !== self.id);
          const linkBlock =
            `\n\n<!-- linked-by-chat: ${new Date().toISOString().slice(0, 10)} -->\n` +
            `${heading}\n\n${siblings.map((sibling) => `- [[${sibling.title}]]`).join('\n')}`;
          const updated = await noteStore.updateNote({
            id: self.id,
            content: self.content + linkBlock,
          });

          if (repoPath && updated) {
            try {
              await NoteSyncQueueService.enqueueNoteUpsert(
                {
                  repo: repoPath,
                  branch,
                  title: updated.title,
                  content: updated.content,
                  format: updated.format ?? 'markdown',
                  tags: updated.tags,
                  color: null,
                },
                updated.id,
              );
            } catch (error) {
              console.warn('[actionExecutor] link_notes sync enqueue failed:', error);
            }
          }
          linked += 1;
        }

        if (repoPath) {
          try {
            void NoteSyncQueueService.drain();
          } catch {
            // Drain is best-effort — the queue retries on its next trigger.
          }
        }

        return buildSuccessResult({
          linked,
          noteIds: targets.map((note) => note.id),
        });
      }

      case 'generate_daily_brief': {
        const content = getStringArg(args, 'content');
        const userTags = getOptionalStringArrayArg(args, 'outputTags') ?? [];
        const tags = Array.from(new Set([...userTags, 'daily-brief']));
        const today = new Date().toISOString().slice(0, 10);
        const title = `Daily Brief: ${today}`;
        const marker = `<!-- daily-brief: ${today} -->\n`;

        const input: NoteCreateInput = {
          title,
          content: `${marker}${content}`,
          tags,
          format: 'markdown',
          ...(repoPath ? { repo: repoPath, branch } : {}),
        };

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'generate_daily_brief',
            description: `Create daily brief for ${today}`,
            details: { date: today, tags },
          });
        }

        const created = await useNoteStore.getState().createNote(input);
        if (!created) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create daily brief.' };
        }
        if (repoPath) {
          await enqueueNoteSync(input, created.id, repoPath, branch);
        }

        return buildSuccessResult({
          noteId: created.id,
          date: today,
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

      case 'list_repos': {
        const repos = await GitHubService.getRepositories();
        return buildSuccessResult(
          repos.map((r) => ({
            id: r.id,
            name: r.full_name,
            private: r.private,
            description: r.description,
            url: r.html_url,
          })),
        );
      }

      case 'list_issues': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const state = getOptionalItemStateArg(args, 'state') ?? 'open';
        const issues = await GitHubService.getIssues(owner, repo, state);
        return buildSuccessResult(
          issues.map((i) => ({
            number: i.number,
            title: i.title,
            state: i.state,
            html_url: i.html_url,
            created_at: i.created_at,
          })),
        );
      }

      case 'create_issue': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const title = getStringArg(args, 'title');
        const body = getOptionalStringArg(args, 'body');
        const labels = getOptionalStringArrayArg(args, 'labels');
        const assignees = getOptionalStringArrayArg(args, 'assignees');

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'create_issue',
            description: `Create issue "${title}" in ${owner}/${repo}`,
            details: toDetails({ owner, repo, title, body, labels, assignees }),
          });
        }

        const created = await GitHubService.createIssue({ owner, repo, title, body, labels, assignees });
        if (!created) {
          return {
            success: false,
            requiresConfirmation: false,
            error: 'Failed to create issue. Check token permissions for Issues: Read and write.',
          };
        }
        return buildSuccessResult({ number: created.number, title: created.title, html_url: created.html_url });
      }

      case 'list_pull_requests': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const state = getOptionalItemStateArg(args, 'state') ?? 'open';
        const prs = await GitHubService.getPullRequests(owner, repo, state);
        return buildSuccessResult(
          prs.map((p) => ({
            number: p.number,
            title: p.title,
            state: p.state,
            html_url: p.html_url,
            draft: p.draft,
          })),
        );
      }

      case 'create_pull_request': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const title = getStringArg(args, 'title');
        const body = getOptionalStringArg(args, 'body');
        const head = getStringArg(args, 'head');
        const base = getStringArg(args, 'base');

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'create_pull_request',
            description: `Create PR "${title}" (${head} → ${base}) in ${owner}/${repo}`,
            details: toDetails({ owner, repo, title, body, head, base }),
          });
        }

        const pr = await GitHubService.createPullRequest({ owner, repo, title, body: body ?? '', head, base });
        if (!pr) {
          return { success: false, requiresConfirmation: false, error: 'Failed to create pull request.' };
        }
        return buildSuccessResult({ number: pr.number, title: pr.title, html_url: pr.html_url, draft: pr.draft });
      }

      case 'get_pull_request_diff': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const pull_number = getNumberArg(args, 'pull_number');
        const diff = await GitHubService.getPullRequestDiff(owner, repo, pull_number);
        if (!diff) {
          return { success: false, requiresConfirmation: false, error: 'Could not fetch PR diff.' };
        }
        return buildSuccessResult({
          files: diff.files.map((f) => ({
            filename: f.filename,
            status: f.status,
            additions: f.additions,
            deletions: f.deletions,
          })),
        });
      }

      case 'review_pull_request': {
        const owner = getStringArg(args, 'owner');
        const repo = getStringArg(args, 'repo');
        const pull_number = getNumberArg(args, 'pull_number');
        const body = getStringArg(args, 'body');
        const event = getStringArg(args, 'event') as 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
        if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(event)) {
          throw new Error("Invalid 'event' — must be APPROVE, REQUEST_CHANGES, or COMMENT");
        }

        if (mode === 'confirm') {
          return buildConfirmationResult({
            type: 'review_pull_request',
            description: `Post ${event} review on PR #${pull_number} in ${owner}/${repo}`,
            details: toDetails({ owner, repo, pull_number, body, event }),
          });
        }

        const review = await GitHubService.reviewPullRequest({ owner, repo, pull_number, body, event });
        if (!review) {
          return { success: false, requiresConfirmation: false, error: 'Failed to post review.' };
        }
        return buildSuccessResult({ id: review.id, state: review.state, html_url: review.html_url });
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
