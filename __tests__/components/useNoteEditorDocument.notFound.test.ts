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

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { enqueue: jest.fn(), enqueueNoteUpsert: jest.fn() },
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: { selection: jest.fn(), success: jest.fn(), error: jest.fn() },
}));

import { useNoteEditorDocument } from '../../src/components/editor/useNoteEditorDocument';
import { NoteSyncQueueService } from '../../src/services/NoteSyncQueueService';

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
});
