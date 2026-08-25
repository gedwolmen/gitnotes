jest.mock('isomorphic-git', () => {
  const mocks = {
    add: jest.fn(async (..._a: any[]) => undefined),
    remove: jest.fn(async (..._a: any[]) => undefined),
    commit: jest.fn(async (..._a: any[]) => 'commit-sha-1'),
    currentBranch: jest.fn(async (..._a: any[]) => 'main'),
    checkout: jest.fn(async (..._a: any[]) => undefined),
    fetch: jest.fn(async (..._a: any[]) => undefined),
    status: jest.fn(async (..._a: any[]) => 'modified'),
  };
  (globalThis as any).__csGitMocks = mocks;
  return {
    __esModule: true,
    default: mocks,
  };
});

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  const contentStore = new Map<string, string>();
  (globalThis as any).__csFsStore = fsStore;
  (globalThis as any).__csFsContent = contentStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri);
      if (e) return { exists: true, uri, isDirectory: e.type === 'dir' };
      if (contentStore.has(uri)) return { exists: true, uri, isDirectory: false };
      return { exists: false, uri };
    },
    readAsStringAsync: jest.fn(async (uri: string) => {
      const c = contentStore.get(uri);
      if (c === undefined) throw new Error(`ENOENT: ${uri}`);
      return c;
    }),
    writeAsStringAsync: jest.fn(async (uri: string, data?: string) => {
      fsStore.set(uri, { type: 'file' });
      if (typeof data === 'string') contentStore.set(uri, data);
    }),
    async deleteAsync(uri: string) {
      fsStore.delete(uri);
      contentStore.delete(uri);
    },
    async makeDirectoryAsync(uri: string) {
      fsStore.set(uri, { type: 'dir' });
    },
  };
});

jest.mock('../../../src/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      unlink: jest.fn(),
    },
  })),
}));

jest.mock('../../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
}));

jest.mock('../../../src/services/git/gitHostFactory');

jest.mock('../../../src/services/SyncEngineService');

jest.mock('../../../src/services/git/LocalGitWriter');

import { CommitService } from '../../../src/services/git/CommitService';
import { SyncEngineService } from '../../../src/services/SyncEngineService';
import { getGitHostService } from '../../../src/services/git/gitHostFactory';
import { LocalGitWriter } from '../../../src/services/git/LocalGitWriter';
import { useGitActivityStore } from '../../../src/stores/gitActivityStore';

function getFsStore() {
  return (globalThis as any).__csFsStore as Map<string, { type: 'file' | 'dir' }>;
}

function getFsContent() {
  return (globalThis as any).__csFsContent as Map<string, string>;
}

const author = { name: 'Test User', email: 'test@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore()?.clear();
  getFsContent()?.clear();
  useGitActivityStore.setState({ commitRevision: 0 });

  // Reset SyncEngineService mock
  (SyncEngineService.getMode as jest.Mock).mockReset();
  (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');

  // Reset LocalGitWriter mocks
  (LocalGitWriter.writeAndCommit as jest.Mock).mockReset();
  (LocalGitWriter.deleteAndCommit as jest.Mock).mockReset();

  // Set up getGitHostService mock
  const mockGetAuthenticatedUser = jest.fn();
  (getGitHostService as jest.Mock).mockReturnValue({
    getAuthenticatedUser: mockGetAuthenticatedUser,
  });
});

