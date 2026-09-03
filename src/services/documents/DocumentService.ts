/**
 * Local-first document service.
 *
 * Documents are plain files under `Paths.document/documents/<type>/<slug>.<ext>`
 * with a YAML-ish frontmatter block (see `src/utils/frontmatterParser.ts`).
 * The file is the source of truth; `DocumentIndex` mirrors metadata in sqlite
 * for fast listing/search/folders/tags/backlinks. No document body is ever
 * stored in sqlite, and no legacy `expo-file-system` API is used.
 */

import { File, Directory, Paths } from 'expo-file-system';
import { parseFrontmatter, serializeFrontmatter } from '@/utils/frontmatterParser';
import { generateId } from '@/utils/ids';
import {
  type BacklinkRow,
  type Document,
  type DocumentCreateInput,
  DocumentError,
  type DocumentFrontmatter,
  type DocumentFormat,
  type DocumentListOptions,
  type DocumentMeta,
  type DocumentType,
  type DocumentUpdateInput,
  type FolderRow,
  type SearchOptions,
  type TagRow,
  isDocumentType,
} from '@/models/Document';
import { DocumentIndex } from './DocumentIndex';
import { reindexDocumentBacklinks } from '../BacklinksService';

export const DOCUMENTS_DIR_NAME = 'documents';

export const DOCUMENT_TYPE_DIRS: Record<DocumentType, string> = {
  note: 'note',
  todo: 'todo',
  'thought-dump': 'thought-dump',
  template: 'template',
  journal: 'journal',
  canvas: 'canvas',
  ai: 'ai',
};

export const DOCUMENT_TYPES = Object.keys(DOCUMENT_TYPE_DIRS) as DocumentType[];

const DEFAULT_FORMAT: Record<DocumentType, DocumentFormat> = {
  note: 'markdown',
  todo: 'markdown',
  'thought-dump': 'markdown',
  template: 'markdown',
  journal: 'markdown',
  canvas: 'canvas',
  ai: 'markdown',
};

const FORMAT_EXTENSIONS: Record<DocumentFormat, string> = {
  markdown: 'md',
  neorg: 'norg',
  org: 'org',
  json: 'json',
  canvas: 'json',
};

