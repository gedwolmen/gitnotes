import * as fs from 'fs';
import * as path from 'path';

const mockAddConflict = jest.fn(async () => undefined);

jest.mock('isomorphic-git', () => {
  const mocks = {
    add: jest.fn(async () => undefined),
    remove: jest.fn(async () => undefined),
    commit: jest.fn(async () => 'commit-sha'),
    push: jest.fn(async () => ({ ok: true })),
    currentBranch: jest.fn(async () => 'main'),
    checkout: jest.fn(async () => undefined),
    fetch: jest.fn(async () => undefined),
    status: jest.fn(async () => 'modified'),
  };
  (globalThis as any).__prcGitMocks = mocks;
  return { __esModule: true, default: mocks };
});

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  (globalThis as any).__prcFsStore = fsStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri);
      return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
    },
    async writeAsStringAsync(uri: string) {
      fsStore.set(uri, { type: 'file' });
    },
    async deleteAsync(uri: string) {
      fsStore.delete(uri);
    },
    async makeDirectoryAsync(uri: string) {
      fsStore.set(uri, { type: 'dir' });
    },
  };
});

jest.mock('../src/services/git/GitFsService', () => ({
  GitFsService: {
    pullWithFastForward: jest.fn(),
    findMergeBase: jest.fn(),
    removeRepo: jest.fn(async () => undefined),
    clone: jest.fn(async () => undefined),
    getCommitOid: jest.fn(),
  },
}));

jest.mock('../src/services/conflict/ConflictResolverService', () => ({
  ConflictResolverService: {
    detectConflicts: jest.fn(),
    autoResolve: jest.fn(),
  },
}));

jest.mock('../src/stores/conflictStore', () => ({
  useConflictStore: {
    getState: jest.fn(() => ({ addConflict: mockAddConflict })),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getFileShaOrNull: jest.fn(),
    updateFile: jest.fn(async () => true),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

import { LocalGitWriter } from '../src/services/git/LocalGitWriter';
import { GitFsService } from '../src/services/git/GitFsService';
import { ConflictResolverService } from '../src/services/conflict/ConflictResolverService';
import { syncNoteToGitHub } from '../src/services/NoteGitHubSyncService';
import { GitHubService } from '../src/services/GitHubService';
import { SyncEngineService } from '../src/services/SyncEngineService';
import type { ConflictSet } from '../src/services/conflict/types';

function getGitMocks() {
  return (globalThis as any).__prcGitMocks as {
    add: jest.Mock;
    remove: jest.Mock;
    commit: jest.Mock;
    push: jest.Mock;
    currentBranch: jest.Mock;
    checkout: jest.Mock;
    fetch: jest.Mock;
    status: jest.Mock;
  };
}

function getFsStore() {
  return (globalThis as any).__prcFsStore as Map<string, { type: 'file' | 'dir' }>;
}

const author = { name: 'Test', email: 'test@example.com' };

const conflictSet: ConflictSet = {
  repoPath: 'me/repo',
  branch: 'main',
  localRef: 'refs/heads/main',
  remoteRef: 'refs/remotes/origin/main',
  mergeBaseRef: 'abc123',
  files: [
    {
      path: 'notes/foo.md',
      kind: 'both-changed-different',
      format: 'text',
      localContent: 'local',
      remoteContent: 'remote',
      baseContent: 'base',
      mergedContent: 'merged',
      localSha: 'l1',
      remoteSha: 'r1',
      autoResolved: true,
    },
  ],
  detectedAt: 1,
};

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore().clear();
  (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValue({ ok: true });
  (GitFsService.findMergeBase as jest.Mock).mockResolvedValue(null);
  (GitFsService.getCommitOid as jest.Mock).mockResolvedValue('same-oid');
  (ConflictResolverService.detectConflicts as jest.Mock).mockResolvedValue(conflictSet);
  (ConflictResolverService.autoResolve as jest.Mock).mockResolvedValue(conflictSet);
  (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
});

describe('clone-mode diverged push surfaces conflicts instead of force-reset', () => {
  test('writeAndCommit returns conflict-detected, persists a ConflictSet, and does not force-reset', async () => {
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'diverged',
    });
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValueOnce('abc123');

    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));

    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'hello',
      message: 'Update note: foo',
      author,
      token: 'tok',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('conflict-detected');
    expect(mockAddConflict).toHaveBeenCalledTimes(1);
    expect(mockAddConflict).toHaveBeenCalledWith(conflictSet);
    expect(ConflictResolverService.detectConflicts).toHaveBeenCalledWith({
      repoPath: 'me/repo',
      branch: 'main',
      localRef: 'refs/heads/main',
      remoteRef: 'refs/remotes/origin/main',
      mergeBaseRef: 'abc123',
    });
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
    expect(GitFsService.clone).not.toHaveBeenCalled();
    // No replay/retry push after divergence.
    expect(getGitMocks().push).toHaveBeenCalledTimes(1);
  });

  test('corruption error still triggers the re-clone path (removeRepo + clone)', async () => {
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'unknown',
      error: 'Packfile trailer mismatch',
    });

    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));

    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'hello',
      message: 'Update note: foo',
      author,
      token: 'tok',
    });

    expect(result.success).toBe(true);
    expect(GitFsService.removeRepo).toHaveBeenCalledTimes(1);
    expect(GitFsService.clone).toHaveBeenCalledTimes(1);
    expect(mockAddConflict).not.toHaveBeenCalled();
    // Retry push after re-clone + replay.
    expect(getGitMocks().push).toHaveBeenCalledTimes(2);
  });
});

describe('api-mode push-time SHA conflict classification', () => {
  test('conflict error string surfaces as conflict-detected with status 409 (no ConflictSet)', async () => {
    (GitHubService.getFileShaOrNull as jest.Mock).mockResolvedValue('sha-remote');

    const result = await syncNoteToGitHub({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      title: 'Foo',
      content: 'hello',
      knownSha: 'sha-local',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('conflict-detected');
    expect(result.status).toBe(409);
    expect(GitHubService.updateFile).not.toHaveBeenCalled();
    expect(mockAddConflict).not.toHaveBeenCalled();
  });
});

describe('App bootstrap conflict hydration', () => {
  test('App.tsx calls loadConflicts at bootstrap', () => {
    const appSource = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
    expect(appSource).toContain("import { useConflictStore } from './src/stores/conflictStore';");
    expect(appSource).toContain('void useConflictStore.getState().loadConflicts();');
  });
});
