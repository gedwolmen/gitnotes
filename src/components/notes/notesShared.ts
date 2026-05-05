import { Note, NoteColor, NoteFormat } from '../../models/Note';
import { GitRepository } from '../../services/GitService';

export const NOTE_FORMAT_LABELS: Record<Exclude<NoteFormat, 'json'>, string> = {
  markdown: '.md',
  neorg: '.norg',
  org: '.org',
  pdf: '.pdf',
};

export interface NotesListFilters {
  [key: string]: unknown;
  selectedRepo: GitRepository | null;
  selectedBranch: string | null;
  selectedFormat: NoteFormat | null;
  selectedFolder: string | null;
  selectedTags: string[];
  selectedColors: NoteColor[];
}

export const INITIAL_NOTES_LIST_FILTERS: NotesListFilters = {
  selectedRepo: null,
  selectedBranch: null,
  selectedFormat: null,
  selectedFolder: null,
  selectedTags: [],
  selectedColors: [],
};

export function getActiveNotesFilterCount(filters: NotesListFilters): number {
  return (
    (filters.selectedRepo ? 1 : 0) +
    (filters.selectedBranch ? 1 : 0) +
    (filters.selectedFolder ? 1 : 0) +
    (filters.selectedFormat ? 1 : 0) +
    (filters.selectedTags.length > 0 ? 1 : 0) +
    (filters.selectedColors.length > 0 ? 1 : 0)
  );
}

export function getNoteFolderCandidates(note: Note): string[] {
  const candidates: string[] = [];
  if (note.folderPath) candidates.push(note.folderPath);
  if (note.filePath) {
    const idx = note.filePath.lastIndexOf('/');
    if (idx > 0) candidates.push(note.filePath.slice(0, idx));
  }
  return candidates;
}

export function noteMatchesListFilters(note: Note, filters: NotesListFilters): boolean {
  const {
    selectedRepo,
    selectedBranch,
    selectedFolder,
    selectedFormat,
    selectedTags,
    selectedColors,
  } = filters;

  if (selectedFolder) {
    const matchesFolder = getNoteFolderCandidates(note).some(
      (folderPath) => folderPath === selectedFolder || folderPath.startsWith(`${selectedFolder}/`),
    );
    if (!matchesFolder) return false;
  }

  if (selectedRepo && note.repo !== selectedRepo.path) return false;
  if (selectedBranch && note.branch !== selectedBranch) return false;
  if (selectedFormat && (note.format ?? 'markdown') !== selectedFormat) return false;
  if (selectedTags.length > 0 && !selectedTags.every((tag) => note.tags?.includes(tag))) return false;
  if (selectedColors.length > 0 && (note.color == null || !selectedColors.includes(note.color))) {
    return false;
  }

  return true;
}
