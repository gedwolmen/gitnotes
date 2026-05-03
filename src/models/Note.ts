import { Attachment } from './Attachment';

export type NoteFormat = 'markdown' | 'neorg' | 'org' | 'pdf' | 'json';

export interface NoteGitHubLink {
  owner: string;
  repo: string;
  issueNumber?: number;
  milestoneNumber?: number;
  prNumber?: number;
  htmlUrl?: string;
  title?: string;
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
  filePath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
  github?: NoteGitHubLink;
  attachments?: Attachment[];
}

export interface NoteCreateInput {
  title: string;
  content: string;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
  folderPath?: string;
  filePath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
  attachments?: Attachment[];
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
  filePath?: string;
  isPinned?: boolean;
  format?: NoteFormat;
  attachments?: Attachment[];
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
    filePath: input.filePath,
    isPinned: input.isPinned || false,
    format: input.format || 'markdown',
    attachments: input.attachments || [],
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
    filePath: input.filePath ?? existing.filePath,
    isPinned: input.isPinned ?? existing.isPinned,
    format: input.format ?? existing.format,
    attachments: input.attachments ?? existing.attachments,
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
    if (b.updatedAt !== a.updatedAt) {
      return b.updatedAt - a.updatedAt;
    }
    if (b.createdAt !== a.createdAt) {
      return b.createdAt - a.createdAt;
    }
    return b.id.localeCompare(a.id);
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

  const normalize = (value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return '/';
    const withoutTrailingSlash = trimmed.replace(/\/+$/, '');
    if (!withoutTrailingSlash) return '/';
    return withoutTrailingSlash.startsWith('/') ? withoutTrailingSlash : `/${withoutTrailingSlash}`;
  };

  const targetPath = normalize(folderPath);
  return notes.filter((note) => {
    if (!note.folderPath) return false;
    return normalize(note.folderPath) === targetPath;
  });
}

export function getNotesInFolderAndSubfolders(notes: Note[], folderPath: string): Note[] {
  return notes.filter(note => {
    if (!note.folderPath) return folderPath === '/';
    return note.folderPath === folderPath || note.folderPath.startsWith(folderPath + '/');
  });
}

export function getNoteFileExtension(format?: NoteFormat): string {
  switch (format) {
    case 'neorg': return '.norg';
    case 'org': return '.org';
    case 'pdf': return '.pdf';
    case 'json': return '.json';
    default: return '.md';
  }
}

export function isNeorgNote(note: Note): boolean {
  return note.format === 'neorg';
}

export function getSupportedFileExtensions(): string[] {
  return ['.md', '.norg', '.org', '.pdf', '.json'];
}

export function isSupportedFileExtension(filename: string): boolean {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  return getSupportedFileExtensions().includes(ext);
}

export function deriveFolderPath(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash <= 0) return undefined;
  return filePath.substring(0, lastSlash);
}
