import { useMemo } from 'react';
import { create } from 'zustand';
import { Note, NoteCreateInput, NoteUpdateInput, sortNotesWithPinnedFirst, filterNotesBySearch } from '../models/Note';
import { StorageService } from '../services/StorageService';
import { NoteSyncQueueService, SyncEngineService, CloneSyncService, type MutationSucceededEvent, type DroppedMutationEvent, type NoteDeleteParams, type SaveResult } from '../services/cloneSyncServiceImpl';
import { CommitService } from '../services/git/CommitService';
import { resolveDefaultFolder, resolveDefaultRepo } from '../services/git/defaultsPolicy';
import { recordDeleteFailure } from '../services/git/deleteFailures';
import { gitOperationRegistry, useGitOperationStore } from './gitOperationStore';
import type { GitOp } from './gitOperationStore';
import { slugifyLocal, getExtensionForFormat } from '../components/editor/editorShared';
import { parseRepoPath } from '../utils/gitPathParser';
import { applyNoteTagsToContent, applyNoteColorToContent } from '../services/NoteGitHubSyncService';

function pathsEqual(a: { owner: string; repo: string } | null, b: { owner: string; repo: string }): boolean {
  return !!a && a.owner === b.owner && a.repo === b.repo;
}

interface NoteState {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
}

interface NoteActions {
  setSearchQuery: (query: string) => void;
  loadNotes: () => Promise<void>;
  createNote: (input: NoteCreateInput) => Promise<Note | null>;
  updateNote: (input: NoteUpdateInput) => Promise<Note | null>;
  /**
   * Upsert a note's content to git (clone mode) or enqueue for API push (API mode).
   * Returns SaveResult — caller (editor screen) decides navigation based on success.
   */
  upsertNote: (input: NoteUpdateInput & {
    repoPath: string;
    branch: string;
    filePath: string;
    content: string;
  }) => Promise<SaveResult>;
  deleteNote: (id: string) => Promise<boolean>;
  dropByFilePaths: (repo: string, paths: string[]) => Promise<number>;
  clearAllNotes: () => Promise<boolean>;
  getNoteById: (id: string) => Note | undefined;
  togglePin: (id: string) => Promise<boolean>;
  refreshNotes: () => Promise<void>;
  clearError: () => void;
}

export function deriveDefaultNotePath(note: Note): string | null {
  const title = (note.title ?? '').trim();
  if (!title) return null;
  const slug = slugifyLocal(title);
  const ext = getExtensionForFormat(note.format);
  return note.folderPath ? `${note.folderPath}/${slug}${ext}` : `${resolveDefaultFolder('note')}${slug}${ext}`;
}

