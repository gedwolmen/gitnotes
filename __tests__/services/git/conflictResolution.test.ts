import * as FileSystem from 'expo-file-system/legacy';

import * as GitEngine from '@/services/git/engine/GitEngine';
import { CommitService } from '@/services/git/CommitService';
import { syncNow } from '@/services/git/manualSync';
import {
  getConflictChoiceContent,
  resolveConflictAndSync,
} from '@/services/git/conflictResolution';

jest.mock('expo-file-system/legacy', () => ({
  writeAsStringAsync: jest.fn(),
}));

jest.mock('@/services/git/engine/GitEngine', () => ({
  markConflictResolved: jest.fn(),
  commit: jest.fn(),
  push: jest.fn(),
}));

jest.mock('@/services/git/CommitService', () => ({
  CommitService: { resolveAuthor: jest.fn() },
}));

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { workingTreeUri: jest.fn(() => 'file:///repo') },
}));

jest.mock('@/services/git/manualSync', () => ({
  syncNow: jest.fn(),
}));

describe('conflictResolution', () => {
  it('builds marker-free content for ours, theirs, and both choices', () => {
    const blobs = { ours: 'local', theirs: 'remote', base: 'common' };

    expect(getConflictChoiceContent(blobs, 'ours')).toBe('local');
    expect(getConflictChoiceContent(blobs, 'theirs')).toBe('remote');
    expect(getConflictChoiceContent(blobs, 'both')).toBe('local\nremote');
    expect(getConflictChoiceContent(blobs, 'edit')).toContain('<<<<<<< ours');
  });

  it('writes, stages, commits, pushes, then pulls the resolved repository', async () => {
    (CommitService.resolveAuthor as jest.Mock).mockResolvedValue({ name: 'Test User', email: 'test@example.com' });
    (GitEngine.push as jest.Mock).mockResolvedValue({ ok: true, pushed: 1 });
    (syncNow as jest.Mock).mockResolvedValue({ ok: true });

    await resolveConflictAndSync(
      { id: 'repo-1', path: 'owner/repo', name: 'repo', branch: 'main' },
      'notes/readme.md',
      'resolved content',
    );

    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledWith(
      'file:///repo/notes/readme.md',
      'resolved content',
    );
    expect(GitEngine.markConflictResolved).toHaveBeenCalledWith('file:///repo', 'notes/readme.md');
    expect(GitEngine.commit).toHaveBeenCalledWith(
      'file:///repo',
      'Resolve conflict: notes/readme.md',
      { name: 'Test User', email: 'test@example.com' },
    );
    expect(GitEngine.push).toHaveBeenCalledWith('file:///repo', 'origin', 'repo-1');
    expect(syncNow).toHaveBeenCalledWith({ repos: ['owner/repo'], source: 'manual' });

    const operationOrder = [
      FileSystem.writeAsStringAsync,
      GitEngine.markConflictResolved,
      GitEngine.commit,
      GitEngine.push,
      syncNow,
    ].map((operation) => (operation as jest.Mock).mock.invocationCallOrder[0]);
    expect(operationOrder).toEqual([...operationOrder].sort((left, right) => left - right));
  });
});
