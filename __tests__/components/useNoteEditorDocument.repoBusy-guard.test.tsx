import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../src/navigation/types';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';
import type { GitOpBeginInput } from '../../src/stores/gitOperationStore';

jest.mock('expo-image-picker', () => ({}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    commit: jest.fn(),
    push: jest.fn(),
    getBranches: jest.fn(async () => []),
    getRepositoryFolders: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueueNoteUpsert: jest.fn(async () => undefined) },
}));

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: { stageUpsert: jest.fn() },
}));

jest.mock('../../src/services/featureFlags', () => ({
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';
import { StagingService } from '../../src/services/git/StagingService';

const navigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
} as unknown as NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

const baseParams = {
  initialFormat: 'markdown' as const,
  activeAccountId: null,
  repositories: [],
  folders: [],
  createNote: jest.fn(),
  updateNote: jest.fn(),
  navigation,
};

function editorParams(overrides: Record<string, unknown>) {
  return {
    ...baseParams,
    ...overrides,
  };
}

function beginOp(input: Omit<GitOpBeginInput, 'attempts'> & { status?: 'queued' | 'running' }) {
  return useGitOperationStore.getState().begin({ ...input, attempts: 0 });
}

describe('useNoteEditorDocument repoBusy guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset store to clean state.
    const ids = Object.keys(useGitOperationStore.getState().ops);
    for (const id of ids) useGitOperationStore.getState().succeed(id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('skips save and shows alert when repo has an active push op', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });

    beginOp({
      kind: 'push',
      repo: 'owner/repo',
      entityIds: [],
      status: 'running',
    });

    const createNote = jest.fn(async () => ({ id: 'note-1' }));
    const updateNote = jest.fn(async () => true);

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'My Note',
          initialContent: 'body',
          createNote,
          updateNote,
          getNoteById: () => undefined,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(StagingService.stageUpsert).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('skips save and shows alert when repo has an active pull op', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });

    beginOp({
      kind: 'pull',
      repo: 'owner/repo',
      entityIds: [],
      status: 'queued',
    });

    const createNote = jest.fn(async () => ({ id: 'note-1' }));
    const updateNote = jest.fn(async () => true);

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'My Note',
          initialContent: 'body',
          createNote,
          updateNote,
          getNoteById: () => undefined,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalled();
    expect(StagingService.stageUpsert).not.toHaveBeenCalled();
    expect(createNote).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('proceeds with save when no active ops exist', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    const createNote = jest.fn(async () => ({ id: 'note-1' }));
    const updateNote = jest.fn(async () => true);

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'My Note',
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

    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
  });

  it('proceeds with save when only a repo=* cycle op is active', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    const createNote = jest.fn(async () => ({ id: 'note-1' }));
    const updateNote = jest.fn(async () => true);

    beginOp({
      kind: 'pull',
      repo: '*',
      entityIds: [],
      status: 'running',
    });

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'My Note',
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

    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
  });
});