export const useNoteStore = create<NoteState & NoteActions>()((set, get) => ({
  notes: [],
  isLoading: true,
  error: null,
  searchQuery: '',

  setSearchQuery: (query) => set({ searchQuery: query }),

  loadNotes: async () => {
    try {
      set({ isLoading: true, error: null });
      const [loadedNotes, savedRepos] = await Promise.all([
        StorageService.getAllNotes(),
        StorageService.getSavedRepositories(),
      ]);
      // Drop notes whose backing repo was removed from settings on a build
      // that didn't yet purge per-repo data (issue: ghost notes from a
      // disconnected repo kept showing up in the list). Local-only notes
      // (no `repo` field) are always kept.
      const repoPaths = new Set(savedRepos.map((r) => r.path));
      const orphans = loadedNotes.filter((n) => n.repo && !repoPaths.has(n.repo));
      const survivors = loadedNotes.filter((n) => !n.repo || repoPaths.has(n.repo));
      if (orphans.length > 0) {
        await Promise.all(orphans.map((n) => StorageService.deleteNote(n.id)));
      }
      set({ notes: sortNotesWithPinnedFirst(survivors), isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load notes', isLoading: false });
      console.error('Error loading notes:', err);
    }
  },

  createNote: async (input) => {
    let repo: string;
    try {
      repo = input.repo ?? await resolveDefaultRepo();
    } catch {
      set({ error: 'No repository configured' });
      return null;
    }
    try {
      set({ error: null });

      // Derive filePath for clone-mode commit (same logic as deriveDefaultNotePath
      // but computed from input fields since the Note object doesn't exist yet)
      const title = (input.title ?? '').trim();
      const slug = title ? slugifyLocal(title) : `note-${Date.now()}`;
      const ext = getExtensionForFormat(input.format ?? 'markdown');
      const folderPath = input.folderPath ?? resolveDefaultFolder('note');
      const filePath = `${folderPath}/${slug}${ext}`;

      // Clone mode: commit the new note to git BEFORE saving to storage.
      const mode = await SyncEngineService.getMode(repo);
      if (mode === 'clone') {
        const opId = gitOperationRegistry.begin({
          kind: 'upsert',
          repo,
          branch: input.branch ?? 'main',
          path: filePath,
          entityIds: [],
          status: 'running',
          attempts: 0,
        });
        try {
          const commitResult = await CommitService.commit({
            repo,
            branch: input.branch ?? 'main',
            filePath,
            content: input.content ?? '',
            message: `Create note: ${title || filePath}`,
          });
          if (!commitResult.success) {
            gitOperationRegistry.fail(opId, commitResult.error ?? 'Failed to create note');
            set({ error: commitResult.error ?? 'Failed to create note' });
            return null;
          }
          gitOperationRegistry.succeed(opId);
        } catch (commitError) {
          gitOperationRegistry.fail(opId, commitError instanceof Error ? commitError.message : 'Commit failed');
          throw commitError;
        }
      }

      const newNote = await StorageService.createNote({ ...input, repo });
      set((state) => ({ notes: sortNotesWithPinnedFirst([...state.notes, newNote]) }));
      return newNote;
    } catch (err) {
      set({ error: 'Failed to create note' });
      console.error('Error creating note:', err);
      return null;
    }
  },

  updateNote: async (input) => {
    try {
      set({ error: null });

      // Detect title/folder changes that would alter the derived path (rename).
      // In clone mode, use CommitService.commit with prevFilePath to produce one
      // atomic rename commit instead of a delete+create pair.
      const existingNote = get().notes.find((n) => n.id === input.id);
      const titleChanged = input.title !== undefined && existingNote?.title !== input.title;
      const folderPathChanged = input.folderPath !== undefined && existingNote?.folderPath !== input.folderPath;

      if (existingNote?.repo && (titleChanged || folderPathChanged)) {
        const oldPath = existingNote.filePath ?? deriveDefaultNotePath(existingNote);
        // Virtual note with the updated title/folderPath to derive new path
        const virtualNote = {
          ...existingNote,
          title: input.title ?? existingNote.title,
          folderPath: input.folderPath ?? existingNote.folderPath,
          format: input.format ?? existingNote.format,
        };
        const newPath = input.filePath ?? deriveDefaultNotePath(virtualNote);

        if (oldPath && newPath && oldPath !== newPath) {
          const mode = await SyncEngineService.getMode(existingNote.repo);
          if (mode === 'clone') {
            const content = input.content ?? existingNote.content ?? '';
            const opId = gitOperationRegistry.begin({
              kind: 'rename',
              repo: existingNote.repo,
              branch: existingNote.branch ?? 'main',
              path: newPath,
              entityIds: [existingNote.id],
              status: 'running',
              attempts: 0,
            });
            try {
              const commitResult = await CommitService.commit({
                repo: existingNote.repo,
                branch: existingNote.branch ?? 'main',
                prevFilePath: oldPath,
                filePath: newPath,
                content,
                message: `Rename note: ${input.title ?? existingNote.title}`,
              });
              if (!commitResult.success) {
                gitOperationRegistry.fail(opId, commitResult.error ?? 'Failed to rename note');
                set({ error: commitResult.error ?? 'Failed to rename note' });
                return null;
              }
              gitOperationRegistry.succeed(opId);
            } catch (renameError) {
              gitOperationRegistry.fail(opId, renameError instanceof Error ? renameError.message : 'Rename failed');
              throw renameError;
            }
            // Commit succeeded — update filePath on the note so subsequent syncs
            // use the correct path and don't try to re-create the file.
            input = { ...input, filePath: newPath };
          }
        }
      }

      const updatedNote = await StorageService.updateNote(input);
      if (updatedNote) {
        set((state) => ({
          notes: sortNotesWithPinnedFirst(
            state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note))
          ),
        }));
      }
      return updatedNote;
    } catch (err) {
      set({ error: 'Failed to update note' });
      console.error('Error updating note:', err);
      return null;
    }
  },

  upsertNote: async (input) => {
    const { repoPath, branch, filePath, content, id } = input;
    const mode = await SyncEngineService.getMode(repoPath);

    if (mode === 'clone') {
      try {
        const taggedContent = applyNoteColorToContent(
          applyNoteTagsToContent(content ?? '', input.format, input.tags ?? []),
          input.format,
          input.color,
        );
        const saveResult = await CloneSyncService.save({
          repoPath,
          branch,
          filePath,
          content: taggedContent,
          message: `Update note: ${input.title ?? filePath}`,
          intent: 'upsert',
        });
        if (!saveResult.success) {
          return saveResult;
        }
        const updatedNote = await StorageService.updateNote(input);
        if (updatedNote) {
          set((state) => ({
            notes: sortNotesWithPinnedFirst(
              state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note))
            ),
          }));
        }
        return saveResult;
      } catch {
        return { success: false, error: 'unknown' };
      }
    }

    await NoteSyncQueueService.enqueueNoteUpsert({
      repo: repoPath,
      branch,
      filePath,
      title: input.title ?? '',
      content,
      format: input.format,
      tags: input.tags,
      color: input.color,
    });
    const updatedNote = await StorageService.updateNote(input);
    if (updatedNote) {
      set((state) => ({
        notes: sortNotesWithPinnedFirst(
          state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note))
        ),
      }));
    }
    return { success: true };
  },

  deleteNote: async (id) => {
    try {
      set({ error: null });

      const note = get().notes.find((n) => n.id === id);
      if (!note) return false;

      if (note.repo) {
        const repoPath = note.repo;
        const filePath = note.filePath ?? deriveDefaultNotePath(note);
        if (filePath) {
          armDeleteCompletionHandlers();
          const deleteParams: NoteDeleteParams = {
            repo: repoPath,
            branch: note.branch,
            filePath,
            title: note.title,
            accountId: note.accountId,
            localNoteId: id,
          };
          const beginDeleteOp = () =>
            gitOperationRegistry.begin({
              kind: 'delete',
              repo: repoPath,
              branch: note.branch,
              path: filePath,
              entityIds: [id],
              status: 'running',
              attempts: 0,
            });
          const mode = await SyncEngineService.getMode(repoPath);
          if (mode === 'clone') {
            // Clone mode: real local delete commit via CommitService (same
            // primitive as create/rename); push happens via the clone push
            // triggers. The local commit keeps the next pull from
            // resurrecting the file (#1030).
            const opId = beginDeleteOp();
            try {
              const commitResult = await CommitService.commit({
                repo: repoPath,
                branch: note.branch ?? 'main',
                filePath,
                message: `Delete note: ${note.title ?? filePath}`,
                delete: true,
              });
              if (!commitResult.success) {
                gitOperationRegistry.fail(opId, commitResult.error ?? 'Failed to delete note');
                set({ error: commitResult.error ?? 'Failed to delete note' });
                return false;
              }
            } catch (commitError) {
              const commitErrorMessage =
                commitError instanceof Error ? commitError.message : 'Failed to delete note';
              gitOperationRegistry.fail(opId, commitErrorMessage);
              set({ error: commitErrorMessage });
              return false;
            }
            const success = await StorageService.deleteNote(id);
            if (success) {
              set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
              gitOperationRegistry.succeed(opId);
            } else {
              gitOperationRegistry.fail(opId, 'Failed to delete note locally');
            }
            return success;
          }
          // API mode: enqueue the delete, then remove locally immediately.
          try {
            await NoteSyncQueueService.enqueueNoteDelete(deleteParams);
          } catch (err) {
            set({ error: err instanceof Error ? err.message : 'Failed to enqueue note delete' });
            return false;
          }
          // Remove locally now — the row must vanish immediately; the
          // push button (not the row) signals pending work.
          const opId = beginDeleteOp();
          const success = await StorageService.deleteNote(id);
          if (success) {
            set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
            gitOperationRegistry.succeed(opId);
          } else if (!get().notes.some((n) => n.id === id)) {
            // The write-through drain already completed the delete and its
            // side-channel removed the row (note gone from state + storage).
            // `StorageService.deleteNote` returns false for the already-removed
            // id — treat that as success, not as a failed delete.
            gitOperationRegistry.succeed(opId);
          } else {
            gitOperationRegistry.fail(opId, 'Failed to delete note locally');
          }
          return success || !get().notes.some((n) => n.id === id);
        }
        // Repo-backed note with no derivable path: nothing to enqueue, so
        // fall through to the instant local delete below.
      }

      // Local-only notes delete instantly.
      const success = await StorageService.deleteNote(id);
      if (success) {
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
      }
      return success;
    } catch (err) {
      set({ error: 'Failed to delete note' });
      console.error('Error deleting note:', err);
      return false;
    }
  },

  dropByFilePaths: async (repo, paths) => {
    try {
      set({ error: null });
      const pathSet = new Set(paths);
      const repoPaths = parseRepoPath(repo);
      const matches = get().notes.filter((note) => {
        if (!note.repo) return false;
        const sameRepo =
          note.repo === repo ||
          (!!repoPaths && pathsEqual(parseRepoPath(note.repo), repoPaths));
        if (!sameRepo) return false;
        const filePath = note.filePath ?? deriveDefaultNotePath(note);
        return !!filePath && pathSet.has(filePath);
      });
      if (matches.length === 0) return 0;
      await Promise.all(matches.map((note) => StorageService.deleteNote(note.id)));
      const ids = new Set(matches.map((n) => n.id));
      set((state) => ({ notes: state.notes.filter((n) => !ids.has(n.id)) }));
      return matches.length;
    } catch (err) {
      set({ error: 'Failed to drop notes' });
      console.error('Error dropping notes:', err);
      return 0;
    }
  },

  clearAllNotes: async () => {
    try {
      set({ error: null });
      await StorageService.clearAllNotes();
      set({ notes: [] });
      return true;
    } catch (err) {
      set({ error: 'Failed to clear notes' });
      console.error('Error clearing notes:', err);
      return false;
    }
  },

  getNoteById: (id) => get().notes.find((note) => note.id === id),

  togglePin: async (id) => {
    try {
      set({ error: null });
      const note = get().notes.find((n) => n.id === id);
      if (!note) return false;

      const updatedNote = await StorageService.updateNote({
        id,
        isPinned: !note.isPinned,
      });

      if (updatedNote) {
        set((state) => ({
          notes: sortNotesWithPinnedFirst(
            state.notes.map((n) => (n.id === id ? updatedNote : n))
          ),
        }));
        return true;
      }
      return false;
    } catch (err) {
      set({ error: 'Failed to toggle pin' });
      console.error('Error toggling pin:', err);
      return false;
    }
  },

  refreshNotes: async () => {
    await get().loadNotes();
  },

  clearError: () => set({ error: null }),
}));

