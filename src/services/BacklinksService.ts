import { Note } from '../models/Note';
import { parseWikiLinks } from '../utils/wikiLinksParser';

export interface Backlink {
  sourceNoteId: string;
  sourceNoteTitle: string;
  snippet: string;
  linkText: string;
}

const SNIPPET_MAX_LENGTH = 120;

function stripSupportedExtension(value: string): string {
  return value.replace(/\.(md|txt)$/i, '');
}

function normalizeValue(value: string): string {
  return stripSupportedExtension(value.trim()).toLowerCase();
}

function getBasename(value: string): string {
  const trimmed = value.trim().replace(/\\/g, '/');
  const segments = trimmed.split('/');
  return segments[segments.length - 1] ?? trimmed;
}

function getNoteLookupKeys(note: Note): string[] {
  const keys = new Set<string>();

  const normalizedTitle = normalizeValue(note.title);
  if (normalizedTitle) {
    keys.add(normalizedTitle);
  }

  if (note.filePath) {
    const normalizedPath = normalizeValue(note.filePath);
    const normalizedBasename = normalizeValue(getBasename(note.filePath));

    if (normalizedPath) {
      keys.add(normalizedPath);
    }

    if (normalizedBasename) {
      keys.add(normalizedBasename);
    }
  }

  return [...keys];
}

function getLinkLookupKeys(target: string): string[] {
  const keys = new Set<string>();
  const normalizedTarget = normalizeValue(target);
  const normalizedBasename = normalizeValue(getBasename(target));

  if (normalizedTarget) {
    keys.add(normalizedTarget);
  }

  if (normalizedBasename) {
    keys.add(normalizedBasename);
  }

  return [...keys];
}

function buildTargetLookup(notes: Note[]): Map<string, Note> {
  const sortedNotes = [...notes].sort((left, right) => {
    const leftPath = left.filePath ?? '';
    const rightPath = right.filePath ?? '';
    return leftPath.localeCompare(rightPath) || left.id.localeCompare(right.id);
  });

  const lookup = new Map<string, Note>();

  for (const note of sortedNotes) {
    for (const key of getNoteLookupKeys(note)) {
      if (!lookup.has(key)) {
        lookup.set(key, note);
      }
    }
  }

  return lookup;
}

function getSnippet(content: string, startIndex: number): string {
  const lineStart = content.lastIndexOf('\n', Math.max(startIndex - 1, 0));
  const lineEnd = content.indexOf('\n', startIndex);
  const snippet = content
    .slice(lineStart === -1 ? 0 : lineStart + 1, lineEnd === -1 ? content.length : lineEnd)
    .trim();

  if (snippet.length <= SNIPPET_MAX_LENGTH) {
    return snippet;
  }

  return `${snippet.slice(0, SNIPPET_MAX_LENGTH - 3).trimEnd()}...`;
}

function createBacklink(sourceNote: Note, snippet: string, linkText: string): Backlink {
  return {
    sourceNoteId: sourceNote.id,
    sourceNoteTitle: sourceNote.title,
    snippet,
    linkText,
  };
}

function findTargetNote(target: string, lookup: Map<string, Note>): Note | undefined {
  for (const key of getLinkLookupKeys(target)) {
    const match = lookup.get(key);
    if (match) {
      return match;
    }
  }

  return undefined;
}

function findNoteByPath(notes: Note[], currentNotePath: string): Note | undefined {
  const normalizedCurrentPath = normalizeValue(currentNotePath);

  return notes.find((note) => {
    if (!note.filePath) {
      return false;
    }

    return normalizeValue(note.filePath) === normalizedCurrentPath;
  });
}

export function buildBacklinkIndex(notes: Note[]): Map<string, Backlink[]> {
  const lookup = buildTargetLookup(notes);
  const index = new Map<string, Backlink[]>();

  for (const note of notes) {
    index.set(note.id, []);
  }

  for (const sourceNote of notes) {
    for (const link of parseWikiLinks(sourceNote.content)) {
      const targetNote = findTargetNote(link.target, lookup);

      if (!targetNote || targetNote.id === sourceNote.id) {
        continue;
      }

      const backlinks = index.get(targetNote.id);
      if (!backlinks) {
        continue;
      }

      backlinks.push(createBacklink(sourceNote, getSnippet(sourceNote.content, link.startIndex), link.displayText));
    }
  }

  return index;
}

export function computeBacklinks(notes: Note[], currentNotePath: string): Backlink[] {
  const currentNote = findNoteByPath(notes, currentNotePath);

  if (!currentNote) {
    return [];
  }

  return buildBacklinkIndex(notes).get(currentNote.id) ?? [];
}

export async function reindexDocumentBacklinks(_service: unknown, _document: unknown): Promise<void> {
  // Stub: backlink reindexing is handled by DocumentIndex
}
