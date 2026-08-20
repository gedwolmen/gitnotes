jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => ({ id: 'mut_upsert' })),
    enqueueNoteDelete: jest.fn(async () => ({ id: 'mut_delete' })),
    getAll: jest.fn(async () => []),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
    onDroppedMutation: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: jest.fn(async () => ({ success: true })),
    deleteAndCommit: jest.fn(async () => ({ success: true })),
    push: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'clone'),
    listOverrides: jest.fn(async () => ({})),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCommitOid: jest.fn(async () => null),
    findMergeBase: jest.fn(async () => null),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: {
    getToken: jest.fn(async () => 'test-token'),
  },
}));

jest.mock('../../src/services/git/gitHostFactory', () => ({
  getGitHostService: jest.fn(() => ({
    getAuthenticatedUser: jest.fn(async () => ({
      login: 'testuser',
      name: 'Test User',
      email: 'test@example.com',
    })),
  })),
}));

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: {
    begin: jest.fn(),
    end: jest.fn(),
    setProgress: jest.fn(),
  },
}));

jest.mock('../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    acquireCycle: jest.fn(async () => jest.fn()),
    isCycleHeld: jest.fn(() => false),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(async () => ({
    repos: 1,
    notes: 1,
    canvases: 0,
    todos: 0,
    templates: 0,
  })),
}));

jest.mock('../../src/stores/noteStore', () => ({
  useNoteStore: { getState: jest.fn(() => ({ refreshNotes: jest.fn(async () => {}) })) },
}));

jest.mock('../../src/stores/canvasStore', () => ({
  useCanvasStore: { getState: jest.fn(() => ({ refreshCanvases: jest.fn(async () => {}) })) },
}));

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: { getState: jest.fn(() => ({ refreshTodos: jest.fn(async () => {}) })) },
}));

import {
  StagingService,
  subscribeStagedChanged,
} from '../../src/services/git/StagingService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { LocalGitWriter } from '../../src/services/git/LocalGitWriter';
import { SyncEngineService } from '../../src/services/SyncEngineService';

const enqueueUpsert = NoteSyncQueueService.enqueueNoteUpsert as jest.Mock;
const writeAndCommit = LocalGitWriter.writeAndCommit as jest.Mock;
const deleteAndCommit = LocalGitWriter.deleteAndCommit as jest.Mock;
const getMode = SyncEngineService.getMode as jest.Mock;

const upsertParams = {
  repo: 'owner/repo',
  branch: 'main',
  filePath: 'notes/a.md',
  title: 'A',
  content: 'hello',
};

const deleteParams = {
  repo: 'owner/repo',
  branch: 'main',
  filePath: 'notes/b.md',
  title: 'B',
};

describe('StagingService staged-changed emitter (#925)', () => {
  let listener: jest.Mock;
  let unsubscribe: () => void;

  beforeEach(() => {
    jest.clearAllMocks();
    writeAndCommit.mockResolvedValue({ success: true });
    deleteAndCommit.mockResolvedValue({ success: true });
    enqueueUpsert.mockResolvedValue({ id: 'mut_upsert' });
    listener = jest.fn();
    unsubscribe = subscribeStagedChanged(listener);
  });

  afterEach(() => {
    unsubscribe();
  });

  test('clone-mode stageUpsert success fires notifyStagedChanged', async () => {
    getMode.mockResolvedValue('clone');

    const result = await StagingService.stageUpsert(upsertParams);

    expect(result).toEqual({ success: true });
    expect(writeAndCommit).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('clone-mode stageDelete success fires notifyStagedChanged', async () => {
    getMode.mockResolvedValue('clone');

    const result = await StagingService.stageDelete(deleteParams);

    expect(result).toEqual({ success: true });
    expect(deleteAndCommit).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('api-mode enqueue does NOT notify (queue subscribe covers it)', async () => {
    getMode.mockResolvedValue('api');

    const result = await StagingService.stageUpsert(upsertParams);

    expect(result).toEqual({ success: true });
    expect(enqueueUpsert).toHaveBeenCalledTimes(1);
    expect(writeAndCommit).not.toHaveBeenCalled();
    expect(listener).not.toHaveBeenCalled();
  });

  test('clone-mode stageUpsert failure does NOT notify', async () => {
    getMode.mockResolvedValue('clone');
    writeAndCommit.mockResolvedValue({ success: false, error: 'write failed' });

    const result = await StagingService.stageUpsert(upsertParams);

    expect(result).toEqual({ success: false, error: 'write failed' });
    expect(listener).not.toHaveBeenCalled();
  });

  test('unsubscribe prevents further notifications', async () => {
    getMode.mockResolvedValue('clone');
    unsubscribe();

    const result = await StagingService.stageUpsert(upsertParams);

    expect(result).toEqual({ success: true });
    expect(listener).not.toHaveBeenCalled();
  });

  test('subscribe returns an unsubscribe fn that detaches only its own listener', async () => {
    getMode.mockResolvedValue('clone');
    const secondListener = jest.fn();
    const unsubscribeSecond = subscribeStagedChanged(secondListener);
    expect(typeof unsubscribeSecond).toBe('function');

    unsubscribeSecond();
    await StagingService.stageUpsert(upsertParams);

    expect(secondListener).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
