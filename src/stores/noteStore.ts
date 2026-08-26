import { useMemo } from 'react';
import { create } from 'zustand';
import { Note, NoteCreateInput, NoteUpdateInput, sortNotesWithPinnedFirst, filterNotesBySearch } from '../models/Note';
import { StorageService } from '../services/StorageService';
import { slugifyLocal, getExtensionForFormat } from '../components/editor/editorShared';

type SaveResult = { success: boolean; error?: string };

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
      if (newNote) {
        set((state) => ({ notes: sortNotesWithPinnedFirst([...state.notes, newNote]) }));
      }
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

  upsertNote: async (input) => {
    try {
      const updatedNote = await StorageService.updateNote(input);
      if (updatedNote) {
        set((state) => ({
          notes: sortNotesWithPinnedFirst(
            state.notes.map((note) => (note.id === updatedNote.id ? updatedNote : note))
          ),
        }));
      }
      return { success: true };
    } catch {
      return { success: false, error: 'unknown' };
    }
  },

  deleteNote: async (id) => {
    try {
      set({ error: null });
      const note = get().notes.find((n) => n.id === id);
      if (!note) return false;
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
      const matches = get().notes.filter((note) => {
        if (!note.repo || note.repo !== repo) return false;
        return !!note.filePath && pathSet.has(note.filePath);
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
      const noteOnly = notes.filter((n) => n.format !== 'json');
      return searchQuery ? filterNotesBySearch(noteOnly, searchQuery) : noteOnly;
    },
    [notes, searchQuery],
  );
};

export function deriveDefaultNotePath(note: Note): string | null {
  // Stub implementation - returns null to indicate no path derived
  return null;
}
