import { useCallback, useMemo } from 'react';

import { useEntityList } from '../../hooks/useEntityList';
import { Note, NoteColor, NOTE_COLOR_VALUES, NoteFormat } from '../../models/Note';
import { SortMode } from '../../types/SortTypes';
import { GitRepository } from '../../services/GitService';
import {
  INITIAL_NOTES_LIST_FILTERS,
  NotesListFilters,
  getActiveNotesFilterCount,
  noteMatchesListFilters,
} from './notesShared';

function compareNotes(a: Note, b: Note, mode: SortMode): number {
  const aPinned = a.isPinned ? 1 : 0;
  const bPinned = b.isPinned ? 1 : 0;
  if (aPinned !== bPinned) {
    return bPinned - aPinned;
  }
  const dir = mode.direction === 'asc' ? 1 : -1;
  switch (mode.field) {
    case 'modified':
      return dir * (a.updatedAt - b.updatedAt);
    case 'created':
      return dir * (a.createdAt - b.createdAt);
    case 'title':
      return dir * a.title.localeCompare(b.title);
  }
}

interface UseNotesListFiltersArgs {
  notes: Note[];
  filteredNotes: Note[];
  searchQuery: string;
  persistenceKey?: string;
}

export function useNotesListFilters({
  notes,
  filteredNotes,
  searchQuery,
  persistenceKey,
}: UseNotesListFiltersArgs) {
  const {
    filteredData,
    filters: rawFilters,
    setFilters,
    sortMode,
    setSortMode,
  } = useEntityList<Note>({
    data: filteredNotes,
    searchFields: ['title'],
    entityName: 'notes',
    sortFn: compareNotes,
    initialFilters: INITIAL_NOTES_LIST_FILTERS,
    filterFn: (note, filters) => noteMatchesListFilters(note, filters as NotesListFilters),
    persistenceKey,
  });

  const filters = rawFilters as NotesListFilters;
  const displayNotes = filteredData;
  const hasActiveSearch = searchQuery.trim().length > 0;
  const searchMatchCount = hasActiveSearch ? displayNotes.length : 0;
  const activeFilterCount = getActiveNotesFilterCount(filters);

  const updateFilters = useCallback(
    (updater: (previous: NotesListFilters) => NotesListFilters) => {
      setFilters(updater(filters));
    },
    [filters, setFilters],
  );

  const allColors = useMemo(() => {
    const present = new Set<NoteColor>();
    for (const note of notes) {
      if (note.color) present.add(note.color);
    }
    return NOTE_COLOR_VALUES.filter((color) => present.has(color));
  }, [notes]);

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    notes.forEach((note) => note.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags).sort();
  }, [notes]);

  const allFolders = useMemo(() => {
    const folders = new Set<string>();
    const scopedNotes = filters.selectedRepo
      ? notes.filter((note) => note.repo === filters.selectedRepo?.path)
      : notes;
    const collectFolder = (folderPath?: string) => {
      const trimmed = folderPath?.trim();
      if (!trimmed) return;
      const parts = trimmed.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current = current ? `${current}/${part}` : part;
        folders.add(current);
      }
    };
    scopedNotes.forEach((note) => {
      collectFolder(note.folderPath);
      if (note.filePath) {
        const index = note.filePath.lastIndexOf('/');
        if (index > 0) collectFolder(note.filePath.slice(0, index));
      }
    });
    return Array.from(folders).sort();
  }, [filters.selectedRepo, notes]);

  const allBranches = useMemo(() => {
    if (!filters.selectedRepo) return [];
    const branches = new Set<string>();
    notes.forEach((note) => {
      if (note.repo === filters.selectedRepo?.path && note.branch) branches.add(note.branch);
    });
    return Array.from(branches).sort();
  }, [filters.selectedRepo, notes]);

  const handleClearFilters = useCallback(() => {
    setFilters(INITIAL_NOTES_LIST_FILTERS);
  }, [setFilters]);

  const handleSelectRepo = useCallback(
    (repo: GitRepository | null) => {
      updateFilters((previous) => ({ ...previous, selectedRepo: repo, selectedBranch: null }));
    },
    [updateFilters],
  );

  const handleSelectFormat = useCallback(
    (format: NoteFormat | null) => {
      updateFilters((previous) => ({ ...previous, selectedFormat: format }));
    },
    [updateFilters],
  );

  const handleSelectBranch = useCallback(
    (branch: string | null) => {
      updateFilters((previous) => ({ ...previous, selectedBranch: branch }));
    },
    [updateFilters],
  );

  const handleSelectFolder = useCallback(
    (folder: string | null) => {
      updateFilters((previous) => ({ ...previous, selectedFolder: folder }));
    },
    [updateFilters],
  );

  const handleToggleTag = useCallback(
    (tag: string) => {
      updateFilters((previous) => ({
        ...previous,
        selectedTags: previous.selectedTags.includes(tag)
          ? previous.selectedTags.filter((value) => value !== tag)
          : [...previous.selectedTags, tag],
      }));
    },
    [updateFilters],
  );

  const handleToggleColor = useCallback(
    (color: NoteColor) => {
      updateFilters((previous) => ({
        ...previous,
        selectedColors: previous.selectedColors.includes(color)
          ? previous.selectedColors.filter((value) => value !== color)
          : [...previous.selectedColors, color],
      }));
    },
    [updateFilters],
  );

  return {
    filters,
    displayNotes,
    hasActiveSearch,
    searchMatchCount,
    activeFilterCount,
    allColors,
    allTags,
    allFolders,
    allBranches,
    sortMode,
    setSortMode,
    handleClearFilters,
    handleSelectRepo,
    handleSelectFormat,
    handleSelectBranch,
    handleSelectFolder,
    handleToggleTag,
    handleToggleColor,
  };
}
