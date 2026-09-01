/**
 * SQLite metadata index for the local-first document model.
 *
 * This database mirrors the frontmatter metadata of the document FILES on disk
 * (`Paths.document/documents/<type>/<slug>.<ext>`). It NEVER stores document
 * bodies — the files are the source of truth. The index exists so listing,
 * searching, folders, tags and backlinks can be answered without reading every
 * file body.
 */

import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type {
  BacklinkRow,
  DocumentListOptions,
  DocumentMeta,
  DocumentType,
  FolderRow,
  TagRow,
} from '@/models/Document';

const DB_NAME = 'gitnotes.db';
const MAX_LIMIT = 500;

const SCHEMA = `
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL DEFAULT '',
    slug TEXT NOT NULL,
    folder TEXT,
    tags TEXT NOT NULL DEFAULT '[]',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    isPinned INTEGER NOT NULL DEFAULT 0,
    deleted INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_documents_type ON documents(type);
  CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
  CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents(slug);
  CREATE INDEX IF NOT EXISTS idx_documents_deleted ON documents(deleted);

  CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    parent TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS backlinks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sourceId TEXT NOT NULL,
    targetSlug TEXT NOT NULL,
    createdAt INTEGER NOT NULL,
    UNIQUE(sourceId, targetSlug)
  );
  CREATE INDEX IF NOT EXISTS idx_backlinks_target ON backlinks(targetSlug);

  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY NOT NULL,
    entityType TEXT NOT NULL,
    entityLabel TEXT NOT NULL,
    noteId TEXT,
    folderPath TEXT,
    tag TEXT,
    time TEXT NOT NULL,
    repeat TEXT NOT NULL DEFAULT 'weekly',
    daysOfWeek TEXT NOT NULL DEFAULT '[]',
    isEnabled INTEGER NOT NULL DEFAULT 1,
    notificationId TEXT,
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_enabled ON reminders(isEnabled);

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    provider TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    createdAt INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS repos (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    remoteUrl TEXT NOT NULL,
    localPath TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL,
    accountId TEXT,
    createdAt INTEGER NOT NULL,
    lastSyncedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_repos_account ON repos(accountId);

  CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );
`;

interface DocumentRow {
  id: string;
  type: string;
  path: string;
  title: string;
  slug: string;
  folder: string | null;
  tags: string;
  createdAt: number;
  updatedAt: number;
  isPinned: number;
  deleted: number;
}

interface FolderRowRaw {
  id: number;
  name: string;
  parent: string | null;
  createdAt: number;
}

interface TagRowRaw {
  id: number;
  name: string;
  createdAt: number;
}

interface BacklinkRowRaw {
  sourceId: string;
  targetSlug: string;
  createdAt: number;
}

export interface AccountRow {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  createdAt: number;
}

interface AccountRowRaw {
  id: string;
  provider: string;
  name: string;
  email: string | null;
  createdAt: number;
}

function accountRowToMeta(row: AccountRowRaw): AccountRow {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    email: row.email,
    createdAt: row.createdAt,
  };
}

export interface RepoRow {
  id: string;
  name: string;
  remoteUrl: string;
  localPath: string;
  provider: string;
  accountId: string | null;
  createdAt: number;
  lastSyncedAt: number | null;
}

interface RepoRowRaw {
  id: string;
  name: string;
  remoteUrl: string;
  localPath: string;
  provider: string;
  accountId: string | null;
  createdAt: number;
  lastSyncedAt: number | null;
}

function isDocumentType(value: string): value is DocumentType {
  return ['note', 'todo', 'thought-dump', 'template', 'journal', 'canvas', 'ai'].includes(value);
}

function rowToMeta(row: DocumentRow): DocumentMeta {
  let tags: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.tags);
    if (Array.isArray(parsed)) {
      tags = parsed.filter((tag): tag is string => typeof tag === 'string');
    }
  } catch {
    tags = [];
  }

  return {
    id: row.id,
    type: isDocumentType(row.type) ? row.type : 'note',
    path: row.path,
    title: row.title,
    slug: row.slug,
    folder: row.folder,
    tags,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    isPinned: row.isPinned === 1,
    deleted: row.deleted === 1,
  };
}

