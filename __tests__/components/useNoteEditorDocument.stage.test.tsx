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
  FEATURE_USE_MULTI_HOST_WRITE: false,
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';
import { syncNoteToGitHub } from '../../src/services/NoteGitHubSyncService';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
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

const SAVED_LOCALLY_TITLE = 'Note Saved Locally';
const SAVED_LOCALLY_BODY =
  'Your note was saved but could not be pushed to GitHub yet. It will sync automatically when connection is restored.';

describe('useNoteEditorDocument stage-push rework', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stages the upsert and never calls syncNoteToGitHub', async () => {
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
    // A successful stage must not re-enqueue or show the fallback toast.
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalledWith(SAVED_LOCALLY_TITLE, SAVED_LOCALLY_BODY, [
      { text: 'OK' },
    ]);
    // On success the staged path is persisted back to the local note.
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-note-1', filePath: '/notes/my-note.md' }),
    );
  });

  it('stages a new root-level note with a real path and no fallback toast', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({ success: true });
    const createNote = jest.fn(async () => ({ id: 'new-root-note' }));
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

    expect(StagingService.stageUpsert).toHaveBeenCalledTimes(1);
    expect(StagingService.stageUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ filePath: 'my-note.md', repo: 'owner/repo', branch: 'main' }),
    );
    // A root note now gets a real syncPath, so metadata is persisted and nothing re-enqueues.
    expect(updateNote).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new-root-note', filePath: 'my-note.md' }),
    );
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalledWith(SAVED_LOCALLY_TITLE, SAVED_LOCALLY_BODY, [
      { text: 'OK' },
    ]);
    alertSpy.mockRestore();
  });

  it('a stage returning success:false enqueues the locally saved note (issue #899)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({
      success: false,
      error: 'staging boom',
    });
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
    // The note was saved locally; a returned failure must never orphan it —
    // fall back to the durable sync queue so it still reaches GitHub.
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(SAVED_LOCALLY_TITLE, SAVED_LOCALLY_BODY, [
      { text: 'OK' },
    ]);
    expect(alertSpy).not.toHaveBeenCalledWith(
      'Save Failed',
      'Your note was saved locally but could not be staged for sync. Please try again.',
      [{ text: 'OK' }],
    );
    expect(warnSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('a throwing stage falls back to the sync queue with the "Note Saved Locally" alert', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockRejectedValue(new Error('network down'));
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
    // A thrown error means staging never enqueued, so one fallback enqueue is correct.
    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(SAVED_LOCALLY_TITLE, SAVED_LOCALLY_BODY, [
      { text: 'OK' },
    ]);
    alertSpy.mockRestore();
  });
});
