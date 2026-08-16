import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent } from '@testing-library/react-native';
import type { Note, NoteUpdateInput } from '../src/models/Note';
import type { ConflictSet } from '../src/services/conflict/types';
import { useNoteStore } from '../src/stores/noteStore';
import { useGitOperationStore } from '../src/stores/gitOperationStore';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';
import { SyncEngineService } from '../src/services/SyncEngineService';
import { StorageService } from '../src/services/StorageService';
import { StagingService } from '../src/services/git/StagingService';
import { GitFsService } from '../src/services/git/GitFsService';
import { executeToolCall } from '../src/services/ai/actionExecutor';
import { renderWithTheme } from './helpers/renderWithTheme';
import ConflictResolverScreen from '../src/screens/ConflictResolverScreen';

jest.mock('../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteDelete: jest.fn(async () => undefined),
    enqueueNoteDeletes: jest.fn(async () => undefined),
    enqueueNoteUpsert: jest.fn(async () => undefined),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
    onMutationSucceeded: jest.fn(() => jest.fn()),
    onDroppedMutation: jest.fn(() => jest.fn()),
  },
}));

jest.mock('../src/services/git/StagingService', () => ({
  StagingService: { stageDelete: jest.fn(), stageUpsert: jest.fn() },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    deleteNote: jest.fn(async () => true),
    getAllNotes: jest.fn(async () => []),
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/git/GitFsService', () => ({
  GitFsService: { mergeCommit: jest.fn() },
}));

jest.mock('../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    writeAndCommit: jest.fn(async () => ({ success: true })),
    deleteAndCommit: jest.fn(async () => ({ success: true })),
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => null), getUser: jest.fn(async () => null) },
}));

jest.mock('../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({ id: 'mock-model' })),
}));

jest.mock('ai', () => ({
  generateText: jest.fn(async () => ({ text: 'Looks correct.' })),
}));

jest.mock('../src/services/conflict/ConflictResolverService', () => ({
  ConflictResolverService: {
    applyResolution: (
      conflictSet: ConflictSet,
      filePath: string,
      resolution: { content: string | null },
    ) => ({
      ...conflictSet,
      files: conflictSet.files.map((f) =>
        f.path === filePath ? { ...f, mergedContent: resolution.content, autoResolved: true } : f,
      ),
    }),
    isFullyResolved: (conflictSet: ConflictSet) => conflictSet.files.every((f) => f.autoResolved),
  },
}));

jest.mock('../src/stores/conflictStore', () => {
  const api = {
    getConflict: jest.fn(),
    updateConflict: jest.fn(async () => undefined),
    removeConflict: jest.fn(async () => undefined),
  };
  return {
    useConflictStore: (selector: (state: typeof api) => unknown) => selector(api),
    __api: api,
  };
});

jest.mock('../src/stores/todoStore', () => {
  const state = {
    todos: [],
    createTodo: jest.fn(async () => ({ id: 'new-todo' })),
    updateTodo: jest.fn(async () => ({ id: 'updated' })),
    deleteTodo: jest.fn(async () => true),
  };
  return { useTodoStore: { getState: () => state } };
});

jest.mock('../src/stores/aiStore', () => {
  const aiState = {
    chatRepoOwner: 'owner',
    chatRepoName: 'repo',
    chatRepoBranch: 'main',
    getSelectedModel: jest.fn(() => ({ id: 'm1', providerId: 'p1' })),
    providers: [{ id: 'p1' }],
    githubToolsEnabled: true,
  };
  return {
    useAIStore: Object.assign(
      (selector: (state: typeof aiState) => unknown) => selector(aiState),
      { getState: () => aiState },
    ),
  };
});

jest.mock('../src/components/ui', () => {
  const ReactMock = require('react');
  const { View, Text } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) =>
      ReactMock.createElement(View, null, ReactMock.createElement(Text, null, title)),
  };
});

jest.mock('../src/components/ui/SafeAreaView', () => {
  const ReactMock = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children }: { children?: React.ReactNode }) =>
      ReactMock.createElement(View, null, children),
  };
});

jest.mock('@react-navigation/native', () => {
  const goBack = jest.fn();
  return {
    useNavigation: () => ({ goBack }),
    useRoute: () => ({ params: { repoPath: 'owner/repo', branch: 'main', filePath: 'notes/conflict.md' } }),
    __goBack: goBack,
  };
});

jest.mock('@react-navigation/native-stack', () => ({}));

interface ConflictApi {
  getConflict: jest.Mock;
  updateConflict: jest.Mock;
  removeConflict: jest.Mock;
}

const conflictApi = (jest.requireMock('../src/stores/conflictStore') as { __api: ConflictApi }).__api;
const navMock = (jest.requireMock('@react-navigation/native') as { __goBack: jest.Mock }).__goBack;

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'Test Note',
    content: 'body',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    format: 'markdown',
    ...overrides,
  };
}

const conflictFixture: ConflictSet = {
  repoPath: 'owner/repo',
  branch: 'main',
  localRef: 'refs/heads/main',
  remoteRef: 'refs/remotes/origin/main',
  mergeBaseRef: 'refs/remotes/origin/main',
  files: [
    {
      path: 'notes/conflict.md',
      kind: 'both-changed-different',
      format: 'text',
      localContent: 'local',
      remoteContent: 'remote',
      baseContent: 'base',
      mergedContent: 'merged content',
      localSha: 'aaa',
      remoteSha: 'bbb',
      autoResolved: true,
    },
  ],
  detectedAt: 1,
};

async function pressCommitAndPushButton(): Promise<void> {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  const buttons = lastCall[2] as Array<{ text?: string; onPress?: () => void | Promise<void> }>;
  const commit = buttons.find((b) => b.text === 'Commit & Push');
  await act(async () => {
    await commit?.onPress?.();
  });
}