export const useFilteredNotes = () => {
  const notes = useNoteStore((s) => s.notes);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  return useMemo(
    () => {
      // Hide json-format notes from the list — these are leftovers from a
      // previous version of RepoFileSyncService that imported `.json` files
      // (resume schemas, package.json, etc.) as notes. The source is fixed,
      // but storage may still hold them until the next reconcile drops them.
      const noteOnly = notes.filter((n) => n.format !== 'json');
      return searchQuery ? filterNotesBySearch(noteOnly, searchQuery) : noteOnly;
    },
    [notes, searchQuery],
  );
};

// ── Delete-completion handlers ────────────────────────────────────────
// The registry never removes a note's local row itself — queued deletes
// complete asynchronously, so noteStore listens ONCE for the queue's
// success/drop side channels and finishes the job there.

let deleteHandlersArmed = false;

function normalizeBranchForMatch(branch: string | undefined): string {
  return branch || 'main';
}

function findNoteForDelete(mutation: {
  repo?: string;
  branch?: string;
  filePath?: string;
  localNoteId?: string;
}): Note | undefined {
  const { repo, branch, filePath, localNoteId } = mutation;
  if (!repo || !filePath) return undefined;
  const notes = useNoteStore.getState().notes;
  if (localNoteId) return notes.find((n) => n.id === localNoteId);
  return notes.find(
    (n) =>
      n.repo === repo &&
      normalizeBranchForMatch(n.branch) === normalizeBranchForMatch(branch) &&
      (n.filePath === filePath || deriveDefaultNotePath(n) === filePath),
  );
}

