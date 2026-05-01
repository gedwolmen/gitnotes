import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Note, NoteCreateInput, NoteUpdateInput, sortNotesWithPinnedFirst, filterNotesBySearch } from '../models/Note';
import { StorageService } from '../services/StorageService';

// Read-side state. Changes whenever notes/searchQuery/loading/error change.
interface NotesData {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredNotes: Note[];
}

// Write-side actions. Stable for the lifetime of the provider so consumers
// that only need to mutate notes don't re-render on every notes-array change.
interface NotesActions {
  createNote: (input: NoteCreateInput) => Promise<Note | null>;
  updateNote: (input: NoteUpdateInput) => Promise<Note | null>;
  deleteNote: (id: string) => Promise<boolean>;
  clearAllNotes: () => Promise<boolean>;
  getNoteById: (id: string) => Note | undefined;
  togglePin: (id: string) => Promise<boolean>;
  refreshNotes: () => Promise<void>;
  clearError: () => void;
}

// Backwards-compatible shape. Existing consumers keep using useNotes()
// without changes. New consumers can pull just data or just actions.
type NoteContextType = NotesData & NotesActions;

const NotesDataContext = createContext<NotesData | undefined>(undefined);
const NotesActionsContext = createContext<NotesActions | undefined>(undefined);

interface NoteProviderProps {
  children: ReactNode;
}

export function NoteProvider({ children }: NoteProviderProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadNotes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedNotes = await StorageService.getAllNotes();
      setNotes(sortNotesWithPinnedFirst(loadedNotes));
    } catch (err) {
      setError('Failed to load notes');
      console.error('Error loading notes:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotes();
  }, [loadNotes]);

  const createNote = useCallback(async (input: NoteCreateInput): Promise<Note | null> => {
    try {
      setError(null);
      const newNote = await StorageService.createNote(input);
      setNotes((prev) => sortNotesWithPinnedFirst([...prev, newNote]));
      return newNote;
    } catch (err) {
      setError('Failed to create note');
      console.error('Error creating note:', err);
      return null;
    }
  }, []);

  const updateNote = useCallback(async (input: NoteUpdateInput): Promise<Note | null> => {
    try {
      setError(null);
      const updatedNote = await StorageService.updateNote(input);
      if (updatedNote) {
        setNotes((prev) =>
          sortNotesWithPinnedFirst(prev.map((note) => (note.id === updatedNote.id ? updatedNote : note)))
        );
      }
      return updatedNote;
    } catch (err) {
      setError('Failed to update note');
      console.error('Error updating note:', err);
      return null;
    }
  }, []);

  const deleteNote = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      const success = await StorageService.deleteNote(id);
      if (success) {
        setNotes((prev) => prev.filter((note) => note.id !== id));
      }
      return success;
    } catch (err) {
      setError('Failed to delete note');
      console.error('Error deleting note:', err);
      return false;
    }
  }, []);

  const clearAllNotes = useCallback(async (): Promise<boolean> => {
    try {
      setError(null);
      await StorageService.clearAllNotes();
      setNotes([]);
      return true;
    } catch (err) {
      setError('Failed to clear notes');
      console.error('Error clearing notes:', err);
      return false;
    }
  }, []);

  // Read against the latest notes via a ref so this callback is stable
  // even though the body needs the current array.
  const notesRef = React.useRef(notes);
  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  const getNoteById = useCallback(
    (id: string): Note | undefined => notesRef.current.find((note) => note.id === id),
    [],
  );

  const togglePin = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      const note = notesRef.current.find((n) => n.id === id);
      if (!note) return false;

      const updatedNote = await StorageService.updateNote({
        id,
        isPinned: !note.isPinned,
      });

      if (updatedNote) {
        setNotes((prev) =>
          sortNotesWithPinnedFirst(prev.map((n) => (n.id === id ? updatedNote : n)))
        );
        return true;
      }
      return false;
    } catch (err) {
      setError('Failed to toggle pin');
      console.error('Error toggling pin:', err);
      return false;
    }
  }, []);

  const refreshNotes = useCallback(async () => {
    await loadNotes();
  }, [loadNotes]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const filteredNotes = useMemo(
    () => (searchQuery ? filterNotesBySearch(notes, searchQuery) : notes),
    [notes, searchQuery],
  );

  const dataValue: NotesData = useMemo(
    () => ({ notes, isLoading, error, searchQuery, setSearchQuery, filteredNotes }),
    [notes, isLoading, error, searchQuery, filteredNotes],
  );

  const actionsValue: NotesActions = useMemo(
    () => ({
      createNote,
      updateNote,
      deleteNote,
      clearAllNotes,
      getNoteById,
      togglePin,
      refreshNotes,
      clearError,
    }),
    [createNote, updateNote, deleteNote, clearAllNotes, getNoteById, togglePin, refreshNotes, clearError],
  );

  return (
    <NotesActionsContext.Provider value={actionsValue}>
      <NotesDataContext.Provider value={dataValue}>{children}</NotesDataContext.Provider>
    </NotesActionsContext.Provider>
  );
}

export function useNotesData(): NotesData {
  const ctx = useContext(NotesDataContext);
  if (!ctx) throw new Error('useNotesData must be used within a NoteProvider');
  return ctx;
}

export function useNotesActions(): NotesActions {
  const ctx = useContext(NotesActionsContext);
  if (!ctx) throw new Error('useNotesActions must be used within a NoteProvider');
  return ctx;
}

// Backwards-compat: returns the merged shape. Components using this still
// re-render on every notes update; migrate to useNotesData / useNotesActions
// where only one half is needed.
export function useNotes(): NoteContextType {
  const data = useNotesData();
  const actions = useNotesActions();
  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
}
