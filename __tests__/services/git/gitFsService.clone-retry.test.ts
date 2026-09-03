/**
 * Tests for the single clone-retry on packfile corruption (issue #790).
 *
 * Mirrors the mock setup in gitFsService.test.ts but scopes to a single
 * behaviour: when the native engine clone throws a packfile-corruption
 * message, `GitFsService.clone` retries exactly once after cleanup; on
 * non-corruption errors, no retry is attempted.
 */

jest.mock('../../../src/services/git/engine/GitEngine', () => ({
  clone: jest.fn(async () => ''),
}));

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
import { clone as nativeClone } from '../../../src/services/git/engine/GitEngine';

const mockNativeClone = nativeClone as jest.Mock;

describe('GitFsService.clone retry (issue #790)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNativeClone.mockReset();
    mockFsStore.clear();
  });

  test('Case A: succeeds on first attempt — no cleanup, no retry', async () => {
    mockNativeClone.mockResolvedValueOnce('');
    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();
    expect(mockNativeClone).toHaveBeenCalledTimes(1);
  });

  test('Case B: retries once on Packfile trailer mismatch, succeeds on attempt 2', async () => {
    mockNativeClone
      .mockRejectedValueOnce(new Error('Packfile trailer mismatch: bad hash'))
      .mockResolvedValueOnce('');

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();

    expect(mockNativeClone).toHaveBeenCalledTimes(2);
  });

  test('Case C: throws non-packfile error immediately, no retry', async () => {
    mockNativeClone.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).rejects.toThrow('ECONNREFUSED');

    expect(mockNativeClone).toHaveBeenCalledTimes(1);
  });

  test('Case D: both attempts corrupt — error propagates after cleanup', async () => {
    mockNativeClone
      .mockRejectedValueOnce(new Error('Packfile trailer mismatch'))
      .mockRejectedValueOnce(new Error('NotFoundError: could not find'));

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).rejects.toThrow(/could not find/);

    expect(mockNativeClone).toHaveBeenCalledTimes(2);
  });

  test('Case E: NotFoundError from the engine clone triggers retry', async () => {
    mockNativeClone
      .mockRejectedValueOnce(new Error('NotFoundError: missing object'))
      .mockResolvedValueOnce('');

    await expect(
      GitFsService.clone({ repoPath: 'owner/repo', branch: 'main' }),
    ).resolves.toBeUndefined();

    expect(mockNativeClone).toHaveBeenCalledTimes(2);
  });
});