function deleteOpMatches(
  op: GitOp,
  repo: string,
  branch: string | undefined,
  filePath: string,
  localNoteId: string | undefined,
): boolean {
  if (op.kind !== 'delete') return false;
  const pathMatch =
    op.repo === repo && normalizeBranchForMatch(op.branch) === normalizeBranchForMatch(branch) && op.path === filePath;
  const entityMatch = !!localNoteId && op.entityIds.includes(localNoteId);
  return pathMatch || entityMatch;
}

function succeedDeleteOps(
  repo: string,
  branch: string | undefined,
  filePath: string,
  localNoteId: string | undefined,
): void {
  const { ops } = useGitOperationStore.getState();
  for (const [id, op] of Object.entries(ops)) {
    if (deleteOpMatches(op, repo, branch, filePath, localNoteId)) {
      useGitOperationStore.getState().succeed(id);
    }
  }
}

function failDeleteOps(
  repo: string,
  branch: string | undefined,
  filePath: string,
  localNoteId: string | undefined,
  error: string,
): void {
  const { ops } = useGitOperationStore.getState();
  for (const [id, op] of Object.entries(ops)) {
    if (deleteOpMatches(op, repo, branch, filePath, localNoteId)) {
      useGitOperationStore.getState().fail(id, error);
    }
  }
}

