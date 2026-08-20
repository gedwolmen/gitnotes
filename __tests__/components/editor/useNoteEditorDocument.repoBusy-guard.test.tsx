import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../src/navigation/types';
import type { GitOp } from '../../../src/stores/gitOperationStore';

jest.mock('expo-image-picker', () => ({}));

jest.mock('../../../src/services/GitService', () => ({
  GitService: {
    commit: jest.fn(),
    push: jest.fn(),
    getBranches: jest.fn(async () => []),
    getRepositoryFolders: jest.fn(async () => []),
  },
}));

jest.mock('../../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueueNoteUpsert: jest.fn(async () => undefined) },
}));

jest.mock('../../../src/services/git/StagingService', () => ({
  StagingService: { stageUpsert: jest.fn() },
}));

jest.mock('../../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

let mockOps: Record<string, GitOp> = {};

jest.mock('../../../src/stores/gitOperationStore', () => ({
  useGitOperationStore: Object.assign(
    (selector: (s: { ops: Record<string, GitOp> }) => unknown) =>
      selector({ ops: mockOps }),
    { getState: () => ({ ops: mockOps }) },
  ),
  gitOperationRegistry: {
    begin: jest.fn(() => 'op-1'),
    succeed: jest.fn(),
    fail: jest.fn(),
  },
  GIT_OP_ALL_REPOS: '*',
}));

jest.mock('../../../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
}));

import { useNoteEditorDocument } from '../../../src/components/editor/useNoteEditorDocument';
import { StagingService } from '../../../src/services/git/StagingService';

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

function editorParams(overrides: Record<string, unknown> = {}) {
  return {
    initialFormat: 'markdown' as const,
    activeAccountId: null,
    repositories: [],
    folders: [],
    notes: [],
    createNote: jest.fn(async () => ({ id: 'new-note' })),
    updateNote: jest.fn(async () => true),
    navigation,
    ...overrides,
  };
}

function pushOp(repo: string, status: 'queued' | 'running' = 'running'): GitOp {
  return {
    id: `op-push-${Date.now()}`,
    kind: 'push',
    repo,
    entityIds: [],
    status,
    attempts: 0,
    createdAt: Date.now(),
  };
}

function pullOp(repo: string, status: 'queued' | 'running' = 'running'): GitOp {
  return {
    id: `op-pull-${Date.now()}`,
    kind: 'pull',
    repo,
    entityIds: [],
    status,
    attempts: 0,
    createdAt: Date.now(),
  };
}

function cycleOp(source?: string): GitOp {
  return {
    id: `op-cycle-${Date.now()}`,
    kind: 'pull',
    repo: '*',
    entityIds: [],
    status: 'running',
    attempts: 0,
    createdAt: Date.now(),
    source: source as GitOp['source'],
  };
}

describe('useNoteEditorDocument — repo-scoped busy guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOps = {};
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('blocks save when the same repo has an active push', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    mockOps = { 'op-1': pushOp('owner/repo', 'running') };

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'Test',
          initialContent: 'body',
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Error',
      'Repository is syncing. Please try again in a moment.',
    );
    expect(StagingService.stageUpsert).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('blocks save when the same repo has an active pull', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    mockOps = { 'op-1': pullOp('owner/repo', 'queued') };

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'Test',
          initialContent: 'body',
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Error',
      'Repository is syncing. Please try again in a moment.',
    );
    expect(StagingService.stageUpsert).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('proceeds with save when no active ops exist', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const createNote = jest.fn(async () => ({ id: 'new-note' }));
    const updateNote = jest.fn(async () => true);
    mockOps = {};

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'Test',
          initialContent: 'body',
          initialFolderPath: '/notes',
          createNote,
          updateNote,
          getNoteById: () => undefined,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).not.toHaveBeenCalledWith(
      'Error',
      'Repository is syncing. Please try again in a moment.',
    );
    expect(createNote).toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('does NOT block save when repo==="*" cycle op is active', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const createNote = jest.fn(async () => ({ id: 'new-note' }));
    const updateNote = jest.fn(async () => true);
    mockOps = { 'op-1': cycleOp('save') };

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'Test',
          initialContent: 'body',
          initialFolderPath: '/notes',
          createNote,
          updateNote,
          getNoteById: () => undefined,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).not.toHaveBeenCalledWith(
      'Error',
      'Repository is syncing. Please try again in a moment.',
    );
    expect(createNote).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
