/**
 * DocumentIndexFts.test.ts
 *
 * Regression tests for SQLite FTS5 full-text search in DocumentIndex.
 *
 * Tests cover:
 * 1. FTS5 virtual table creation
 * 2. upsertFts stores data
 * 3. searchFts returns matching doc IDs
 */

import { openDatabaseAsync } from 'expo-sqlite';
import { DocumentIndex, getDocumentDb } from '@/services/documents/DocumentIndex';
import type { DocumentMeta } from '@/models/Document';

// Mock expo-sqlite
jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

const mockDb = {
  execAsync: jest.fn(),
  runAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  getAllAsync: jest.fn(),
  withExclusiveTransactionAsync: jest.fn(),
};

const mockOpenDatabaseAsync = openDatabaseAsync as jest.Mock;

describe('DocumentIndex FTS5', () => {
  let index: DocumentIndex;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockOpenDatabaseAsync.mockResolvedValue(mockDb);
    mockDb.execAsync.mockResolvedValue(undefined);
    mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1 });
    mockDb.getFirstAsync.mockResolvedValue({ rowid: 1 });
    mockDb.getAllAsync.mockResolvedValue([]);
    index = new DocumentIndex();
    // Initialize the database
    await getDocumentDb();
  });

  describe('FTS5 table creation', () => {
    it('creates FTS5 virtual table after main schema', async () => {
      // Verify the execAsync calls
      expect(mockDb.execAsync).toHaveBeenCalledTimes(2);
      // Second call should be the FTS5 creation
      expect(mockDb.execAsync).toHaveBeenLastCalledWith(
        `CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(title, body, tags, content=documents, content_rowid=rowid)`,
      );
    });
  });

  describe('upsertFts', () => {
    it('inserts FTS row with ON CONFLICT handling', async () => {
      await index.upsertFts(1, 'Test Title', 'Test body content', '["tag1"]');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        `INSERT INTO documents_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)
         ON CONFLICT(rowid) DO UPDATE SET title=excluded.title, body=excluded.body, tags=excluded.tags`,
        [1, 'Test Title', 'Test body content', '["tag1"]'],
      );
    });

    it('updates existing FTS row on conflict', async () => {
      // First insert
      await index.upsertFts(1, 'Original Title', 'Original body', '["tag1"]');
      // Second insert with same rowid should update
      await index.upsertFts(1, 'Updated Title', 'Updated body', '["tag2"]');

      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
      expect(mockDb.runAsync).toHaveBeenLastCalledWith(
        `INSERT INTO documents_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)
         ON CONFLICT(rowid) DO UPDATE SET title=excluded.title, body=excluded.body, tags=excluded.tags`,
        [1, 'Updated Title', 'Updated body', '["tag2"]'],
      );
    });
  });

  describe('searchFts', () => {
    it('returns empty array when no matches found', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([]) // MATCH query returns empty
      ;

      const result = await index.searchFts('nonexistent');

      expect(result).toEqual([]);
    });

    it('returns document IDs matching the query', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ rowid: 1 }, { rowid: 2 }]) // MATCH query returns rowids
        .mockResolvedValueOnce([{ id: 'doc-1' }, { id: 'doc-2' }]) // ID lookup
      ;

      const result = await index.searchFts('test query');

      expect(result).toEqual(['doc-1', 'doc-2']);
      // Verify the MATCH query escaped quotes properly
      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        `SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?`,
        ['"test query"'],
      );
    });

    it('escapes double quotes in query string', async () => {
      mockDb.getAllAsync
        .mockResolvedValueOnce([])
      ;

      await index.searchFts('test "quoted" term');

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        `SELECT rowid FROM documents_fts WHERE documents_fts MATCH ?`,
        ['"test ""quoted"" term"'],
      );
    });
  });

  describe('upsertDocument with body', () => {
    const mockMeta: DocumentMeta = {
      id: 'doc-123',
      type: 'note',
      path: 'notes/test.md',
      title: 'Test Note',
      slug: 'test',
      folder: null,
      tags: ['test'],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPinned: false,
      deleted: false,
    };

    beforeEach(() => {
      mockDb.getFirstAsync.mockResolvedValue({ rowid: 99 });
    });

    it('indexes body content when body is provided', async () => {
      await index.upsertDocument(mockMeta, 'This is the note body content');

      // Should have called runAsync twice: once for documents table, once for FTS
      expect(mockDb.runAsync).toHaveBeenCalledTimes(2);
      // Second call should be the FTS upsert
      expect(mockDb.runAsync).toHaveBeenLastCalledWith(
        `INSERT INTO documents_fts(rowid, title, body, tags) VALUES (?, ?, ?, ?)
         ON CONFLICT(rowid) DO UPDATE SET title=excluded.title, body=excluded.body, tags=excluded.tags`,
        [99, 'Test Note', 'This is the note body content', '["test"]'],
      );
    });

    it('does not index FTS when body is undefined', async () => {
      await index.upsertDocument(mockMeta);

      // Should only call runAsync once (for documents table)
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });

    it('does not index FTS when body is null', async () => {
      await index.upsertDocument(mockMeta, null as unknown as string);

      // Should only call runAsync once (for documents table)
      expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    });
  });
});