const MAX_RESCAN = 500;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toMs(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  if (typeof value === 'string') {
    const ms = new Date(value).getTime();
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

function extensionFromPath(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot === -1 ? 'md' : path.slice(dot + 1);
}

function typeFromDirectoryName(name: string): DocumentType | null {
  const entry = Object.entries(DOCUMENT_TYPE_DIRS).find(([, dir]) => dir === name);
  return entry ? (entry[0] as DocumentType) : null;
}

function normalizeTags(tags?: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim().toLowerCase().replace(/^#/, '');
    if (tag.length === 0 || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

/** Slug generation adapted from main's `editorShared.slugifyLocal`. */
export function slugify(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  );
}

export function documentsRoot(): Directory {
  return new Directory(Paths.document, DOCUMENTS_DIR_NAME);
}

export function directoryForType(type: DocumentType): Directory {
  return new Directory(Paths.document, DOCUMENTS_DIR_NAME, DOCUMENT_TYPE_DIRS[type]);
}

export function relativePathFor(type: DocumentType, slug: string, ext: string): string {
  return `${DOCUMENT_TYPE_DIRS[type]}/${slug}.${ext}`;
}

export function fileFor(type: DocumentType, slug: string, ext: string): File {
  return new File(Paths.document, DOCUMENTS_DIR_NAME, DOCUMENT_TYPE_DIRS[type], `${slug}.${ext}`);
}

export function extensionForFormat(format?: string): string {
  if (!format) {
    return 'md';
  }
  const known = FORMAT_EXTENSIONS[format as DocumentFormat];
  if (known) {
    return known;
  }
  return format.replace(/^\./, '');
}

const KNOWN_FRONTMATTER_KEYS = new Set([
  'id',
  'title',
  'type',
  'tags',
  'folder',
  'isPinned',
  'color',
  'createdAt',
  'updatedAt',
]);

function buildFrontmatter(
  meta: DocumentMeta,
  extra?: DocumentFrontmatter,
): Record<string, unknown> {
  const fields: Record<string, unknown> = {
    id: meta.id,
    title: meta.title,
    type: meta.type,
    tags: meta.tags,
    isPinned: meta.isPinned,
    createdAt: new Date(meta.createdAt).toISOString(),
    updatedAt: new Date(meta.updatedAt).toISOString(),
  };
  if (meta.folder) {
    fields.folder = meta.folder;
  }
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value === undefined || KNOWN_FRONTMATTER_KEYS.has(key)) {
        continue;
      }
      fields[key] = value;
    }
  }
  return fields;
}

function buildFileContent(meta: DocumentMeta, body: string, extra?: DocumentFrontmatter): string {
  const fm = serializeFrontmatter(buildFrontmatter(meta, extra));
  return `${fm}\n${body}`;
}

function writeFileContent(file: File, content: string): void {
  try {
    if (!file.exists) {
      file.parentDirectory.create({ intermediates: true, idempotent: true });
      file.create({ intermediates: true, overwrite: false });
    }
    file.write(content);
  } catch (error) {
    throw new DocumentError('IO_ERROR', `Failed to write ${file.uri}: ${errorMessage(error)}`);
  }
}

async function readRawFile(file: File): Promise<string | null> {
  try {
    if (!file.exists) {
      return null;
    }
    return await file.text();
  } catch {
    return null;
  }
}

function collectFiles(directory: Directory): File[] {
  const out: File[] = [];
  if (!directory.exists) {
    return out;
  }
  try {
    for (const entry of directory.list()) {
      if (entry instanceof Directory) {
        out.push(...collectFiles(entry));
      } else {
        out.push(entry);
      }
    }
  } catch {
    // unreadable directory entries are skipped
  }
  return out;
}

export class DocumentService {
  readonly index: DocumentIndex;

  constructor(index?: DocumentIndex) {
    this.index = index ?? new DocumentIndex();
  }

  // ------------------------------------------------------------------- CRUD

  async create(input: DocumentCreateInput): Promise<Document> {
    if (!isDocumentType(input.type)) {
      throw new DocumentError(
        'INVALID_TYPE',
        `Unknown document type: ${String(input.type)}`,
      );
    }
    const type = input.type;
    const now = input.createdAt ?? Date.now();
    const id = generateId();
    const ext = extensionForFormat(input.format ?? DEFAULT_FORMAT[type]);
    const baseSlug = slugify(input.title);
    const slug = await this.ensureUniqueSlug(type, baseSlug);
    const tags = normalizeTags(input.tags);
    const meta: DocumentMeta = {
      id,
      type,
      path: relativePathFor(type, slug, ext),
      title: input.title.trim(),
      slug,
      folder: input.folder ?? null,
      tags,
      createdAt: now,
      updatedAt: now,
      isPinned: input.isPinned ?? false,
      deleted: false,
    };

    const body = input.body ?? '';
    const raw = buildFileContent(meta, body, input.extra);
    const dir = directoryForType(type);
    try {
      dir.create({ intermediates: true, idempotent: true });
    } catch (error) {
      throw new DocumentError(
        'IO_ERROR',
        `Failed to create documents directory for ${type}: ${errorMessage(error)}`,
      );
    }
    writeFileContent(fileFor(type, slug, ext), raw);
    await this.index.upsertDocument(meta);
    await this.index.syncTags(tags);
    const created: Document = { ...meta, body, raw };
    await reindexDocumentBacklinks(this, created);
    return created;
  }

  async read(id: string): Promise<Document | null> {
    const meta = await this.index.getDocumentMeta(id);
    if (!meta) {
      return null;
    }
    return this.readMeta(meta);
  }

  async readBySlug(type: DocumentType, slug: string): Promise<Document | null> {
    const meta = await this.index.getDocumentMetaBySlug(type, slug);
    if (!meta) {
      return null;
    }
    return this.readMeta(meta);
  }

  async readByPath(path: string): Promise<Document | null> {
    const meta = await this.index.getDocumentMetaByPath(path);
    if (!meta) {
      return null;
    }
    return this.readMeta(meta);
  }

  async update(id: string, input: DocumentUpdateInput): Promise<Document> {
    const meta = await this.index.getDocumentMeta(id);
    if (!meta) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', `No document with id "${id}"`);
    }

    const title = input.title !== undefined ? input.title.trim() : meta.title;
    const tags = input.tags !== undefined ? normalizeTags(input.tags) : meta.tags;
    const folder = input.folder !== undefined ? input.folder : meta.folder;
    const isPinned = input.isPinned !== undefined ? input.isPinned : meta.isPinned;
    const ext = input.format !== undefined ? extensionForFormat(input.format) : extensionFromPath(meta.path);
    const slug =
      input.title !== undefined ? await this.ensureUniqueSlug(meta.type, slugify(title), id) : meta.slug;
    const path = relativePathFor(meta.type, slug, ext);
    const updatedAt = input.preserveTimestamp ? meta.updatedAt : Date.now();

    const next: DocumentMeta = {
      id: meta.id,
      type: meta.type,
      path,
      title,
      slug,
      folder,
      tags,
      createdAt: meta.createdAt,
      updatedAt,
      isPinned,
      deleted: meta.deleted,
    };

    if (path !== meta.path) {
      const source = new File(documentsRoot(), meta.path);
      if (source.exists) {
        const targetDir = new File(documentsRoot(), path).parentDirectory;
        try {
          targetDir.create({ intermediates: true, idempotent: true });
          await source.move(new File(documentsRoot(), path));
        } catch (error) {
          throw new DocumentError(
            'IO_ERROR',
            `Failed to move ${meta.path} -> ${path}: ${errorMessage(error)}`,
          );
        }
      }
    }

    const file = new File(documentsRoot(), path);
    const existing = await readRawFile(file);
    let existingBody = '';
    const preservedExtra: DocumentFrontmatter = {};
    if (existing !== null) {
      const parsed = parseFrontmatter(existing);
      existingBody = parsed.body;
      Object.assign(preservedExtra, parsed.frontmatter);
    }
    const body = input.body !== undefined ? input.body : existingBody;
    const extra = { ...preservedExtra, ...(input.extra ?? {}) };
    const raw = buildFileContent(next, body, extra);
    writeFileContent(file, raw);

    await this.index.upsertDocument(next);
    await this.index.syncTags(tags);
    const updated: Document = { ...next, body, raw };
    await reindexDocumentBacklinks(this, updated);
    return updated;
  }

  /** Soft-delete: flags the index row (file is kept for trash/restore). */
  async delete(id: string): Promise<void> {
    const meta = await this.index.getDocumentMeta(id);
    if (!meta) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', `No document with id "${id}"`);
    }
    await this.index.softDelete(id, true);
  }

  async restore(id: string): Promise<void> {
    const meta = await this.index.getDocumentMeta(id);
    if (!meta) {
      throw new DocumentError('DOCUMENT_NOT_FOUND', `No document with id "${id}"`);
    }
    await this.index.softDelete(id, false);
  }

  /** Permanent delete: removes the file AND the index row (incl. backlinks). */
  async purge(id: string): Promise<void> {
    const meta = await this.index.getDocumentMeta(id);
    if (!meta) {
      return;
    }
    const file = new File(documentsRoot(), meta.path);
    if (file.exists) {
      try {
        file.delete();
      } catch {
        // best-effort; the index row removal is authoritative
      }
    }
    await this.index.removeDocument(id);
  }

  // --------------------------------------------------------------- querying

  async list(options: DocumentListOptions = {}): Promise<DocumentMeta[]> {
    return this.index.listDocuments(options);
  }

  async find(idOrPath: string): Promise<Document | null> {
    const meta =
      (await this.index.getDocumentMeta(idOrPath)) ??
      (await this.index.getDocumentMetaByPath(idOrPath));
    if (!meta) {
      return null;
    }
    return this.readMeta(meta);
  }

  async search(query: string, options: SearchOptions = {}): Promise<DocumentMeta[]> {
    const needle = query.trim();
    if (needle.length === 0) {
      return [];
    }
    const limit = options.limit ?? 50;
    const metas = await this.index.searchIndex(needle, {
      type: options.type,
      includeDeleted: options.includeDeleted,
      limit,
    });
    if (options.includeBody === false) {
      return metas;
    }
    const results = new Map<string, DocumentMeta>();
    for (const meta of metas) {
      results.set(meta.id, meta);
    }
    const scan = await this.index.listDocuments({
      type: options.type,
      includeDeleted: options.includeDeleted,
      limit: MAX_RESCAN,
    });
    for (const meta of scan) {
      if (results.has(meta.id)) {
        continue;
      }
      const raw = await readRawFile(new File(documentsRoot(), meta.path));
      if (raw !== null && raw.includes(needle)) {
        results.set(meta.id, meta);
      }
    }
    return [...results.values()]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  /**
   * Rebuilds/repairs the index from the files on disk — the canonical
   * "files are the source of truth" operation. Returns the number of files
   * indexed.
   */
  async reconcile(type?: DocumentType): Promise<number> {
    const directories =
      type !== undefined && type !== null
        ? [directoryForType(type)]
        : DOCUMENT_TYPES.map((t) => directoryForType(t));
    let count = 0;
    for (const dir of directories) {
      if (!dir.exists) {
        continue;
      }
      for (const file of collectFiles(dir)) {
        const meta = await this.metaFromFile(file);
        if (meta === null) {
          continue;
        }
        await this.index.upsertDocument(meta);
        count += 1;
      }
    }
    return count;
  }

  // ----------------------------------------------------------------- folders

  async createFolder(name: string, parent: string | null = null): Promise<FolderRow> {
    const folderName = name.trim();
    if (folderName.length === 0) {
      throw new DocumentError('INVALID_SLUG', 'Folder name cannot be empty');
    }
    return this.index.createFolder(folderName, parent);
  }

  async listFolders(): Promise<FolderRow[]> {
    return this.index.listFolders();
  }

  async renameFolder(oldName: string, newName: string): Promise<void> {
    const trimmed = newName.trim();
    if (trimmed.length === 0) {
      throw new DocumentError('INVALID_SLUG', 'Folder name cannot be empty');
    }
    await this.index.renameFolder(oldName, trimmed);
  }

  async deleteFolder(name: string): Promise<void> {
    await this.index.deleteFolder(name);
  }

  async documentsInFolder(name: string): Promise<DocumentMeta[]> {
    return this.index.listDocuments({ folder: name });
  }

  // -------------------------------------------------------------------- tags

  async listTags(): Promise<TagRow[]> {
    return this.index.listTags();
  }

  async documentsByTag(tag: string): Promise<DocumentMeta[]> {
    return this.index.documentsByTag(tag);
  }

  // ---------------------------------------------------------------- backlinks

  async addBacklink(sourceId: string, targetSlug: string): Promise<void> {
    await this.index.addBacklink(sourceId, targetSlug);
  }

  async listBacklinksFor(targetSlug: string): Promise<BacklinkRow[]> {
    return this.index.listBacklinksFor(targetSlug);
  }

  async removeBacklinksFor(sourceId: string): Promise<void> {
    await this.index.removeBacklinksFor(sourceId);
  }

  // ----------------------------------------------------------------- helpers

  private async ensureUniqueSlug(
    type: DocumentType,
    baseSlug: string,
    excludeId?: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let counter = 2;
    while (await this.index.documentExistsBySlug(type, candidate, excludeId)) {
      candidate = `${baseSlug}-${counter}`;
      counter += 1;
    }
    return candidate;
  }

  private async readMeta(meta: DocumentMeta): Promise<Document | null> {
    const raw = await readRawFile(new File(documentsRoot(), meta.path));
    if (raw === null) {
      return null;
    }
    const { frontmatter } = parseFrontmatter(raw);
    const fm = frontmatter as DocumentFrontmatter;
    const id = typeof fm.id === 'string' ? fm.id : meta.id;
    const title = typeof fm.title === 'string' ? fm.title : meta.title;
    const tags = Array.isArray(fm.tags)
      ? fm.tags.filter((tag): tag is string => typeof tag === 'string')
      : meta.tags;
    const folder = typeof fm.folder === 'string' ? fm.folder : meta.folder;
    const isPinned = typeof fm.isPinned === 'boolean' ? fm.isPinned : meta.isPinned;
    const createdAt = toMs(fm.createdAt) ?? meta.createdAt;
    const updatedAt = toMs(fm.updatedAt) ?? (fileModifiedAt(meta.path) ?? meta.updatedAt);

    return {
      ...meta,
      id,
      title,
      tags,
      folder,
      isPinned,
      createdAt,
      updatedAt,
      body: parseFrontmatter(raw).body,
      raw,
    };
  }

  private async metaFromFile(file: File): Promise<DocumentMeta | null> {
    const type = typeFromDirectoryName(file.parentDirectory.name);
    if (type === null) {
      return null;
    }
    const raw = await readRawFile(file);
    if (raw === null) {
      return null;
    }
    const { frontmatter } = parseFrontmatter(raw);
    const fm = frontmatter as DocumentFrontmatter;
    const slug = file.name.replace(/\.[^.]*$/, '');
    const ext = extensionFromPath(file.name);
    const now = Date.now();
    const createdAt = toMs(fm.createdAt) ?? now;
    const updatedAt = toMs(fm.updatedAt) ?? (file.lastModified ?? now);
    return {
      id: typeof fm.id === 'string' ? fm.id : generateId(),
      type,
      path: relativePathFor(type, slug, ext),
      title: typeof fm.title === 'string' ? fm.title : slug,
      slug,
      folder: typeof fm.folder === 'string' ? fm.folder : null,
      tags: Array.isArray(fm.tags)
        ? fm.tags.filter((tag): tag is string => typeof tag === 'string')
        : [],
      createdAt,
      updatedAt,
      isPinned: fm.isPinned === true,
      deleted: false,
    };
  }
}

function fileModifiedAt(path: string): number | null {
  try {
    return new File(documentsRoot(), path).lastModified;
  } catch {
    return null;
  }
}