function metaToParams(meta: DocumentMeta): Array<string | number | null> {
  return [
    meta.id,
    meta.type,
    meta.path,
    meta.title,
    meta.slug,
    meta.folder,
    JSON.stringify(meta.tags),
    meta.createdAt,
    meta.updatedAt,
    meta.isPinned ? 1 : 0,
    meta.deleted ? 1 : 0,
  ];
}

let dbPromise: Promise<SQLiteDatabase> | null = null;

/**
 * Returns the singleton metadata database connection (opened lazily).
 * Safe to call from multiple consumers; the same promise is shared.
 */
export function getDocumentDb(): Promise<SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openDatabaseAsync(DB_NAME).then(async (db) => {
      await db.execAsync(SCHEMA);
      return db;
    });
    // Reset the cached promise so a transient open failure can be retried.
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

export class DocumentIndex {
  async withDb<T>(fn: (db: SQLiteDatabase) => Promise<T>): Promise<T> {
    const db = await getDocumentDb();
    return fn(db);
  }

  // ------------------------------------------------------------------ upsert

  async upsertDocument(meta: DocumentMeta): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        `INSERT INTO documents
           (id, type, path, title, slug, folder, tags, createdAt, updatedAt, isPinned, deleted)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           type = excluded.type,
           path = excluded.path,
           title = excluded.title,
           slug = excluded.slug,
           folder = excluded.folder,
           tags = excluded.tags,
           createdAt = excluded.createdAt,
           updatedAt = excluded.updatedAt,
           isPinned = excluded.isPinned,
           deleted = excluded.deleted`,
        metaToParams(meta),
      );
    });
  }

  // ------------------------------------------------------------------- reads

  async getDocumentMeta(id: string): Promise<DocumentMeta | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<DocumentRow>(
        'SELECT * FROM documents WHERE id = ? LIMIT 1',
        id,
      );
      return row ? rowToMeta(row) : null;
    });
  }

  async getDocumentMetaByPath(path: string): Promise<DocumentMeta | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<DocumentRow>(
        'SELECT * FROM documents WHERE path = ? LIMIT 1',
        path,
      );
      return row ? rowToMeta(row) : null;
    });
  }

  async listDocuments(options: DocumentListOptions = {}): Promise<DocumentMeta[]> {
    const where: string[] = [];
    const params: Array<string | number | null> = [];

    if (!options.includeDeleted) {
      where.push('deleted = 0');
    }
    if (options.type) {
      where.push('type = ?');
      params.push(options.type);
    }
    if (options.folder !== undefined) {
      if (options.folder === null) {
        where.push('folder IS NULL');
      } else {
        where.push('folder = ?');
        params.push(options.folder);
      }
    }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const limit = Math.max(1, Math.min(options.limit ?? MAX_LIMIT, MAX_LIMIT));

    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<DocumentRow>(
        `SELECT * FROM documents ${clause} ORDER BY updatedAt DESC LIMIT ?`,
        ...params,
        limit,
      );
      return rows.map(rowToMeta);
    });
  }

  async searchIndex(query: string, options: DocumentListOptions = {}): Promise<DocumentMeta[]> {
    const needle = `%${query}%`;
    const where: string[] = [
      'deleted = 0',
      '(title LIKE ? OR slug LIKE ? OR tags LIKE ?)',
    ];
    const params: Array<string | number | null> = [needle, needle, needle];

    if (options.type) {
      where.push('type = ?');
      params.push(options.type);
    }
    if (options.folder !== undefined) {
      where.push('folder = ?');
      params.push(options.folder);
    }

    const limit = Math.max(1, Math.min(options.limit ?? MAX_LIMIT, MAX_LIMIT));
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<DocumentRow>(
        `SELECT * FROM documents WHERE ${where.join(' AND ')} ORDER BY updatedAt DESC LIMIT ?`,
        ...params,
        limit,
      );
      return rows.map(rowToMeta);
    });
  }

  async getDocumentMetaBySlug(type: DocumentType, slug: string): Promise<DocumentMeta | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<DocumentRow>(
        'SELECT * FROM documents WHERE type = ? AND slug = ? ORDER BY deleted ASC LIMIT 1',
        type,
        slug,
      );
      return row ? rowToMeta(row) : null;
    });
  }

  async documentExistsBySlug(
    type: DocumentType,
    slug: string,
    excludeId?: string,
  ): Promise<boolean> {
    return this.withDb(async (db) => {
      const params: Array<string> = [type, slug];
      let sql = 'SELECT id FROM documents WHERE type = ? AND slug = ? AND deleted = 0';
      if (excludeId) {
        sql += ' AND id != ?';
        params.push(excludeId);
      }
      sql += ' LIMIT 1';
      const row = await db.getFirstAsync<{ id: string }>(sql, ...params);
      return row !== null;
    });
  }

  async allPaths(): Promise<Array<{ id: string; path: string }>> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<{ id: string; path: string }>(
        'SELECT id, path FROM documents',
      );
      return rows;
    });
  }

  // -------------------------------------------------------------- lifecycle

  async softDelete(id: string, deleted: boolean): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('UPDATE documents SET deleted = ? WHERE id = ?', deleted ? 1 : 0, id);
    });
  }

  async touch(id: string, updatedAt: number): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('UPDATE documents SET updatedAt = ? WHERE id = ?', updatedAt, id);
    });
  }

  async removeDocument(id: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync('DELETE FROM documents WHERE id = ?', id);
        await txn.runAsync('DELETE FROM backlinks WHERE sourceId = ?', id);
      });
    });
  }

  async countDocuments(includeDeleted = false): Promise<number> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<{ n: number }>(
        includeDeleted
          ? 'SELECT COUNT(*) AS n FROM documents'
          : 'SELECT COUNT(*) AS n FROM documents WHERE deleted = 0',
      );
      return row?.n ?? 0;
    });
  }

  // ----------------------------------------------------------------- folders

  async createFolder(name: string, parent: string | null = null): Promise<FolderRow> {
    return this.withDb(async (db) => {
      const existing = await db.getFirstAsync<FolderRowRaw>(
        'SELECT * FROM folders WHERE name = ? LIMIT 1',
        name,
      );
      if (existing) {
        return { id: existing.id, name: existing.name, parent: existing.parent, createdAt: existing.createdAt };
      }
      const result = await db.runAsync(
        'INSERT INTO folders (name, parent, createdAt) VALUES (?, ?, ?)',
        name,
        parent,
        Date.now(),
      );      return { id: result.lastInsertRowId, name, parent, createdAt: Date.now() };
    });
  }

  async listFolders(): Promise<FolderRow[]> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<FolderRowRaw>(
        'SELECT * FROM folders ORDER BY name COLLATE NOCASE ASC',
      );
      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        parent: row.parent,
        createdAt: row.createdAt,
      }));
    });
  }

  async renameFolder(oldName: string, newName: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync('UPDATE folders SET name = ? WHERE name = ?', newName, oldName);
        await txn.runAsync('UPDATE documents SET folder = ? WHERE folder = ?', newName, oldName);
      });
    });
  }

  async deleteFolder(name: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        await txn.runAsync('DELETE FROM folders WHERE name = ?', name);
        // Documents in a deleted folder return to the root (no orphan rows).
        await txn.runAsync('UPDATE documents SET folder = NULL WHERE folder = ?', name);
      });
    });
  }

  // -------------------------------------------------------------------- tags

  async listTags(): Promise<TagRow[]> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<TagRowRaw>(
        'SELECT * FROM tags ORDER BY name COLLATE NOCASE ASC',
      );
      return rows.map((row) => ({ id: row.id, name: row.name, createdAt: row.createdAt }));
    });
  }

  async documentsByTag(tag: string): Promise<DocumentMeta[]> {
    const needle = `%"${tag}"%`;
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<DocumentRow>(
        'SELECT * FROM documents WHERE deleted = 0 AND tags LIKE ? ORDER BY updatedAt DESC',
        needle,
      );
      return rows.map(rowToMeta);
    });
  }

  /** Keeps the tags table in sync with a document's current tag set. */
  async syncTags(tags: string[]): Promise<void> {
    await this.withDb(async (db) => {
      await db.withExclusiveTransactionAsync(async (txn) => {
        for (const tag of tags) {
          await txn.runAsync(
            'INSERT OR IGNORE INTO tags (name, createdAt) VALUES (?, ?)',
            tag,
            Date.now(),
          );
        }
        await txn.runAsync(
          `DELETE FROM tags WHERE name NOT IN (
            SELECT DISTINCT json_each.value FROM documents, json_each(documents.tags)
            WHERE deleted = 0
          ) AND name NOT IN (
            SELECT DISTINCT json_each.value FROM documents, json_each(documents.tags)
            WHERE deleted = 1
          )`,
        );
      });
    });
  }

  // ---------------------------------------------------------------- backlinks

  async addBacklink(sourceId: string, targetSlug: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        'INSERT OR IGNORE INTO backlinks (sourceId, targetSlug, createdAt) VALUES (?, ?, ?)',
        sourceId,
        targetSlug,
        Date.now(),
      );
    });
  }

  async removeBacklinksFor(sourceId: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('DELETE FROM backlinks WHERE sourceId = ?', sourceId);
    });
  }

  async listBacklinksFor(targetSlug: string): Promise<BacklinkRow[]> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<BacklinkRowRaw>(
        'SELECT sourceId, targetSlug, createdAt FROM backlinks WHERE targetSlug = ? ORDER BY createdAt DESC',
        targetSlug,
      );
      return rows.map((row) => ({
        sourceId: row.sourceId,
        targetSlug: row.targetSlug,
        createdAt: row.createdAt,
      }));
    });
  }

  async backlinkCount(): Promise<number> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM backlinks');
      return row?.n ?? 0;
    });
  }

  // ---------------------------------------------------------------- reminders

  async upsertReminder(
    r: {
      id: string;
      entityType: string;
      entityLabel: string;
      noteId?: string | null;
      folderPath?: string | null;
      tag?: string | null;
      time: string;
      repeat: string;
      daysOfWeek: string[];
      isEnabled: boolean;
      notificationId?: string | null;
      createdAt: number;
      updatedAt: number;
    },
  ): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        `INSERT INTO reminders
           (id, entityType, entityLabel, noteId, folderPath, tag, time, repeat, daysOfWeek, isEnabled, notificationId, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           entityType = excluded.entityType,
           entityLabel = excluded.entityLabel,
           noteId = excluded.noteId,
           folderPath = excluded.folderPath,
           tag = excluded.tag,
           time = excluded.time,
           repeat = excluded.repeat,
           daysOfWeek = excluded.daysOfWeek,
           isEnabled = excluded.isEnabled,
           notificationId = excluded.notificationId,
           updatedAt = excluded.updatedAt`,
        [
          r.id,
          r.entityType,
          r.entityLabel,
          r.noteId ?? null,
          r.folderPath ?? null,
          r.tag ?? null,
          r.time,
          r.repeat,
          JSON.stringify(r.daysOfWeek),
          r.isEnabled ? 1 : 0,
          r.notificationId ?? null,
          r.createdAt,
          r.updatedAt,
        ],
      );
    });
  }

  async listReminders(): Promise<
    Array<{
      id: string;
      entityType: string;
      entityLabel: string;
      noteId: string | null;
      folderPath: string | null;
      tag: string | null;
      time: string;
      repeat: string;
      daysOfWeek: string[];
      isEnabled: boolean;
      notificationId: string | null;
      createdAt: number;
      updatedAt: number;
    }>
  > {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<{
        id: string;
        entityType: string;
        entityLabel: string;
        noteId: string | null;
        folderPath: string | null;
        tag: string | null;
        time: string;
        repeat: string;
        daysOfWeek: string;
        isEnabled: number;
        notificationId: string | null;
        createdAt: number;
        updatedAt: number;
      }>('SELECT * FROM reminders ORDER BY createdAt DESC');
      return rows.map((row) => {
        let daysOfWeek: string[] = [];
        try {
          const parsed: unknown = JSON.parse(row.daysOfWeek);
          if (Array.isArray(parsed)) {
            daysOfWeek = parsed.filter((d): d is string => typeof d === 'string');
          }
        } catch {
          daysOfWeek = [];
        }
        return {
          id: row.id,
          entityType: row.entityType,
          entityLabel: row.entityLabel,
          noteId: row.noteId,
          folderPath: row.folderPath,
          tag: row.tag,
          time: row.time,
          repeat: row.repeat,
          daysOfWeek,
          isEnabled: row.isEnabled === 1,
          notificationId: row.notificationId,
          createdAt: row.createdAt,
          updatedAt: row.updatedAt,
        };
      });
    });
  }

  async getReminder(id: string): Promise<{
    id: string;
    entityType: string;
    entityLabel: string;
    noteId: string | null;
    folderPath: string | null;
    tag: string | null;
    time: string;
    repeat: string;
    daysOfWeek: string[];
    isEnabled: boolean;
    notificationId: string | null;
    createdAt: number;
    updatedAt: number;
  } | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<{
        id: string;
        entityType: string;
        entityLabel: string;
        noteId: string | null;
        folderPath: string | null;
        tag: string | null;
        time: string;
        repeat: string;
        daysOfWeek: string;
        isEnabled: number;
        notificationId: string | null;
        createdAt: number;
        updatedAt: number;
      }>('SELECT * FROM reminders WHERE id = ? LIMIT 1', id);
      if (!row) return null;
      let daysOfWeek: string[] = [];
      try {
        const parsed: unknown = JSON.parse(row.daysOfWeek);
        if (Array.isArray(parsed)) {
          daysOfWeek = parsed.filter((d): d is string => typeof d === 'string');
        }
      } catch {
        daysOfWeek = [];
      }
      return {
        id: row.id,
        entityType: row.entityType,
        entityLabel: row.entityLabel,
        noteId: row.noteId,
        folderPath: row.folderPath,
        tag: row.tag,
        time: row.time,
        repeat: row.repeat,
        daysOfWeek,
        isEnabled: row.isEnabled === 1,
        notificationId: row.notificationId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    });
  }

  async deleteReminder(id: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('DELETE FROM reminders WHERE id = ?', id);
    });
  }

  // ----------------------------------------------------------------- accounts

  async listAccounts(): Promise<AccountRow[]> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<AccountRowRaw>(
        'SELECT * FROM accounts ORDER BY createdAt ASC',
      );
      return rows.map(accountRowToMeta);
    });
  }

  async getAccountById(id: string): Promise<AccountRow | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<AccountRowRaw>(
        'SELECT * FROM accounts WHERE id = ? LIMIT 1',
        id,
      );
      return row ? accountRowToMeta(row) : null;
    });
  }

  async insertAccount(account: AccountRow): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        `INSERT INTO accounts (id, provider, name, email, createdAt)
         VALUES (?, ?, ?, ?, ?)`,
        [account.id, account.provider, account.name, account.email, account.createdAt],
      );
    });
  }

  async updateAccountName(id: string, name: string, email: string | null): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('UPDATE accounts SET name = ?, email = ? WHERE id = ?', name, email, id);
    });
  }

  async deleteAccountById(id: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('DELETE FROM accounts WHERE id = ?', id);
    });
  }

  // ------------------------------------------------------------------- repos

  async listRepos(): Promise<RepoRow[]> {
    return this.withDb(async (db) => {
      const rows = await db.getAllAsync<RepoRowRaw>(
        'SELECT * FROM repos ORDER BY createdAt ASC',
      );
      return rows;
    });
  }

  async getRepoById(id: string): Promise<RepoRow | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<RepoRowRaw>(
        'SELECT * FROM repos WHERE id = ? LIMIT 1',
        id,
      );
      return row ?? null;
    });
  }

  async insertRepo(repo: RepoRow): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        `INSERT INTO repos (id, name, remoteUrl, localPath, provider, accountId, createdAt, lastSyncedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          repo.id,
          repo.name,
          repo.remoteUrl,
          repo.localPath,
          repo.provider,
          repo.accountId,
          repo.createdAt,
          repo.lastSyncedAt,
        ],
      );
    });
  }

  async updateRepoLastSynced(id: string, lastSyncedAt: number): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('UPDATE repos SET lastSyncedAt = ? WHERE id = ?', lastSyncedAt, id);
    });
  }

  async deleteRepoById(id: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('DELETE FROM repos WHERE id = ?', id);
    });
  }

  // ------------------------------------------------------------ app metadata

  async getMeta(key: string): Promise<string | null> {
    return this.withDb(async (db) => {
      const row = await db.getFirstAsync<{ value: string }>(
        'SELECT value FROM app_meta WHERE key = ? LIMIT 1',
        key,
      );
      return row?.value ?? null;
    });
  }

  async setMeta(key: string, value: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync(
        'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        key,
        value,
      );
    });
  }

  async deleteMeta(key: string): Promise<void> {
    await this.withDb(async (db) => {
      await db.runAsync('DELETE FROM app_meta WHERE key = ?', key);
    });
  }
}