function onDeleteMutationSucceeded(event: MutationSucceededEvent): void {
  const mutation = event.mutation;
  if (mutation.type !== 'note.delete') return;
  const note = findNoteForDelete(mutation.params);
  if (note) {
    void StorageService.deleteNote(note.id).catch(() => undefined);
    useNoteStore.setState((state) => ({ notes: state.notes.filter((n) => n.id !== note.id) }));
  }
  succeedDeleteOps(mutation.params.repo ?? '', mutation.params.branch, mutation.params.filePath ?? '', mutation.params.localNoteId);
}

function onDeleteMutationDropped(event: DroppedMutationEvent): void {
  const mutation = event.mutation;
  if (mutation.type !== 'note.delete') return;
  failDeleteOps(
    mutation.params.repo ?? '',
    mutation.params.branch,
    mutation.params.filePath ?? '',
    mutation.params.localNoteId,
    event.error || 'Delete failed',
  );
  void recordDeleteFailure(
    mutation.params.repo ?? '',
    mutation.params.branch,
    mutation.params.filePath ?? '',
    {
      error: event.error || 'Delete failed',
      kind: event.reason ?? 'unknown',
      at: Date.now(),
    },
  );
}

/**
 * Registers the success/drop handlers exactly once. Guarded so test suites
 * that mock NoteSyncQueueService without the side-channel methods can still
 * import this store without crashing.
 */
function armDeleteCompletionHandlers(): void {
  if (deleteHandlersArmed) return;
  if (typeof NoteSyncQueueService.onMutationSucceeded !== 'function') return;
  if (typeof NoteSyncQueueService.onDroppedMutation !== 'function') return;
  NoteSyncQueueService.onMutationSucceeded(onDeleteMutationSucceeded);
  NoteSyncQueueService.onDroppedMutation(onDeleteMutationDropped);
  deleteHandlersArmed = true;
}

armDeleteCompletionHandlers();
