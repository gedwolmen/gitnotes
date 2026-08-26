/**
 * Tests for src/services/git/recovery.ts — push-recovery helpers.
 *
 * Covers:
 * (a) pushWithRecovery on non-fast-forward calls pullWithFastForward then retries push once
 * (b) pushWithRecovery on corruption-with-unpushed-commits returns hard error (user data preserved)
 * (c) pushWithRecovery on corruption-without-unpushed-commits removes repo, re-clones, retries
 * (d) surfaceConflictsOnDiverged adds to useConflictStore only when findMergeBase succeeds
 * (e) hasUnpushedLocalCommits returns false when localOid === remoteOid
 */

jest.mock('isomorphic-git', () => {
  const mocks = {
    push: jest.fn(async () => ({ ok: true })),
    fetch: jest.fn(async () => undefined),
    currentBranch: jest.fn(async () => 'main'),
    checkout: jest.fn(async () => undefined),
    status: jest.fn(async () => 'unmodified'),
  };
  (globalThis as any).__recoveryGitMocks = mocks;
  return { __esModule: true, default: mocks };
});

const mockFsStore = new Map<string, { type: 'file' | 'dir'; content?: string }>();

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  documentDirectory: 'file:///doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  async getInfoAsync(uri: string) {
    const e = mockFsStore.get(uri);
    return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
  },
  async deleteAsync(uri: string) {
    mockFsStore.delete(uri);
  },
  async makeDirectoryAsync(uri: string) {
    mockFsStore.set(uri.replace(/\/$/, ''), { type: 'dir' });
  },
  async readAsStringAsync(uri: string) {
    const e = mockFsStore.get(uri);
    return e?.content ?? '';
  },
  async writeAsStringAsync(uri: string, _content: string) {
    mockFsStore.set(uri, { type: 'file', content: _content });
  },
  async readDirectoryAsync() {
    return [];
  },
}));

jest.mock('../../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
  GitFsService: {
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    removeRepo: jest.fn(async () => undefined),
    clone: jest.fn(async () => undefined),
    getCommitOid: jest.fn(async () => 'same-oid'),
    findMergeBase: jest.fn(async () => 'abc123'),
  },
}));

jest.mock('../../../src/services/git/gitHttp', () => ({ gitHttp: { request: jest.fn() } }));

jest.mock('../../../src/services/conflict/ConflictResolverService', () => ({
  ConflictResolverService: {
    detectConflicts: jest.fn(async () => ({
      repoPath: 'me/repo',
      branch: 'main',
      localRef: 'refs/heads/main',
      remoteRef: 'refs/remotes/origin/main',
      mergeBaseRef: 'abc123',
      files: [],
      detectedAt: Date.now(),
    })),
    autoResolve: jest.fn(async (cs) => cs),
  },
}));

const mockAddConflict = jest.fn();
jest.mock('../../../src/stores/conflictStore', () => ({
  useConflictStore: {
    getState: jest.fn(() => ({ addConflict: mockAddConflict })),
  },
}));

import {
  isPushRejected,
  classifyPushError,
  pushWithRecovery,
  surfaceConflictsOnDiverged,
  repairCloneAfterCorruption,
} from '../../../src/services/git/recovery';
import { GitFsService } from '../../../src/services/git/GitFsService';
import { ConflictResolverService } from '../../../src/services/conflict/ConflictResolverService';

