import type { Note } from '@/models/Note';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useNoteEditorDocument } from '@/components/editor/useNoteEditorDocument';

jest.mock('@/services/LastSelectionPreferenceService', () => ({
  LastSelectionPreferenceService: {
    get: jest.fn(),
    set: jest.fn(),
  },
}));

jest.mock('@/services/git/defaultsPolicy', () => ({
  resolveDefaultFolder: jest.fn(() => 'notes/'),
  resolveDefaultRepo: jest.fn(),
  resolveDefaultBranch: jest.fn(),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/services/GitService', () => ({
  GitService: {
    getBranches: jest.fn().mockResolvedValue([{ name: 'main', isCurrent: true }]),
    getRepositoryFolders: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/utils/useUndo', () => ({
  useUndo: (initial: string) => ({
    state: initial,
    setState: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
    canUndo: false,
    canRedo: false,
  }),
}));

jest.mock('@/hooks/useHardWrap', () => ({
  useHardWrap: () => ({ hardWrapEnabled: false }),
  applyHardWrap: (content: string) => content,
}));

jest.mock('expo-image-picker', () => ({}));

jest.mock('@/stores/noteStore', () => ({
  useNoteStore: {
    getState: jest.fn(() => ({
      upsertNote: jest.fn().mockResolvedValue({ success: true }),
    })),
  },
}));

jest.mock('@/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
}));

jest.mock('@/stores/gitOperationStore', () => ({
  gitOperationRegistry: {
    begin: jest.fn(() => 'test-op'),
    fail: jest.fn(),
    succeed: jest.fn(),
  },
  useGitOperationStore: {
    getState: jest.fn(() => ({
      ops: [],
    })),
  },
  GIT_OP_ALL_REPOS: 'all',
}));

jest.mock('@/services/cloneSyncServiceImpl', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(),
    onMutationSucceeded: jest.fn(),
    onDroppedMutation: jest.fn(),
  },
}));

interface CreateParamsOptions {
  noteId?: string;
  initialFormat?: 'markdown' | 'neorg' | 'org' | 'pdf' | 'json';
  initialTitle?: string;
  initialContent?: string;
  initialTags?: string[];
  initialRepo?: string;
  initialBranch?: string;
  initialFolderPath?: string;
  activeAccountId?: string | null;
  repositories?: { path: string; branch: string }[];
  folders?: unknown[];
  notes?: Note[];
  getNoteById?: (id: string) => Note | undefined;
  createNote?: (...args: unknown[]) => Promise<unknown>;
  updateNote?: (...args: unknown[]) => Promise<unknown>;
  navigation?: unknown;
}

function createParams(overrides: CreateParamsOptions = {}) {
  const getNoteById = overrides.getNoteById ?? jest.fn();
  return {
    noteId: overrides.noteId ?? undefined,
    initialFormat: overrides.initialFormat ?? 'markdown',
    initialTitle: overrides.initialTitle ?? '',
    initialContent: overrides.initialContent ?? '',
    initialTags: overrides.initialTags ?? [],
    initialRepo: overrides.initialRepo ?? 'owner/repo',
    initialBranch: overrides.initialBranch ?? 'main',
    initialFolderPath: overrides.initialFolderPath ?? undefined,
    activeAccountId: overrides.activeAccountId ?? 'account-1',
    repositories: overrides.repositories ?? [{ path: 'owner/repo', branch: 'main' }],
    folders: overrides.folders ?? [],
    notes: overrides.notes ?? [],
    getNoteById,
    createNote: overrides.createNote ?? jest.fn().mockResolvedValue({ id: 'new-note-id' }),
    updateNote: overrides.updateNote ?? jest.fn().mockResolvedValue(true),
    navigation: overrides.navigation ?? { navigate: jest.fn(), goBack: jest.fn() },
  };
}

function createExistingNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    title: 'Test Note',
    content: 'Test content',
    createdAt: 1,
    updatedAt: 1,
    tags: [],
    repo: 'owner/repo',
    branch: 'main',
    folderPath: undefined,
    filePath: 'notes/test.md',
    ...overrides,
  };
}

describe('useNoteEditorDocument folderPath defaults', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('new note defaults folderPath to notes (normalized from notes/)', async () => {
    const { result } = renderHook(() => useNoteEditorDocument(createParams()));
    expect(result.current.folderPath).toBe('notes');
  });

  it('new note respects explicit initialFolderPath', async () => {
    const params = createParams({ initialFolderPath: '/Work' });
    const { result } = renderHook(() => useNoteEditorDocument(params));
    expect(result.current.folderPath).toBe('/Work');
  });

  it('existing note uses explicit folderPath when provided', async () => {
    const existingNote = createExistingNote({ folderPath: '/Work' });
    const params = createParams({
      noteId: 'note-1',
      getNoteById: jest.fn(() => existingNote),
    });
    const { result } = renderHook(() => useNoteEditorDocument(params));

    await waitFor(() => {
      expect(result.current.folderPath).toBe('/Work');
    });
  });

  it('existing note derives folderPath from filePath when no folderPath', async () => {
    const existingNote = createExistingNote({
      folderPath: undefined,
      filePath: 'notes/imported.md',
    });
    const params = createParams({
      noteId: 'note-1',
      getNoteById: jest.fn(() => existingNote),
    });
    const { result } = renderHook(() => useNoteEditorDocument(params));

    await waitFor(() => {
      expect(result.current.folderPath).toBe('notes');
    });
  });

  it('existing note with root-level filePath sets folderPath to undefined', async () => {
    const existingNote = createExistingNote({
      folderPath: undefined,
      filePath: 'imported.md',
    });
    const params = createParams({
      noteId: 'note-1',
      getNoteById: jest.fn(() => existingNote),
    });
    const { result } = renderHook(() => useNoteEditorDocument(params));

    // deriveFolderPath('imported.md') returns undefined, so setFolderPath(undefined) is called
    await waitFor(() => {
      expect(result.current.folderPath).toBeUndefined();
    });
  });

  it('cancel edit restores folderPath for existing note', async () => {
    const existingNote = createExistingNote({
      folderPath: undefined,
      filePath: 'notes/cancel.md',
    });
    const getNoteById = jest.fn(() => existingNote);
    const params = createParams({
      noteId: 'note-1',
      getNoteById,
      initialTitle: 'Some Title',
      initialContent: 'Some content',
    });
    const { result } = renderHook(() => useNoteEditorDocument(params));

    await waitFor(() => {
      expect(result.current.folderPath).toBe('notes');
    });

    // Trigger a change so hasChanges is true — required for Alert to fire on cancel
    await act(async () => {
      result.current.handleTitleChange('Modified Title');
    });

    // Simulate cancel — the Alert callback restores from existingNote
    const { Alert } = require('react-native');
    const alertSpy = jest.spyOn(Alert, 'alert');
    result.current.handleCancelEdit();

    // Find the destructive "Discard" button callback and invoke it
    const alertCalls = alertSpy.mock.calls;
    expect(alertCalls.length).toBe(1);
    const buttons = alertCalls[0][2];
    const discardAction = buttons.find((b: { style?: string }) => b.style === 'destructive');
    expect(discardAction).toBeDefined();
    await act(async () => {
      discardAction.onPress();
    });

    // After cancel, folderPath should be restored to 'notes' (from filePath 'notes/cancel.md')
    expect(result.current.folderPath).toBe('notes');
  });
});
