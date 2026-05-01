import React, { useEffect, useMemo } from 'react';
import { Note, NoteCreateInput, NoteUpdateInput } from '../models/Note';
import { useNoteStore, useFilteredNotes } from '../stores/noteStore';

interface NotesData {
  notes: Note[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredNotes: Note[];
}

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

type NoteContextType = NotesData & NotesActions;

export function NoteProvider({ children }: { children: React.ReactNode }) {
  const loadNotes = useNoteStore((s) => s.loadNotes);
  const needsLoad = useNoteStore((s) => s.isLoading && s.notes.length === 0);

  useEffect(() => {
    if (needsLoad) loadNotes();
  }, [needsLoad, loadNotes]);

  return <>{children}</>;
}

export function useNotesData(): NotesData {
  const notes = useNoteStore((s) => s.notes);
  const isLoading = useNoteStore((s) => s.isLoading);
  const error = useNoteStore((s) => s.error);
  const searchQuery = useNoteStore((s) => s.searchQuery);
  const setSearchQuery = useNoteStore((s) => s.setSearchQuery);
  const filteredNotes = useFilteredNotes();
  return useMemo(
    () => ({ notes, isLoading, error, searchQuery, setSearchQuery, filteredNotes }),
    [notes, isLoading, error, searchQuery, filteredNotes],
  );
}

export function useNotesActions(): NotesActions {
  const createNote = useNoteStore((s) => s.createNote);
  const updateNote = useNoteStore((s) => s.updateNote);
  const deleteNote = useNoteStore((s) => s.deleteNote);
  const clearAllNotes = useNoteStore((s) => s.clearAllNotes);
  const getNoteById = useNoteStore((s) => s.getNoteById);
  const togglePin = useNoteStore((s) => s.togglePin);
  const refreshNotes = useNoteStore((s) => s.refreshNotes);
  const clearError = useNoteStore((s) => s.clearError);
  return useMemo(
    () => ({ createNote, updateNote, deleteNote, clearAllNotes, getNoteById, togglePin, refreshNotes, clearError }),
    [createNote, updateNote, deleteNote, clearAllNotes, getNoteById, togglePin, refreshNotes, clearError],
  );
}

export function useNotes(): NoteContextType {
  const data = useNotesData();
  const actions = useNotesActions();
  return useMemo(() => ({ ...data, ...actions }), [data, actions]);
}
