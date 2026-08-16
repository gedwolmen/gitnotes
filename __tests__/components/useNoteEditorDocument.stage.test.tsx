import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../src/navigation/types';

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
  FEATURE_STAGE_PUSH: false,
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';
import { syncNoteToGitHub } from '../../src/services/NoteGitHubSyncService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { StagingService } from '../../src/services/git/StagingService';

const featureFlagsMock = jest.requireMock('../../src/services/featureFlags') as {
  FEATURE_STAGE_PUSH: boolean;
};

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

describe('useNoteEditorDocument stage-push rework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    featureFlagsMock.FEATURE_STAGE_PUSH = false;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('with FEATURE_STAGE_PUSH ON: stages the upsert and never calls syncNoteToGitHub', async () => {
    featureFlagsMock.FEATURE_STAGE_PUSH = true;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));
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
    expect(StagingService.stageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: '/notes/my-note.md',
        title: 'My Note',
        content: 'body',
        format: 'markdown',
      }),
    );
    expect(syncNoteToGitHub).not.toHaveBeenCalled();
    // On success the staged path is persisted back to the local note.
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-note-1', filePath: '/notes/my-note.md' }),
    );
  });

  it('with FEATURE_STAGE_PUSH OFF: old path is unchanged (syncNoteToGitHub called, stageUpsert not)', async () => {
    featureFlagsMock.FEATURE_STAGE_PUSH = false;
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (syncNoteToGitHub as jest.Mock).mockResolvedValue({
      success: true,
      filePath: 'notes/my-note.md',
      finalContent: null,
    });
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));
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

    expect(syncNoteToGitHub).toHaveBeenCalledTimes(1);
    expect(syncNoteToGitHub).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        branch: 'main',
        filePath: '/notes/my-note.md',
        title: 'My Note',
      }),
    );
    expect(StagingService.stageUpsert).not.toHaveBeenCalled();
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-note-1', filePath: 'notes/my-note.md' }),
    );
  });

  it('with FEATURE_STAGE_PUSH ON and a failing stage: falls back to the sync queue with the "Note Saved Locally" alert', async () => {
    featureFlagsMock.FEATURE_STAGE_PUSH = true;
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: false, error: 'staging boom' });
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));

    const { result } = renderHook(() =>
      useNoteEditorDocument(
        editorParams({
          initialRepo: 'owner/repo',
          initialBranch: 'main',
          initialTitle: 'My Note',
          initialContent: 'body',
          initialFolderPath: '/notes',
          createNote,
          updateNote: jest.fn(async () => true),
          getNoteById: () => undefined,
        }),
      ),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
    expect(syncNoteToGitHub).not.toHaveBeenCalled();
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      'Note Saved Locally',
      'Your note was saved but could not be pushed to GitHub yet. It will sync automatically when connection is restored.',
      [{ text: 'OK' }],
    );
    alertSpy.mockRestore();
  });
});