describe('CommitService', () => {
  describe('commit() — mode check', () => {
    test('rejects API-mode repo with appropriate error', async () => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        content: 'hello',
        message: 'Update note: foo',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Use NoteSyncQueueService for api mode');
    });

    test('proceeds for clone-mode repo', async () => {
      (LocalGitWriter.writeAndCommit as jest.Mock).mockResolvedValue({ success: true });
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        content: 'hello',
        message: 'Update note: foo',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('commit() — upsert (plain write)', () => {
    test('calls LocalGitWriter.writeAndCommit with correct params', async () => {
      (LocalGitWriter.writeAndCommit as jest.Mock).mockResolvedValue({ success: true });
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: '/notes/foo.md',
        content: '# Hello',
        message: 'Update note: foo',
        author,
      });
      expect(result.success).toBe(true);
      expect(LocalGitWriter.writeAndCommit).toHaveBeenCalledWith({
        repoPath: 'me/repo',
        branch: 'main',
        filePath: '/notes/foo.md',
        content: '# Hello',
        message: 'Update note: foo',
        author,
        push: false,
      });
      expect(useGitActivityStore.getState().commitRevision).toBe(0);
    });

    test('falls back to resolveStageAuthor when no author provided', async () => {
      const mockUser = { login: 'testuser', name: 'Test User', email: 'test@example.com' };
      (getGitHostService('github') as any).getAuthenticatedUser.mockResolvedValue(mockUser);
      (LocalGitWriter.writeAndCommit as jest.Mock).mockResolvedValue({ success: true });
      await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        content: 'hello',
        message: 'Update note: foo',
      });
      expect(LocalGitWriter.writeAndCommit).toHaveBeenCalledWith(
        expect.objectContaining({
          author: { name: 'Test User', email: 'test@example.com' },
        }),
      );
    });

    test('returns failure when LocalGitWriter.writeAndCommit fails', async () => {
      (LocalGitWriter.writeAndCommit as jest.Mock).mockResolvedValue({
        success: false,
        error: 'clone corruption',
      });
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        content: 'hello',
        message: 'Update note: foo',
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('clone corruption');
    });
  });

  describe('commit() — delete', () => {
    test('calls LocalGitWriter.deleteAndCommit with delete:true', async () => {
      (LocalGitWriter.deleteAndCommit as jest.Mock).mockResolvedValue({ success: true });
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        content: '',
        message: 'Delete note: foo',
        delete: true,
        author,
      });
      expect(result.success).toBe(true);
      expect(LocalGitWriter.deleteAndCommit).toHaveBeenCalledWith({
        repoPath: 'me/repo',
        branch: 'main',
        filePath: 'notes/foo.md',
        message: 'Delete note: foo',
        author,
        push: false,
      });
      expect(useGitActivityStore.getState().commitRevision).toBe(0);
    });

    test('returns failure when LocalGitWriter.deleteAndCommit fails', async () => {
      (LocalGitWriter.deleteAndCommit as jest.Mock).mockResolvedValue({
        success: false,
        error: 'file not found',
      });
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: 'notes/nonexistent.md',
        content: '',
        message: 'Delete note: nonexistent',
        delete: true,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('file not found');
    });
  });

  describe('commit() — rename (prevFilePath + filePath + content)', () => {
    test('produces ONE commit via index orchestration', async () => {
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: '/notes/renamed.md',
        content: '# Renamed Content',
        message: 'Rename note: foo → renamed',
        prevFilePath: '/notes/foo.md',
        author,
      });

      expect(result.success).toBe(true);
      expect(result.oid).toBe('commit-sha-1');
    });

    test('rename returns failure when FileSystem.writeAsStringAsync throws', async () => {
      const { writeAsStringAsync } = require('expo-file-system/legacy');
      writeAsStringAsync.mockRejectedValueOnce(new Error('disk full'));
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: '/notes/renamed.md',
        content: '# Renamed',
        message: 'Rename',
        prevFilePath: '/notes/foo.md',
        author,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/disk full/);
    });

    test('rename returns failure for invalid repo path', async () => {
      const result = await CommitService.commit({
        repo: 'not-a-repo',
        branch: 'main',
        filePath: '/notes/renamed.md',
        content: '# Renamed',
        message: 'Rename',
        prevFilePath: '/notes/foo.md',
        author,
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Invalid repo path/);
    });

    test('rename rejects API mode even with prevFilePath', async () => {
      (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
      const result = await CommitService.commit({
        repo: 'me/repo',
        branch: 'main',
        filePath: '/notes/renamed.md',
        content: '# Renamed',
        message: 'Rename',
        prevFilePath: '/notes/foo.md',
        author,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('Use NoteSyncQueueService for api mode');
    });
  });

  describe('resolveAuthor()', () => {
    test('returns author from GitHostService', async () => {
      const mockUser = { login: 'testuser', name: 'Test User', email: 'test@example.com' };
      (getGitHostService('github') as any).getAuthenticatedUser.mockResolvedValue(mockUser);
      const result = await CommitService.resolveAuthor();
      expect(result).toEqual({ name: 'Test User', email: 'test@example.com' });
    });

    test('falls back to gitnotes when getAuthenticatedUser returns null', async () => {
      (getGitHostService('github') as any).getAuthenticatedUser.mockResolvedValue(null);
      const result = await CommitService.resolveAuthor();
      expect(result.name).toBe('gitnotes');
      expect(result.email).toBe('gitnotes@users.noreply.gitnotes');
    });
  });
});
