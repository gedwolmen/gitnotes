jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  deleteAsync: jest.fn(async () => {}),
  writeAsStringAsync: jest.fn(async () => {}),
  makeDirectoryAsync: jest.fn(async () => {}),
}));

jest.mock('../../src/utils/gitPathParser', () => ({
  parseRepoPath: jest.fn((path: string) => {
    if (!path) return null;
    const parts = path.split('/');
    if (parts.length !== 2) return null;
    return { owner: parts[0], repo: parts[1] };
  }),
}));

jest.mock('../../src/services/git/engine/GitEngine', () => ({
  remove: jest.fn(async () => {}),
  stage: jest.fn(async () => {}),
}));

import * as FileSystem from 'expo-file-system/legacy';
import * as GitEngine from '../../src/services/git/engine/GitEngine';
import { CloneSyncService } from '../../src/services/syncStubs';

describe('CloneSyncService.save (clone-mode worktree writer)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (GitEngine.remove as jest.Mock).mockResolvedValue(undefined);
    (GitEngine.stage as jest.Mock).mockResolvedValue(undefined);
  });

  describe('delete intent', () => {
    test('removes the worktree file and stages the removal (git rm)', async () => {
      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'todos/buy-groceries.json',
        message: 'Delete todo: Buy groceries',
        intent: 'delete',
      });

      expect(result).toEqual({ success: true });
      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///doc/GitNotes/owner/repo/todos/buy-groceries.json',
        { idempotent: true },
      );
      expect(GitEngine.remove).toHaveBeenCalledWith('file:///doc/GitNotes/owner/repo', [
        'todos/buy-groceries.json',
      ]);
      expect(GitEngine.stage).not.toHaveBeenCalled();
    });

    test('removes the worktree file before staging the removal', async () => {
      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'todos/a.json',
        message: 'Delete todo: a',
        intent: 'delete',
      });

      expect((FileSystem.deleteAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (GitEngine.remove as jest.Mock).mock.invocationCallOrder[0],
      );
    });

    test('strips a leading slash from filePath', async () => {
      await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: '/todos/a.json',
        message: 'Delete todo: a',
        intent: 'delete',
      });

      expect(FileSystem.deleteAsync).toHaveBeenCalledWith(
        'file:///doc/GitNotes/owner/repo/todos/a.json',
        { idempotent: true },
      );
      expect(GitEngine.remove).toHaveBeenCalledWith('file:///doc/GitNotes/owner/repo', ['todos/a.json']);
    });

    test('returns error when staging the removal fails', async () => {
      (GitEngine.remove as jest.Mock).mockRejectedValueOnce(new Error('repo locked'));

      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'todos/a.json',
        message: 'Delete todo: a',
        intent: 'delete',
      });

      expect(result).toEqual({ success: false, error: 'repo locked' });
    });
  });

  describe('upsert intent', () => {
    test('writes the content to the worktree and stages it', async () => {
      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'todos/a.json',
        content: '{"text":"a"}',
        message: 'Create todo: a',
        intent: 'upsert',
      });

      expect(result).toEqual({ success: true });
      expect(FileSystem.makeDirectoryAsync).toHaveBeenCalledWith(
        'file:///doc/GitNotes/owner/repo/todos',
        { intermediates: true },
      );
      expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        'file:///doc/GitNotes/owner/repo/todos/a.json',
        '{"text":"a"}',
      );
      expect(GitEngine.stage).toHaveBeenCalledWith('file:///doc/GitNotes/owner/repo', ['todos/a.json']);
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
    });
  });

  describe('validation', () => {
    test('rejects an invalid repo path', async () => {
      const result = await CloneSyncService.save({
        repoPath: 'not-a-repo',
        branch: 'main',
        filePath: 'todos/a.json',
        message: 'Delete todo: a',
        intent: 'delete',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid repo path');
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      expect(GitEngine.remove).not.toHaveBeenCalled();
    });

    test('rejects a missing filePath', async () => {
      const result = await CloneSyncService.save({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: '',
        message: 'Delete todo: a',
        intent: 'delete',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Missing filePath');
      expect(FileSystem.deleteAsync).not.toHaveBeenCalled();
      expect(GitEngine.remove).not.toHaveBeenCalled();
    });
  });
});
