import { renderHook, act } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

jest.mock('../../src/services/git/StagingService', () => ({
  StagingService: { stageUpsert: jest.fn() },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueue: jest.fn(), enqueueNoteUpsert: jest.fn() },
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';
import { StagingService } from '../../src/services/git/StagingService';

const baseParams = {
  initialFormat: 'markdown' as const,
  activeAccountId: null,
  repositories: [],
  folders: [],
  createNote: jest.fn(),
  updateNote: jest.fn(),
  navigation: { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() } as any,
};

describe('useNoteEditorDocument notFound (issue #669)', () => {
  test('notFound true when noteId provided but getNoteById returns undefined', () => {
    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        noteId: 'bogus-id-xyz',
        getNoteById: () => undefined,
      }),
    );
    expect(result.current.notFound).toBe(true);
  });

  test('notFound false when noteId provided and note exists', () => {
    const fakeNote = {
      id: 'real-id',
      title: 'Hello',
      content: 'world',
      filePath: 'notes/hello.md',
      folderPath: undefined,
      format: 'markdown' as const,
      repo: 'owner/repo',
      branch: 'main',
      commit: 'abc',
      github: undefined,
      accountId: undefined,
      tags: [],
      attachments: [],
      createdAt: 0,
      updatedAt: 0,
    } as any;

    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        noteId: 'real-id',
        getNoteById: (id) => (id === 'real-id' ? fakeNote : undefined),
      }),
    );
    expect(result.current.notFound).toBe(false);
  });

  test('notFound false when no noteId provided (creating a new note)', () => {
    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        noteId: undefined,
        getNoteById: () => undefined,
      }),
    );
    expect(result.current.notFound).toBe(false);
  });

  test('shows actionable auth failure and does not enqueue the locally saved note', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockRejectedValue(new Error('GitHub not authenticated'));
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));

    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        initialRepo: 'owner/repo',
        initialTitle: 'A note',
        createNote,
        getNoteById: () => undefined,
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Authentication Required',
      'Reconnect your GitHub account in Settings',
      [{ text: 'OK' }],
    );
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('shows the repository permission alert for a generic 403 stage failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockRejectedValue(
      Object.assign(new Error('Permission denied'), { status: 403 }),
    );
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));

    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        initialRepo: 'owner/repo',
        initialTitle: 'A note',
        createNote,
        getNoteById: () => undefined,
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Permission Required',
      'This token cannot write to this repository. Check repository permissions in Settings.',
      [{ text: 'OK' }],
    );
    expect(NoteSyncQueueService.enqueueNoteUpsert).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  test('enqueues the locally saved note when stageUpsert returns success:false (never orphans it)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Clone write failed',
    });
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));

    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        initialRepo: 'owner/repo',
        initialTitle: 'A note',
        createNote,
        getNoteById: () => undefined,
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(NoteSyncQueueService.enqueueNoteUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        repo: 'owner/repo',
        title: 'A note',
      }),
      'new-note-1',
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Note Saved Locally',
      expect.stringContaining('will sync automatically'),
      [{ text: 'OK' }],
    );
    alertSpy.mockRestore();
  });

  test('shows Save Failed when stageUpsert returns success:false and even queuing fails', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    (StagingService.stageUpsert as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Clone write failed',
    });
    (NoteSyncQueueService.enqueueNoteUpsert as jest.Mock).mockRejectedValue(new Error('queue full'));
    const createNote = jest.fn(async () => ({ id: 'new-note-1' }));

    const { result } = renderHook(() =>
      useNoteEditorDocument({
        ...baseParams,
        initialRepo: 'owner/repo',
        initialTitle: 'A note',
        createNote,
        getNoteById: () => undefined,
      }),
    );

    await act(async () => {
      await result.current.handleSave();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      'Save Failed',
      'Your note was saved locally but could not be queued for sync. Please try again.',
      [{ text: 'OK' }],
    );
    alertSpy.mockRestore();
  });
});