function getGitMocks() {
  return (globalThis as any).__recoveryGitMocks as {
    push: jest.Mock;
    fetch: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFsStore.clear();
  (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValue({ ok: true });
  (GitFsService.removeRepo as jest.Mock).mockResolvedValue(undefined);
  (GitFsService.clone as jest.Mock).mockResolvedValue(undefined);
  (GitFsService.getCommitOid as jest.Mock).mockResolvedValue('same-oid');
  (GitFsService.findMergeBase as jest.Mock).mockResolvedValue('abc123');
  mockAddConflict.mockResolvedValue(undefined);
  (ConflictResolverService.detectConflicts as jest.Mock).mockResolvedValue({
    repoPath: 'me/repo',
    branch: 'main',
    localRef: 'refs/heads/main',
    remoteRef: 'refs/remotes/origin/main',
    mergeBaseRef: 'abc123',
    files: [],
    detectedAt: Date.now(),
  });
  (ConflictResolverService.autoResolve as jest.Mock).mockResolvedValue({
    repoPath: 'me/repo',
    branch: 'main',
    localRef: 'refs/heads/main',
    remoteRef: 'refs/remotes/origin/main',
    mergeBaseRef: 'abc123',
    files: [],
    detectedAt: Date.now(),
  });
});

// ---------------------------------------------------------------------------
// isPushRejected
// ---------------------------------------------------------------------------

describe('isPushRejected', () => {
  test('returns true for "push rejected"', () => {
    expect(isPushRejected('Push rejected')).toBe(true);
    expect(isPushRejected('push rejected non-fast-forward')).toBe(true);
  });

  test('returns true for "not a simple fast-forward"', () => {
    expect(isPushRejected('not a simple fast-forward')).toBe(true);
  });

  test('returns true for "non-fast-forward"', () => {
    expect(isPushRejected('non-fast-forward')).toBe(true);
  });

  test('returns true for "one or more branches were not updated"', () => {
    expect(isPushRejected('one or more branches were not updated')).toBe(true);
  });

  test('returns false for unrelated errors', () => {
    expect(isPushRejected('authentication failed')).toBe(false);
    expect(isPushRejected('network timeout')).toBe(false);
    expect(isPushRejected('Could not find abc123')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// classifyPushError
// ---------------------------------------------------------------------------

describe('classifyPushError', () => {
  test('classifies authentication errors', () => {
    expect(classifyPushError('authentication failed')).toMatch(/authentication error/);
    expect(classifyPushError('401 Unauthorized')).toMatch(/authentication error/);
    expect(classifyPushError('credentials expired')).toMatch(/authentication error/);
    expect(classifyPushError('permission denied')).toMatch(/authentication error/);
  });

  test('classifies network errors', () => {
    expect(classifyPushError('network timeout')).toMatch(/network error/);
    expect(classifyPushError('ECONNREFUSED')).toMatch(/network error/);
    expect(classifyPushError('fetch failed')).toMatch(/network error/);
    expect(classifyPushError('socket hang up')).toMatch(/network error/);
  });

  test('classifies non-fast-forward as remote rejection', () => {
    expect(classifyPushError('non-fast-forward')).toMatch(/remote rejected non-fast-forward/);
    expect(classifyPushError('push rejected')).toMatch(/remote rejected non-fast-forward/);
    expect(classifyPushError('not a simple fast-forward')).toMatch(/remote rejected non-fast-forward/);
  });

  test('classifies branch-not-found errors', () => {
    expect(classifyPushError('branch not found')).toMatch(/branch not found/);
    expect(classifyPushError('branch does not exist')).toMatch(/branch not found/);
  });

  test('falls through to generic push failed', () => {
    expect(classifyPushError('something went wrong')).toMatch(/push failed —/);
  });
});

// ---------------------------------------------------------------------------
// pushWithRecovery — acceptance (a)
// ---------------------------------------------------------------------------

describe('(a) pushWithRecovery on non-fast-forward calls pullWithFastForward then retries push once', () => {
  test('calls pullWithFastForward on non-fast-forward push rejection, then retries push', async () => {
    getGitMocks().push
      .mockRejectedValueOnce(new Error('push rejected: non-fast-forward'))
      .mockResolvedValueOnce({ ok: true });

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(true);
    expect(GitFsService.pullWithFastForward).toHaveBeenCalledWith({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });
    expect(getGitMocks().push).toHaveBeenCalledTimes(2);
  });

  test('returns error when pullWithFastForward fails with unknown reason', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'unknown',
      error: 'network timeout',
    });

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/network timeout/);
    expect(getGitMocks().push).toHaveBeenCalledTimes(1); // no retry
  });
});

// ---------------------------------------------------------------------------
// pushWithRecovery — acceptance (b)
// ---------------------------------------------------------------------------

describe('(b) pushWithRecovery on corruption-with-unpushed-commits returns hard error', () => {
  test('returns hard error (user data preserved) when corruption detected with unpushed commits', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('Could not find fc19c489cbd51e123949d74'));
    (GitFsService.getCommitOid as jest.Mock)
      .mockResolvedValueOnce('local-oid') // local head
      .mockResolvedValueOnce('remote-oid') // remote head — different
      ;
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValueOnce('common-base');

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Clone corruption with unpushed commits/);
    // Must NOT remove repo — user data would be destroyed
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
    expect(GitFsService.clone).not.toHaveBeenCalled();
  });

  test('also triggers hard error when pullWithFastForward returns corruption error', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'unknown',
      error: 'Packfile trailer mismatch: bad hash',
    });
    (GitFsService.getCommitOid as jest.Mock)
      .mockResolvedValueOnce('local-oid')
      .mockResolvedValueOnce('remote-oid');
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValueOnce('common-base');

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Clone corruption with unpushed commits/);
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pushWithRecovery — acceptance (c)
// ---------------------------------------------------------------------------

