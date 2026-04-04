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
}

export interface NoteCreateInput {
  title: string;
  content: string;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
}

export interface NoteUpdateInput {
  id: string;
  title?: string;
  content?: string;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
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
    updatedAt: Date.now(),
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function sortNotesByUpdated(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
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
