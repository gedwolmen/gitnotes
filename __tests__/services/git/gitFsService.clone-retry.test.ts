/**
 * Tests for the single clone-retry on packfile corruption (issue #790).
 *
 * Mirrors the mock setup in gitFsService.test.ts but scopes to a single
 * behaviour: when `git.clone` throws a packfile-corruption message,
 * `GitFsService.clone` retries exactly once after cleanup; on non-corruption
 * errors, no retry is attempted.
 */

jest.mock('isomorphic-git', () => {
  const mockIg = {
    clone: jest.fn(async (..._args: unknown[]) => undefined),
    fetch: jest.fn(async (..._args: unknown[]) => ({ defaultBranch: 'main' })),
    fastForward: jest.fn(async (..._args: unknown[]) => undefined),
    walk: jest.fn(async () => []),
    resolveRef: jest.fn(async () => 'oid-deadbeef'),
    readBlob: jest.fn(async () => ({ oid: 'oid', blob: new TextEncoder().encode('x') })),
    readCommit: jest.fn(async () => ({
      oid: 'oid-deadbeef',
      commit: { message: 'x', parent: [], tree: 'abc' },
    })),
    TREE: jest.fn((o: { ref: string }) => ({ __tree: o.ref })),
  };
  (globalThis as { __mockIg?: typeof mockIg }).__mockIg = mockIg;
  return {
    __esModule: true,
    default: {
      clone: mockIg.clone,
      fetch: mockIg.fetch,
      fastForward: mockIg.fastForward,
      walk: mockIg.walk,
      resolveRef: mockIg.resolveRef,
      readBlob: mockIg.readBlob,
      readCommit: mockIg.readCommit,
    },
    TREE: mockIg.TREE,
  };
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
  async deleteAsync(uri: string) { mockFsStore.delete(uri); },
  async makeDirectoryAsync(uri: string) { mockFsStore.set(uri.replace(/\/$/, ''), { type: 'dir' }); },
  async readAsStringAsync(_uri: string) { return ''; },
  async writeAsStringAsync(_uri: string, _content: string) { /* noop */ },
  async readDirectoryAsync() { return []; },
}));

jest.mock('../../../src/services/git/lfs', () => ({
  LfsService: { scanRepo: jest.fn(async () => []), clearRepo: jest.fn(async () => undefined) },
}));

jest.mock('../../../src/services/git/gitHttp', () => ({ gitHttp: { request: jest.fn() } }));

import { GitFsService } from '../../../src/services/git/GitFsService';

function getMockIg() {
  return (globalThis as { __mockIg?: {
    clone: jest.Mock;
  } }).__mockIg!;
}

describe('GitFsService.clone retry (issue #790)', () => {
  beforeEach(() => {
    const { clone } = getMockIg();
    jest.clearAllMocks();
    clone.mockReset();
    mockFsStore.clear();
  });

  test('Case A: succeeds on first attempt — no cleanup, no retry', async () => {
    getMockIg().clone.mockResolvedValueOnce(undefined);
    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();
    expect(getMockIg().clone).toHaveBeenCalledTimes(1);
  });

  test('Case B: retries once on Packfile trailer mismatch, succeeds on attempt 2', async () => {
    getMockIg().clone
      .mockRejectedValueOnce(new Error('Packfile trailer mismatch: bad hash'))
      .mockResolvedValueOnce(undefined);

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();

    expect(getMockIg().clone).toHaveBeenCalledTimes(2);
  });

  test('Case C: throws non-packfile error immediately, no retry', async () => {
    getMockIg().clone.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).rejects.toThrow('ECONNREFUSED');

    expect(getMockIg().clone).toHaveBeenCalledTimes(1);
  });

  test('Case D: both attempts corrupt — error propagates after cleanup', async () => {
    getMockIg().clone
      .mockRejectedValueOnce(new Error('Packfile trailer mismatch'))
      .mockRejectedValueOnce(new Error('NotFoundError: could not find'));

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).rejects.toThrow(/could not find/);

    expect(getMockIg().clone).toHaveBeenCalledTimes(2);
  });

  test('Case E: NotFoundError from git.clone triggers retry', async () => {
    getMockIg().clone
      .mockRejectedValueOnce(new Error('NotFoundError: missing object'))
      .mockResolvedValueOnce(undefined);

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();

    expect(getMockIg().clone).toHaveBeenCalledTimes(2);
  });
});
