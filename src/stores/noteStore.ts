import { useMemo } from 'react';
import { create } from 'zustand';
import { Note, NoteCreateInput, NoteUpdateInput, sortNotesWithPinnedFirst, filterNotesBySearch } from '../models/Note';
import { StorageService } from '../services/StorageService';
import { deleteNoteFromGitHub } from '../services/NoteGitHubSyncService';
import { GitHubService } from '../services/GitHubService';
import { summarizePushError } from '../services/git/LocalGitWriter';

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
  clearAllNotes: () => Promise<boolean>;
  getNoteById: (id: string) => Note | undefined;
  togglePin: (id: string) => Promise<boolean>;
  refreshNotes: () => Promise<void>;
  clearError: () => void;
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
      if (note?.repo && note.filePath) {
        if (!GitHubService.isAuthenticated()) {
          set({ error: 'Sign in to GitHub to delete synced notes' });
          return false;
        }
        const remote = await deleteNoteFromGitHub({
          repo: note.repo,
          branch: note.branch,
          filePath: note.filePath,
          title: note.title,
          accountId: note.accountId,
        });
        if (!remote.success) {
          if (remote.error) console.warn('[NoteStore] delete sync failed:', remote.error);
          set({ error: summarizePushError(remote.error) });
          return false;
        }
      }

      const success = await StorageService.deleteNote(id);
      if (success) {
        set((state) => ({ notes: state.notes.filter((note) => note.id !== id) }));
      }
      return success;
    } catch (err) {
      set({ error: 'Failed to delete note' });
      console.error('Error deleting note:', err);
      return false;
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
    () => (searchQuery ? filterNotesBySearch(notes, searchQuery) : notes),
    [notes, searchQuery],
  );
};
