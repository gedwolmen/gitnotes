jest.mock('../../../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(),
  pullFromSingleRepo: jest.fn(),
}));

jest.mock('../../../src/stores/noteStore', () => ({
  useNoteStore: { getState: () => ({ refreshNotes: jest.fn(async () => undefined) }) },
}));

jest.mock('../../../src/stores/canvasStore', () => ({
  useCanvasStore: { getState: () => ({ refreshCanvases: jest.fn(async () => undefined) }) },
}));

jest.mock('../../../src/stores/todoStore', () => ({
  useTodoStore: { getState: () => ({ refreshTodos: jest.fn(async () => undefined) }) },
}));

// StartupSyncGate render-path mocks (manualSync stays real: the component
// test asserts the cycle source through the actual syncNow chain).
jest.mock('../../../src/services/ForegroundSyncService', () => ({
  isForegroundSyncInFlight: jest.fn(() => false),
  isForegroundSyncPaused: jest.fn(() => false),
  subscribeForegroundSync: jest.fn(() => jest.fn()),
  acquireExternalSync: jest.fn(() => jest.fn()),
}));

jest.mock('../../../src/services/GitHubService', () => ({
  GitHubService: {
    initialize: jest.fn(async () => undefined),
    isAuthenticated: jest.fn(() => true),
  },
}));

jest.mock('../../../src/contexts/NoteContext', () => ({
  useNotes: () => ({ refreshNotes: jest.fn(async () => undefined) }),
}));

jest.mock('../../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({ refreshCanvases: jest.fn(async () => undefined) }),
}));

jest.mock('../../../src/contexts/TodoContext', () => ({
  useTodos: () => ({ refreshTodos: jest.fn(async () => undefined) }),
}));

jest.mock('../../../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [{ id: 'repo-id', name: 'repo', path: 'owner/repo' }],
  }),
}));

let mockAppStateListener: ((state: string) => void) | null = null;

jest.mock('react-native/Libraries/AppState/AppState', () => ({
  __esModule: true,
  default: {
    currentState: 'active',
    addEventListener: jest.fn((_event: string, listener: (state: string) => void) => {
      mockAppStateListener = listener;
      return { remove: jest.fn() };
    }),
    removeEventListener: jest.fn(),
  },
}));

import React from 'react';
import { View } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { GitSyncGate } from '../../../src/services/git/GitSyncGate';
import type { CycleSource } from '../../../src/services/git/GitSyncGate';
import { syncNow } from '../../../src/services/git/manualSync';
import { pullAllFromRepos } from '../../../src/services/RepoPullService';
import { useGitOperationStore, GIT_OP_ALL_REPOS } from '../../../src/stores/gitOperationStore';
import type { GitOp } from '../../../src/stores/gitOperationStore';
import { StartupSyncGate } from '../../../src/components/StartupSyncGate';

const cycleOp = (): GitOp | undefined =>
  Object.values(useGitOperationStore.getState().ops).find(
    (op) => op.kind === 'pull' && op.repo === GIT_OP_ALL_REPOS,
  );

const ALL_SOURCES: CycleSource[] = ['save', 'manual', 'idle', 'background', 'startup'];

describe('GitSyncGate cycle source tagging', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    GitSyncGate.__resetForTest();
    useGitOperationStore.setState({ ops: {} });
    (pullAllFromRepos as jest.Mock).mockResolvedValue({
      repos: 0,
      notes: 0,
      canvases: 0,
      todos: 0,
      templates: 0,
    });
  });

  afterEach(() => {
    GitSyncGate.__resetForTest();
  });

  test.each(ALL_SOURCES.map((source) => [source]))(
    'cycle op carries the source it was acquired with (%s)',
    async (source) => {
      const release = await GitSyncGate.acquireCycle(source);
      expect(cycleOp()).toMatchObject({
        kind: 'pull',
        repo: GIT_OP_ALL_REPOS,
        status: 'running',
        source,
      });

      release();
      expect(cycleOp()).toBeUndefined();
    },
  );

  test('FIFO hand-off publishes the waiting cycle source, not the previous holder', async () => {
    const releaseFirst = await GitSyncGate.acquireCycle('save');
    expect(cycleOp()?.source).toBe('save');

    const waiterAcquired = GitSyncGate.acquireCycle('idle');
    releaseFirst();

    const releaseWaiter = await waiterAcquired;
    expect(cycleOp()).toMatchObject({ status: 'running', source: 'idle' });

    releaseWaiter();
    expect(cycleOp()).toBeUndefined();
  });

  describe('syncNow source threading', () => {
    test('syncNow without an explicit source publishes a manual cycle', async () => {
      let seenSourceDuringPull: unknown = 'not-inspected';
      (pullAllFromRepos as jest.Mock).mockImplementation(async () => {
        seenSourceDuringPull = cycleOp()?.source;
        return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
      });

      const result = await syncNow();

      expect(result).toEqual({ ok: true });
      expect(seenSourceDuringPull).toBe('manual');
      expect(cycleOp()).toBeUndefined();
    });

    test('syncNow honors an explicit source option (startup pulls stay non-blocking)', async () => {
      let seenSourceDuringPull: unknown = 'not-inspected';
      (pullAllFromRepos as jest.Mock).mockImplementation(async () => {
        seenSourceDuringPull = cycleOp()?.source;
        return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
      });

      const result = await syncNow({ source: 'startup' });

      expect(result).toEqual({ ok: true });
      expect(seenSourceDuringPull).toBe('startup');
    });
  });

  describe('StartupSyncGate', () => {
    test('mount and AppState-active pulls tag their cycles startup, not manual', async () => {
      const sourcesSeen: unknown[] = [];
      (pullAllFromRepos as jest.Mock).mockImplementation(async () => {
        sourcesSeen.push(cycleOp()?.source);
        return { repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 };
      });
      mockAppStateListener = null;

      render(
        <StartupSyncGate>
          <View testID="child" />
        </StartupSyncGate>,
      );

      // Mount/signature pull (StartupSyncGate.tsx first effect).
      await waitFor(() => expect(sourcesSeen).toHaveLength(1));

      // Background → foreground drainAndPull path (second effect).
      expect(mockAppStateListener).not.toBeNull();
      mockAppStateListener?.('active');
      await waitFor(() => expect(sourcesSeen).toHaveLength(2));

      expect(sourcesSeen).toEqual(['startup', 'startup']);
      expect(cycleOp()).toBeUndefined();
    });
  });
});
