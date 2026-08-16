import { useMemo } from 'react';
import { create } from 'zustand';
import { Note, NoteCreateInput, NoteUpdateInput, sortNotesWithPinnedFirst, filterNotesBySearch } from '../models/Note';
import { StorageService } from '../services/StorageService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import type { MutationSucceededEvent, DroppedMutationEvent, NoteDeleteParams } from '../services/NoteSyncQueueService';
import { SyncEngineService } from '../services/SyncEngineService';
import { FEATURE_STAGE_PUSH } from '../services/featureFlags';
import { StagingService } from '../services/git/StagingService';
import { gitOperationRegistry, useGitOperationStore } from './gitOperationStore';
import type { GitOp } from './gitOperationStore';
import { slugifyLocal, getExtensionForFormat } from '../components/editor/editorShared';
import { parseRepoPath } from '../utils/gitPathParser';

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
  return note.folderPath ? `${note.folderPath}/${slug}${ext}` : `notes/${slug}${ext}`;
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
    try {
      set({ error: null });
      const newNote = await StorageService.createNote(input);
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

  deleteNote: async (id) => {
    try {
      set({ error: null });

      const note = get().notes.find((n) => n.id === id);
      if (!note) return false;

      if (note.repo) {
        const repoPath = note.repo;
        const filePath = note.filePath ?? deriveDefaultNotePath(note);
        if (filePath) {
          // The note stays in storage and renders locked until the queue
          // reports success (row removed) or a drop (Retry shown).
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
          if (FEATURE_STAGE_PUSH) {
            const mode = await SyncEngineService.getMode(repoPath);
            const stageResult = await StagingService.stageDelete(deleteParams);
            if (!stageResult.success) {
              set({ error: stageResult.error ?? 'Failed to delete note' });
              return false;
            }
            if (mode === 'clone') {
              // Clone-mode stageDelete commits the delete locally with no
              // queue mutation, so the side-channel completion handlers
              // never fire — finish the local delete right here.
              const opId = beginDeleteOp();
              const success = await StorageService.deleteNote(id);
              if (success) {
                set((state) => ({ notes: state.notes.filter((n) => n.id !== id) }));
                gitOperationRegistry.succeed(opId);
              } else {
                gitOperationRegistry.fail(opId, 'Failed to delete note locally');
              }
              return success;
            }
          } else {
            await NoteSyncQueueService.enqueueNoteDelete(deleteParams);
          }
          beginDeleteOp();
          if (!FEATURE_STAGE_PUSH) {
            void NoteSyncQueueService.drain();
          }
          return true;
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
  succeedDeleteOps(mutation.params.repo, mutation.params.branch, mutation.params.filePath, mutation.params.localNoteId);
}

function onDeleteMutationDropped(event: DroppedMutationEvent): void {
  const mutation = event.mutation;
  if (mutation.type !== 'note.delete') return;
  failDeleteOps(
    mutation.params.repo,
    mutation.params.branch,
    mutation.params.filePath,
    mutation.params.localNoteId,
    event.error ?? 'Delete failed',
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
