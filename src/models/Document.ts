/**
 * Unified local-first document model.
 *
 * Every piece of user content (notes, todos, thought dumps, templates,
 * journals, canvases, AI conversations) is a plain FILE on disk under
 * `Paths.document/documents/<type>/<slug>.<ext>`. The file's frontmatter is
 * the source of truth; the sqlite index (`DocumentIndex`) mirrors the metadata
 * for fast listing/search and never stores document bodies.
 */

export const DOCUMENT_TYPES = [
  'note',
  'todo',
  'thought-dump',
  'template',
  'journal',
  'canvas',
  'ai',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export function isDocumentType(value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value);
}

/**
 * Frontmatter fields written into the file itself. Files are the source of
 * truth; the sqlite index mirrors a denormalized projection of these.
 */
export interface DocumentFrontmatter {
  id?: string;
  title?: string;
  type?: DocumentType;
  tags?: string[];
  folder?: string;
  isPinned?: boolean;
  color?: string;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/**
 * Denormalized metadata row (mirror of the file's frontmatter) stored in the
 * sqlite `documents` table. Used for listing/search without reading bodies.
 */
export interface DocumentMeta {
  id: string;
  type: DocumentType;
  /** Relative path under the documents root, e.g. `note/my-first-note.md`. */
  path: string;
  title: string;
  /** File name without extension. */
  slug: string;
  folder: string | null;
  tags: string[];
  /** Milliseconds since epoch. */
  createdAt: number;
  /** Milliseconds since epoch. */
  updatedAt: number;
  isPinned: boolean;
  deleted: boolean;
}

/** A fully-read document: metadata plus the file body (frontmatter stripped). */
export interface Document extends DocumentMeta {
  /** File body without the frontmatter block. For `canvas` this is JSON. */
  body: string;
  /** The complete raw file content (frontmatter + body). */
  raw: string;
}

export type DocumentFormat = 'markdown' | 'neorg' | 'org' | 'json' | 'canvas';

export interface DocumentCreateInput {
  type: DocumentType;
  title: string;
  body?: string;
  tags?: string[];
  folder?: string | null;
  isPinned?: boolean;
  /** DocumentFormat or a raw extension string; default derives from type. */
  format?: string;
  createdAt?: number;
  /** Any additional frontmatter fields to persist on the file. */
  extra?: DocumentFrontmatter;
}

export interface DocumentUpdateInput {
  title?: string;
  body?: string;
  tags?: string[];
  folder?: string | null;
  isPinned?: boolean;
  /** DocumentFormat or a raw extension string; undefined keeps the current one. */
  format?: string;
  /** Additional frontmatter fields to merge into the file. */
  extra?: DocumentFrontmatter;
  /** Set to true to keep `updatedAt` unchanged (e.g. index reconciliation). */
  preserveTimestamp?: boolean;
}

export interface FolderRow {
  id: number;
  name: string;
  parent: string | null;
  createdAt: number;
}

export interface TagRow {
  id: number;
  name: string;
  createdAt: number;
}

export interface BacklinkRow {
  sourceId: string;
  targetSlug: string;
  createdAt: number;
}

export type DocumentErrorCode =
  | 'INVALID_TYPE'
  | 'INVALID_SLUG'
  | 'DOCUMENT_NOT_FOUND'
  | 'DOCUMENT_EXISTS'
  | 'FRONTMATTER_INVALID'
  | 'IO_ERROR';

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode, message: string) {
    super(message);
    this.name = 'DocumentError';
    this.code = code;
  }
}

export type DocumentListOptions = {
  type?: DocumentType;
  folder?: string | null;
  includeDeleted?: boolean;
  limit?: number;
};

export type SearchOptions = {
  type?: DocumentType;
  includeDeleted?: boolean;
  limit?: number;
  /** Search body contents too (reads files). Default true. */
  includeBody?: boolean;
};
