export type NoteFormat = 'markdown' | 'neorg';

export interface NoteGitHubLink {
  owner: string;
  repo: string;
  issueNumber?: number;
  milestoneNumber?: number;
  htmlUrl?: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  repo?: string;
  branch?: string;
  commit?: string;
  folderPath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
  github?: NoteGitHubLink;
}

export interface NoteCreateInput {
  title: string;
  content: string;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
  folderPath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
}

export interface NoteUpdateInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
  folderPath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
}

export function createNote(input: NoteCreateInput): Note {
  const now = Date.now();
  return {
    id: generateId(),
    title: input.title,
    content: input.content,
    createdAt: now,
    updatedAt: now,
    tags: input.tags || [],
    repo: input.repo,
    branch: input.branch,
    commit: input.commit,
    folderPath: input.folderPath,
    isPinned: input.isPinned || false,
    format: input.format || 'markdown',
  };
}

export function updateNote(existing: Note, input: Partial<NoteCreateInput>): Note {
  return {
    ...existing,
    title: input.title ?? existing.title,
    content: input.content ?? existing.content,
    tags: input.tags ?? existing.tags,
    repo: input.repo ?? existing.repo,
    branch: input.branch ?? existing.branch,
    commit: input.commit ?? existing.commit,
    folderPath: input.folderPath ?? existing.folderPath,
    isPinned: input.isPinned ?? existing.isPinned,
    format: input.format ?? existing.format,
    updatedAt: Date.now(),
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function sortNotesByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function sortNotesWithPinnedFirst(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => {
    const aPinned = a.isPinned ? 1 : 0;
    const bPinned = b.isPinned ? 1 : 0;
    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }
    return b.updatedAt - a.updatedAt;
  });
}

export function filterNotesBySearch(notes: Note[], searchQuery: string): Note[] {
  if (!searchQuery.trim()) return notes;
  const query = searchQuery.toLowerCase();
  return notes.filter(
    (note) =>
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query) ||
      note.tags.some((tag) => tag.toLowerCase().includes(query))
  );
}

export function filterNotesByFolder(notes: Note[], folderPath: string | null): Note[] {
  if (folderPath === null || folderPath === undefined) return notes;
  return notes.filter(note => note.folderPath === folderPath);
}

export function getNotesInFolderAndSubfolders(notes: Note[], folderPath: string): Note[] {
  return notes.filter(note => {
    if (!note.folderPath) return folderPath === '/';
    return note.folderPath === folderPath || note.folderPath.startsWith(folderPath + '/');
  });
}

export function getNoteFileExtension(format?: NoteFormat): string {
  return format === 'neorg' ? '.norg' : '.md';
}

export function isNeorgNote(note: Note): boolean {
  return note.format === 'neorg';
}

export function getSupportedFileExtensions(): string[] {
  return ['.md', '.norg'];
}

export function isSupportedFileExtension(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return getSupportedFileExtensions().includes(ext);
}
