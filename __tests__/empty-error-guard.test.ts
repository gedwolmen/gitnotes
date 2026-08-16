import { describe, expect, jest, test, beforeEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import http from '../src/services/http';
import { classifyGitHubSyncError, syncStatusForError, isRetryableFailure } from '../src/services/git/syncFailure';
import { deleteNoteFromGitHub } from '../src/services/NoteGitHubSyncService';
import { GitHubService } from '../src/services/GitHubService';
import { hydrate, useGitOperationStore } from '../src/stores/gitOperationStore';

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getFileShaCached: jest.fn(async () => ({ kind: 'found', sha: 'abc123' })),
    deleteFile: jest.fn(),
    setToken: jest.fn(),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getTokenById: jest.fn(async () => null), getToken: jest.fn(async () => null) },
}));

jest.mock('../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, hint?: string) => hint ?? 'main'),
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    getAll: jest.fn(async () => []),
    subscribe: jest.fn(() => jest.fn()),
  },
}));

const DELETE_FAILURES_KEY = '@gitnotes:delete_failures_v1';

describe('empty-error guard', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useGitOperationStore.setState({ ops: {} });
    jest.clearAllMocks();
    jest.mocked(GitHubService.isAuthenticated).mockReturnValue(true);
    jest.mocked(GitHubService.getFileShaCached).mockResolvedValue({ kind: 'found', sha: 'abc123' });
  });

  test('classifyGitHubSyncError produces a non-empty message for an empty-message error', () => {
    const failure = classifyGitHubSyncError(new Error(''));
    expect(failure.message.length).toBeGreaterThan(0);
    expect(failure.message).toBe('Unknown GitHub sync failure');
    expect(isRetryableFailure(failure)).toBe(true);
    expect(syncStatusForError('')).toBeUndefined();
  });

  test('deleteNoteFromGitHub never leaks an empty error message from a thrown empty-message error', async () => {
    jest.mocked(GitHubService.deleteFile).mockRejectedValue(new Error(''));

    const result = await deleteNoteFromGitHub({
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/a.md',
      title: 'A',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toBe('Unknown error');
  });

  test('gitOperationStore treats an empty error string on a failed delete record as missing', async () => {
    await AsyncStorage.setItem(
      DELETE_FAILURES_KEY,
      JSON.stringify({
        'owner/repo::main::notes/a.md': { error: '', kind: 'delete', at: 1 },
      }),
    );

    await hydrate();

    const op = useGitOperationStore.getState().ops['owner/repo::main::notes/a.md'];
    expect(op).toBeDefined();
    expect(op?.status).toBe('failed');
    expect(op?.error).toBe('Delete failed');
  });

  test('http interceptor turns a status-less empty-message error into Network error', () => {
    const [handler] = http.interceptors.response.handlers ?? [];
    const rejected = handler?.rejected as ((error: unknown) => unknown) | undefined;
    expect(rejected).toBeDefined();

    expect(() => rejected?.({ message: '', config: {} })).toThrow('Network error');
  });
});