describe('(c) pushWithRecovery on corruption-without-unpushed-commits removes repo, re-clones, retries', () => {
  test('removes repo and re-clones when corruption detected without unpushed commits', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('Could not find fc19c489cbd51e123949d74'));
    // local and remote are in sync — no unpushed commits
    (GitFsService.getCommitOid as jest.Mock).mockResolvedValue('same-oid');
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue(null);

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(true);
    expect(GitFsService.removeRepo).toHaveBeenCalledWith({ repoPath: 'me/repo' });
    expect(GitFsService.clone).toHaveBeenCalledWith({ repoPath: 'me/repo', branch: 'main', token: 'tok' });
    // Push retried after re-clone
    expect(getGitMocks().push).toHaveBeenCalledTimes(2);
  });

  test('also handles corruption from pullWithFastForward (non-diverged case)', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'unknown',
      error: 'Packfile trailer mismatch: bad hash',
    });
    // local and remote are in sync
    (GitFsService.getCommitOid as jest.Mock).mockResolvedValue('same-oid');

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(true);
    expect(GitFsService.removeRepo).toHaveBeenCalled();
    expect(GitFsService.clone).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// pushWithRecovery — diverged branch handling
// ---------------------------------------------------------------------------

describe('pushWithRecovery on diverged branch surfaces conflicts', () => {
  test('returns conflict-detected when pullWithFastForward returns diverged', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('push rejected: non-fast-forward'));
    (GitFsService.pullWithFastForward as jest.Mock).mockResolvedValueOnce({
      ok: false,
      reason: 'diverged',
    });
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue('base-commit');

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('conflict-detected');
    expect(mockAddConflict).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// surfaceConflictsOnDiverged — acceptance (d)
// ---------------------------------------------------------------------------

describe('(d) surfaceConflictsOnDiverged adds to useConflictStore only when findMergeBase succeeds', () => {
  test('adds to conflict store when findMergeBase succeeds', async () => {
    const conflictSet = {
      repoPath: 'me/repo',
      branch: 'main',
      localRef: 'refs/heads/main',
      remoteRef: 'refs/remotes/origin/main',
      mergeBaseRef: 'abc123',
      files: [],
      detectedAt: Date.now(),
    };
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue('abc123');
    (ConflictResolverService.detectConflicts as jest.Mock).mockResolvedValue(conflictSet);
    (ConflictResolverService.autoResolve as jest.Mock).mockResolvedValue(conflictSet);

    const result = await surfaceConflictsOnDiverged({ repoPath: 'me/repo', branch: 'main' });

    expect(result).not.toBeNull();
    expect(result?.repoPath).toBe('me/repo');
    expect(mockAddConflict).toHaveBeenCalled();
  });

  test('does NOT add to conflict store when findMergeBase returns null', async () => {
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue(null);

    const result = await surfaceConflictsOnDiverged({ repoPath: 'me/repo', branch: 'main' });

    expect(result).toBeNull();
    expect(mockAddConflict).not.toHaveBeenCalled();
    expect(ConflictResolverService.detectConflicts).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// hasUnpushedLocalCommits — acceptance (e)
// ---------------------------------------------------------------------------

describe('(e) hasUnpushedLocalCommits returns false when localOid === remoteOid', () => {
  test('returns false when local and remote OIDs match — corruption recovery is safe (no hard error)', async () => {
    // The function is internal (not exported), so we verify indirectly through behavior:
    // When localOid === remoteOid, there are no unpushed commits, so corruption recovery
    // should proceed (remove + re-clone) without throwing a hard error.
    getGitMocks().push.mockRejectedValueOnce(new Error('Could not find abc'));
    (GitFsService.getCommitOid as jest.Mock).mockResolvedValue('same-oid');
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue(null);

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });
    expect(result.success).toBe(true);
    expect(GitFsService.removeRepo).toHaveBeenCalled(); // safe to re-clone
  });

  test('returns true (and throws hard error on corruption) when localOid !== remoteOid !== mergeBase', async () => {
    getGitMocks().push.mockRejectedValueOnce(new Error('Could not find abc'));
    (GitFsService.getCommitOid as jest.Mock)
      .mockResolvedValueOnce('local-oid')
      .mockResolvedValueOnce('remote-oid');
    (GitFsService.findMergeBase as jest.Mock).mockResolvedValue('common-base');

    const result = await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unpushed commits/);
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// repairCloneAfterCorruption
// ---------------------------------------------------------------------------

describe('repairCloneAfterCorruption', () => {
  test('removes repo and re-clones', async () => {
    await repairCloneAfterCorruption({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(GitFsService.removeRepo).toHaveBeenCalledWith({ repoPath: 'me/repo' });
    expect(GitFsService.clone).toHaveBeenCalledWith({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });
  });
});

// ---------------------------------------------------------------------------
// ensureCloneNotShallow (implicitly via pushWithRecovery)
// ---------------------------------------------------------------------------

describe('ensureCloneNotShallow during pushWithRecovery', () => {
  test('calls git.fetch when .git/shallow exists', async () => {
    mockFsStore.set('file:///doc/GitNotes/me/repo/.git/shallow', { type: 'file', content: '' });
    getGitMocks().push.mockResolvedValue({ ok: true });

    await pushWithRecovery({ repoPath: 'me/repo', branch: 'main', token: 'tok' });

    expect(getGitMocks().fetch).toHaveBeenCalled();
  });
});
