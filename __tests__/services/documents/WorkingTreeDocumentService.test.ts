const mockFileWrite = jest.fn();
const mockFileExists = jest.fn();

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
}));

jest.mock('@/services/git/GitFsService', () => ({
  normalizeWorktreeRelPath: jest.fn((filepath: string) => {
    if (!filepath || filepath.includes('..') || filepath.startsWith('/')) {
      throw Object.assign(new Error(`Invalid worktree filepath: ${filepath}`), { code: 'NotFoundError' });
    }
    return filepath;
  }),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({
    exists: mockFileExists(),
    write: mockFileWrite,
  })),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  stage: jest.fn(),
  remove: jest.fn(),
  commit: jest.fn(),
  push: jest.fn(),
  isRepoOnBranch: jest.fn(),
}));

import * as GitEngine from '@/services/git/engine/GitEngine';
import type { Document } from '@/models/Document';

const { WorkingTreeDocumentService, workingTreeDocument, WriteError } = jest.requireActual('@/services/documents/WorkingTreeDocumentService');

// Override normalizeWorktreeRelPath to throw for invalid paths
const actualGitFs = jest.requireActual('@/services/git/GitFsService');
jest.spyOn(actualGitFs, 'normalizeWorktreeRelPath').mockImplementation((path: string) => {
  if (!path || path.includes('..') || path.startsWith('/')) {
    throw Object.assign(new Error(`Invalid worktree filepath: ${path}`), { code: 'NotFoundError' });
  }
  return path;
});

// Patch it onto the GitFsService module so WorkingTreeDocumentService uses it
jest.doMock('@/services/git/GitFsService', () => actualGitFs);

describe('WorkingTreeDocumentService', () => {
  const baseDoc: Document = {
    id: 'working-tree:notes/test.md',
    type: 'note',
    path: 'notes/test.md',
    title: 'test.md',
    slug: 'test.md',
    folder: null,
    tags: ['explore'],
    createdAt: 1000,
    updatedAt: 1000,
    isPinned: false,
    deleted: false,
    body: 'original content',
    raw: 'original content',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockFileExists.mockReturnValue(true);
    mockFileWrite.mockReturnValue(undefined);
  });

  describe('update - happy path', () => {
    it('writes Unicode content exactly to File.write', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      const content = 'Hello 世界 🌍\t\r\n';
      await service.update(baseDoc.id, { body: content });

      expect(mockFileWrite).toHaveBeenCalledWith(content);
    });

    it('writes tabs and CRLF unchanged', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      const content = 'line1\t\ttab\r\nline2\r\nline3\r\n';
      await service.update(baseDoc.id, { body: content });

      expect(mockFileWrite).toHaveBeenCalledWith(content);
    });

    it('writes empty string without error', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      await service.update(baseDoc.id, { body: '' });

      expect(mockFileWrite).toHaveBeenCalledWith('');
    });

    it('returns Document with correct body and updatedAt', async () => {
      const before = Date.now();
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      const result = await service.update(baseDoc.id, { body: 'new content' });
      const after = Date.now();

      expect(result.body).toBe('new content');
      expect(result.raw).toBe('new content');
      expect(result.updatedAt).toBeGreaterThanOrEqual(before);
      expect(result.updatedAt).toBeLessThanOrEqual(after);
    });
  });

  describe('update - path guards', () => {
    it('does not call File.write for ../traversal.txt path', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', '../traversal.txt', baseDoc);
      try {
        await service.update(baseDoc.id, { body: 'content' });
      } catch {
        // expected to throw
      }
      expect(mockFileWrite).not.toHaveBeenCalled();
    });

    it('does not call File.write for .. path segment', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/../notes/../etc/passwd', baseDoc);
      try {
        await service.update(baseDoc.id, { body: 'content' });
      } catch {
        // expected to throw
      }
      expect(mockFileWrite).not.toHaveBeenCalled();
    });

    it('does not call File.write for empty string path', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', '', baseDoc);
      try {
        await service.update(baseDoc.id, { body: 'content' });
      } catch {
        // expected to throw
      }
      expect(mockFileWrite).not.toHaveBeenCalled();
    });
  });

  describe('update - size guard', () => {
    it('does not call File.write when content exceeds 5 MiB', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      const largeContent = 'x'.repeat(5 * 1024 * 1024 + 1);

      try {
        await service.update(baseDoc.id, { body: largeContent });
      } catch {
        // expected to throw
      }
      expect(mockFileWrite).not.toHaveBeenCalled();
    });

    it('does not throw for content exactly at 5 MiB', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      const exactContent = 'x'.repeat(5 * 1024 * 1024);
      mockFileWrite.mockReturnValue(undefined);

      await expect(service.update(baseDoc.id, { body: exactContent })).resolves.toBeDefined();
      expect(mockFileWrite).toHaveBeenCalledWith(exactContent);
    });
  });

  describe('update - write rejection', () => {
    it('surfaces WriteError when File.write throws', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      mockFileWrite.mockImplementation(() => {
        throw new Error('disk full');
      });

      await expect(service.update(baseDoc.id, { body: 'new content' })).rejects.toThrow(WriteError);
    });

    it('WriteError message includes the underlying error', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      mockFileWrite.mockImplementation(() => {
        throw new Error('permission denied');
      });

      await expect(service.update(baseDoc.id, { body: 'new content' })).rejects.toThrow('permission denied');
    });
  });

  describe('no Git side effects', () => {
    it('does not call GitEngine.stage', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      await service.update(baseDoc.id, { body: 'content' });

      expect(GitEngine.stage).not.toHaveBeenCalled();
    });

    it('does not call GitEngine.remove', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      await service.update(baseDoc.id, { body: 'content' });

      expect(GitEngine.remove).not.toHaveBeenCalled();
    });

    it('does not call GitEngine.commit', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      await service.update(baseDoc.id, { body: 'content' });

      expect(GitEngine.commit).not.toHaveBeenCalled();
    });

    it('does not call GitEngine.push', async () => {
      const service = new WorkingTreeDocumentService('/repo/path', 'notes/test.md', baseDoc);
      await service.update(baseDoc.id, { body: 'content' });

      expect(GitEngine.push).not.toHaveBeenCalled();
    });
  });

  describe('workingTreeDocument', () => {
    it('creates a Document with working-tree id prefix', () => {
      const doc = workingTreeDocument('notes/hello.md', 'body content', 'explore');

      expect(doc.id).toBe('working-tree:notes/hello.md');
      expect(doc.body).toBe('body content');
      expect(doc.raw).toBe('body content');
      expect(doc.tags).toContain('explore');
    });
  });
});