describe('noteStore.deleteNote staging rewire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
    useGitOperationStore.setState({ ops: {} });
  });

  it('api mode: stages the delete, keeps the row locked, never drains directly', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    (StagingService.stageDelete as jest.Mock).mockResolvedValue({ success: true });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: 'n1',
          title: 'Delete me',
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/delete-me.md',
        }),
      ],
    });

    const ok = await useNoteStore.getState().deleteNote('n1');

    expect(ok).toBe(true);
    expect(StagingService.stageDelete).toHaveBeenCalledTimes(1);
    expect(StagingService.stageDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/delete-me.md',
        title: 'Delete me',
        localNoteId: 'n1',
      }),
    );
    expect(NoteSyncQueueService.enqueueNoteDelete).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
    // Api mode keeps the row visible-but-locked until the queue reports
    // success (the completion handlers remove it on mutation.succeeded).
    expect(useNoteStore.getState().notes).toHaveLength(1);
    expect(StorageService.deleteNote).not.toHaveBeenCalled();
    const ops = Object.values(useGitOperationStore.getState().ops);
    expect(ops).toHaveLength(1);
    expect(ops[0].kind).toBe('delete');
    expect(ops[0].status).toBe('running');
  });

  it('clone mode: completes the local delete immediately (no queue mutation exists)', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (StagingService.stageDelete as jest.Mock).mockResolvedValue({ success: true });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: 'c1',
          title: 'Clone delete',
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/clone.md',
        }),
      ],
    });

    const ok = await useNoteStore.getState().deleteNote('c1');

    expect(ok).toBe(true);
    expect(StagingService.stageDelete).toHaveBeenCalledTimes(1);
    expect(StagingService.stageDelete).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: 'notes/clone.md',
        title: 'Clone delete',
        localNoteId: 'c1',
      }),
    );
    // The delete is committed in the clone working tree with no queue
    // mutation, so the row is removed now and the op lifecycle closes.
    expect(StorageService.deleteNote).toHaveBeenCalledWith('c1');
    expect(useNoteStore.getState().notes).toHaveLength(0);
    expect(useGitOperationStore.getState().ops).toEqual({});
    expect(NoteSyncQueueService.enqueueNoteDelete).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });

  it('a failing stage surfaces the error and does not enqueue/drain', async () => {
    (StagingService.stageDelete as jest.Mock).mockResolvedValue({ success: false, error: 'staging boom' });
    useNoteStore.setState({
      notes: [
        makeNote({
          id: 'n3',
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/three.md',
        }),
      ],
    });

    const ok = await useNoteStore.getState().deleteNote('n3');

    expect(ok).toBe(false);
    expect(useNoteStore.getState().error).toBe('staging boom');
    expect(NoteSyncQueueService.enqueueNoteDelete).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });
});

describe('AI tool saves staging rewire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
  });

  it('create_note enqueues without calling drain directly', async () => {
    useNoteStore.setState({
      createNote: jest.fn(async (input: unknown) => ({ id: 'new-note', ...(input as object) })),
    });

    const result = await executeToolCall('create_note', { title: 'T', content: 'C' }, 'auto');

    expect(result.success).toBe(true);
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ repo: 'owner/repo', branch: 'main', title: 'T', content: 'C' }),
      'new-note',
    );
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });

  it('link_notes enqueues each link without draining', async () => {
    useNoteStore.setState({
      notes: [
        makeNote({ id: 'a', title: 'A', repo: 'owner/repo', branch: 'main', filePath: 'notes/a.md' }),
        makeNote({ id: 'b', title: 'B', repo: 'owner/repo', branch: 'main', filePath: 'notes/b.md' }),
      ],
      updateNote: jest.fn(async (input: NoteUpdateInput) => {
        const existing = useNoteStore.getState().getNoteById(input.id);
        if (!existing) return null;
        return { ...existing, ...input, updatedAt: Date.now() };
      }),
    });

    const result = await executeToolCall('link_notes', { noteIds: ['a', 'b'] }, 'auto');

    expect(result.success).toBe(true);
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(2);
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });

  it('grade_questioner_answers enqueues without draining', async () => {
    useNoteStore.setState({
      notes: [
        makeNote({
          id: 'g1',
          title: 'Quiz',
          content: 'Q1?',
          tags: ['questioner'],
          repo: 'owner/repo',
          branch: 'main',
          filePath: 'notes/quiz.md',
        }),
      ],
      updateNote: jest.fn(async (input: NoteUpdateInput) => {
        const existing = useNoteStore.getState().getNoteById(input.id);
        if (!existing) return null;
        return { ...existing, ...input, updatedAt: Date.now() };
      }),
    });

    const result = await executeToolCall('grade_questioner_answers', { noteId: 'g1' }, 'auto');

    expect(result.success).toBe(true);
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });
});

describe('ConflictResolverScreen commitAndPush staging rewire', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    conflictApi.getConflict.mockReturnValue(conflictFixture);
    (GitFsService.mergeCommit as jest.Mock).mockResolvedValue({ sha: 'merged-sha' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('mergeCommit is called with push:false and no immediate push happens', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    const screen = renderWithTheme(React.createElement(ConflictResolverScreen));
    fireEvent.press(screen.getByText('Save merged'));
    await pressCommitAndPushButton();

    expect(GitFsService.mergeCommit).toHaveBeenCalledTimes(1);
    expect(GitFsService.mergeCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: 'owner/repo',
        branch: 'main',
        oursRef: 'refs/heads/main',
        theirsRef: 'refs/remotes/origin/main',
        push: false,
      }),
    );
    expect(conflictApi.removeConflict).toHaveBeenCalledWith('owner/repo', 'main');
    expect(navMock).toHaveBeenCalled();
  });
});
