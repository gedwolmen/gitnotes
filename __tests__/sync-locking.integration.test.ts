/**
 * Integration scenarios S1–S8 for the git-operation-locking plan.
 *
 * What is REAL (never mocked): NoteSyncQueueService (tombstone / dedup /
 * event / drain logic), gitOperationStore + noteStore + conflictStore,
 * GitSyncGate, deleteFailures helpers, manualSync.syncNow.
 *
 * What is MOCKED (transport only): GitHubService, NoteGitHubSyncService
 * (the per-item Contents-API transport the queue calls), LocalGitWriter,
 * BatchGitOperations.batchDeleteFiles, StorageService, SyncEngineService,
 * AuthService, GitFsService, branch resolution, screen chrome.
 *
 * Each scenario asserts USER-VISIBLE state transitions (row present /
 * locked / removed / failed), not just service call counts.
 */

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getUser: jest.fn(() => ({ login: 'me', name: 'Me', email: 'me@example.com' })),
    getTreeRecursive: jest.fn(),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
    getFileSha: jest.fn(),
    getFileShaCached: jest.fn(),
    getFileShaOrNull: jest.fn(),
    getRepoContents: jest.fn(async () => []),
    deleteFile: jest.fn(),
    updateFile: jest.fn(),
    setToken: jest.fn(),
    getBranchHead: jest.fn(),
    getCommit: jest.fn(),
    getTreeRaw: jest.fn(),
    createTree: jest.fn(),
    createCommit: jest.fn(),
    updateRef: jest.fn(),
  },
}));

jest.mock('../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(),
  deleteNoteFromGitHub: jest.fn(),
}));

jest.mock('../src/services/git/LocalGitWriter', () => ({
  LocalGitWriter: {
    push: jest.fn(),
    writeAndCommit: jest.fn(),
    deleteAndCommit: jest.fn(),
  },
}));

jest.mock('../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(),
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getAllNotes: jest.fn(async () => []),
    saveAllNotes: jest.fn(async () => undefined),
    deleteNote: jest.fn(async () => true),
    getSavedRepositories: jest.fn(async () => []),
    getAllCanvases: jest.fn(async () => []),
    getAllTodos: jest.fn(async () => []),
    updateNote: jest.fn(async () => null),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api'),
    listOverrides: jest.fn(async () => ({})),
  },
}));

jest.mock('../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok'), getTokenById: jest.fn(async () => 'tok') },
}));

jest.mock('../src/services/git/branchResolver', () => ({
  resolveBranch: jest.fn(async (repo: string, hint?: string | null) => hint ?? 'main'),
}));

jest.mock('../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
    getBranches: jest.fn(async () => []),
    getRepositoryFolders: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/git/GitFsService', () => ({
  GitFsService: {
    getCurrentBranch: jest.fn(async () => null),
    isCloned: jest.fn(async () => false),
    clone: jest.fn(async () => undefined),
    fetch: jest.fn(async () => undefined),
    pullWithFastForward: jest.fn(async () => ({ ok: true })),
    listTree: jest.fn(async () => []),
    readFile: jest.fn(async () => null),
    findMergeBase: jest.fn(async () => null),
    getCommitOid: jest.fn(async () => null),
    removeRepo: jest.fn(async () => undefined),
    readBlobAtRef: jest.fn(async () => null),
  },
}));

// Keep pullFromSingleRepo (and therefore pullNotesFromRepo reconcile) REAL so
// S6 can prove the tombstone guard; make pullAllFromRepos a spy for S4.
jest.mock('../src/services/RepoPullService', () => {
  const actual = jest.requireActual('../src/services/RepoPullService');
  return {
    ...actual,
    pullAllFromRepos: jest.fn(async () => ({ repos: 0, notes: 0, canvases: 0, todos: 0, templates: 0 })),
  };
});

jest.mock('../src/services/ShareService', () => ({
  ShareService: { shareText: jest.fn(), shareInFormat: jest.fn(async () => true), getAvailableFormats: jest.fn(() => []) },
}));

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
  useRoute: () => ({ params: {} }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../src/contexts/NoteContext', () => {
  const { useNoteStore: store } = jest.requireActual('../src/stores/noteStore');
  return {
    useNotes: () => {
      const notes = store((s) => s.notes);
      const isLoading = store((s) => s.isLoading);
      return {
        notes,
        filteredNotes: notes,
        isLoading,
        searchQuery: '',
        setSearchQuery: jest.fn(),
        deleteNote: (id: string) => store.getState().deleteNote(id),
        refreshNotes: async () => store.getState().refreshNotes(),
        togglePin: async () => true,
        error: null,
        clearError: jest.fn(),
        createNote: jest.fn(),
        updateNote: jest.fn(async (input: any) => store.getState().updateNote(input) ?? null),
        getNoteById: (id: string) => store.getState().getNoteById(id),
      };
    },
  };
});

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [{ path: 'owner/repo', name: 'repo', branch: 'main' }] }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list' as const, setViewMode: jest.fn() }),
}));

jest.mock('../src/contexts/FolderContext', () => ({
  useFolders: () => ({ folders: [] }),
}));

jest.mock('../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({ canvases: [] }),
}));

jest.mock('../src/stores/githubActivityStore', () => {
  const useStore = (() => {
    const hook = () => ({ inflight: 0 });
    (hook as unknown as { getState: () => unknown }).getState = () => ({ inflight: 0 });
    return hook;
  })();
  return {
    githubActivity: { begin: jest.fn(), end: jest.fn(), setProgress: jest.fn() },
    useGitHubActivityStore: useStore,
  };
});

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0, columnCount: 1 }),
}));

jest.mock('../src/components/ui', () => {
  const actual = jest.requireActual('../src/components/ui');
  const ReactMod = require('react');
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ...actual,
    ScreenHeader: ({ title }: { title: string }) => ReactMod.createElement(Text, null, title),
    IconButton: ({ children, onPress }: { children?: React.ReactNode; onPress?: () => void }) =>
      ReactMod.createElement(TouchableOpacity, { onPress }, children),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    EmptyState: () => null,
  };
});

jest.mock('../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/components/ui/ConflictBanner', () => ({ ConflictBanner: () => null }));

jest.mock('../src/components/GitHubActivityIndicator', () => {
  const ReactMod = require('react');
  const { Text } = require('react-native');
  return { GitHubActivityIndicator: () => ReactMod.createElement(Text, null, 'activity') };
});

jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/SortPicker', () => () => null);
jest.mock('../src/components/SearchBar', () => {
  const ReactMod = require('react');
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) =>
    ReactMod.createElement(TextInput, { testID: 'search-bar', value, onChangeText });
});

jest.mock('../src/components/notes/NoteCard', () => {
  const ReactMod = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    NoteCard: ({ note, onPress, onLongPress }: { note: Note; onPress: (n: Note) => void; onLongPress?: (n: Note) => void }) =>
      ReactMod.createElement(
        Pressable,
        {
          testID: `notes-card-${note.id}`,
          onPress: () => onPress(note),
          onLongPress: onLongPress ? () => onLongPress(note) : undefined,
        },
        ReactMod.createElement(Text, null, note.title),
      ),
  };
});

jest.mock('../src/components/notes/NotesListHeader', () => ({ NotesListHeader: () => null }));
jest.mock('../src/components/notes/NotesViewModePicker', () => ({ NotesViewModePicker: () => null }));
jest.mock('../src/components/notes/NotesFilterModal', () => ({ NotesFilterModal: () => null }));
jest.mock('../src/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../src/components/notes/NotesEmptyState', () => ({ NotesEmptyState: () => null }));

jest.mock('../src/components/notes/NotesContextMenu', () => {
  const ReactMod = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    NotesContextMenu: ({ note, onDelete }: { note: Note | null; onDelete: (n: Note) => void }) =>
      note
        ? ReactMod.createElement(
            Pressable,
            { testID: 'notes-context-menu.delete', onPress: () => onDelete(note) },
            ReactMod.createElement(Text, null, 'Delete'),
          )
        : null,
  };
});

jest.mock('../src/components/list/SwipeableListItem', () => {
  const ReactMod = require('react');
  const { Pressable, View } = require('react-native');
  return {
    SwipeableListItem: ({ itemId, disabled, onToggleSelect, children }: any) =>
      ReactMod.createElement(
        View,
        { testID: `swipeable-${itemId}` },
        ReactMod.createElement(
          Pressable,
          {
            testID: `swipeable-select-${itemId}`,
            disabled,
            accessibilityState: { disabled: !!disabled },
            onPress: disabled ? undefined : onToggleSelect,
          },
          ReactMod.createElement(View, null, children),
        ),
      ),
  };
});

jest.mock('../src/components/list/BulkActionBar', () => {
  const ReactMod = require('react');
  const { Pressable, Text } = require('react-native');
  return {
    BulkActionBar: ({ count, onDelete }: { count: number; onDelete: () => void }) =>
      count > 0
        ? ReactMod.createElement(
            Pressable,
            { testID: 'bulk-action-bar.delete', onPress: onDelete },
            ReactMod.createElement(Text, null, `Delete ${count}`),
          )
        : null,
  };
});

jest.mock('@shopify/flash-list', () => {
  const ReactMod = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ReactMod.forwardRef(({ data = [], renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data.length) {
        return ReactMod.createElement(View, { testID: 'flash-list-empty' }, ListEmptyComponent ?? null);
      }
      return ReactMod.createElement(
        View,
        { testID: 'flash-list' },
        data.map((item: any, index: number) => renderItem({ item, index })),
      );
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const ReactMod = require('react');
  const { View } = require('react-native');
  return ReactMod.forwardRef(({ children }: any, _ref: any) => ReactMod.createElement(View, null, children));
});

import React from 'react';
import { Alert, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import NotesListScreen from '../src/screens/NotesListScreen';
import { RepoTreeItem } from '../src/components/repo/RepoTreeItem';
import { TreeNode } from '../src/components/repo/repoTreeShared';
import { Note } from '../src/models/Note';
import { useNoteStore } from '../src/stores/noteStore';
import { useGitOperationStore, hydrate } from '../src/stores/gitOperationStore';
import { useConflictStore } from '../src/stores/conflictStore';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';
import { StorageService } from '../src/services/StorageService';
import { GitHubService } from '../src/services/GitHubService';
import { deleteNoteFromGitHub, syncNoteToGitHub } from '../src/services/NoteGitHubSyncService';
import { LocalGitWriter } from '../src/services/git/LocalGitWriter';
import { batchDeleteFiles } from '../src/services/git/BatchGitOperations';
import { SyncEngineService } from '../src/services/SyncEngineService';
import { GitFsService } from '../src/services/git/GitFsService';
import { StagingService } from '../src/services/git/StagingService';
import { GitSyncGate } from '../src/services/git/GitSyncGate';
import { syncNow } from '../src/services/git/manualSync';
import { pullFromSingleRepo, pullAllFromRepos } from '../src/services/RepoPullService';
import { resolveBranch } from '../src/services/git/branchResolver';
import { HapticService } from '../src/utils/haptics';
import { readDeleteFailures, DELETE_FAILURES_STORAGE_KEY } from '../src/services/git/deleteFailures';
import { retryDeleteFailure } from '../src/services/git/retryDeleteFailure';
import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@gitnotes:sync_queue_v1';
const TOMBSTONE_KEY = '@gitnotes:delete_tombstones_v1';
const TOMBSTONE_TTL_MS = 24 * 60 * 60 * 1_000;

const resolveBranchMock = resolveBranch as jest.Mock;

const createNote = (overrides: Partial<Note> = {}): Note => ({
  id: `note-${Math.random().toString(36).slice(2, 8)}`,
  title: 'Test Note',
  content: 'Test content',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  format: 'markdown',
  ...overrides,
});

async function flushMicrotasks(times = 12): Promise<void> {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
}

let alertSpy: jest.SpyInstance;

function pressAlertButton(label: string): void {
  const calls = alertSpy.mock.calls;
  const latest = calls[calls.length - 1];
  const buttons = (latest?.[2] ?? []) as Array<{ text?: string; onPress?: () => void }>;
  const button = buttons.find((candidate) => candidate.text === label);
  expect(button).toBeDefined();
  act(() => {
    button?.onPress?.();
  });
}

async function pressAlertButtonAsync(label: string): Promise<void> {
  const calls = alertSpy.mock.calls;
  const latest = calls[calls.length - 1];
  const buttons = (latest?.[2] ?? []) as Array<{ text?: string; onPress?: () => void | Promise<void> }>;
  const button = buttons.find((candidate) => candidate.text === label);
  expect(button).toBeDefined();
  await act(async () => {
    await button?.onPress?.();
  });
}

async function flushDeferredMenuAction(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
}

/**
 * Parent wrapper around RepoTreeItem that removes the node on
 * onChildDeleted, so S1 can assert the row is actually GONE.
 */
function RemovableTree({ node }: { node: TreeNode }): React.ReactElement {
  const [removed, setRemoved] = React.useState(false);
  if (removed) return React.createElement(View, { testID: 'tree-empty' });
  return React.createElement(RepoTreeItem, {
    node,
    owner: 'owner',
    repo: 'repo',
    branch: 'main',
    level: 0,
    onFilePress: jest.fn(),
    onRefresh: jest.fn(),
    onChildDeleted: () => setRemoved(true),
  });
}

function renderNotesList(): ReturnType<typeof render> {
  return renderWithTheme(React.createElement(NotesListScreen));
}

const fileNode: TreeNode = { name: 'note.md', path: 'notes/note.md', type: 'file', size: 128 };

describe('sync-locking integration scenarios S1–S8', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    GitSyncGate.__resetForTest();
    useGitOperationStore.setState({ ops: {} });
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
    useConflictStore.setState({ conflicts: [], isLoading: false });
    await AsyncStorage.clear();

    // Default transport behaviors (per-test overrides use mockResolvedValueOnce
    // or full mockImplementation so nothing leaks across tests).
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitHubService.getFileSha as jest.Mock).mockResolvedValue({ kind: 'found', sha: 'default' });
    (GitHubService.deleteFile as jest.Mock).mockResolvedValue({ content: null, commit: { sha: '' } });
    (GitHubService.getRepoContents as jest.Mock).mockResolvedValue([]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(null);
    (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });
    (syncNoteToGitHub as jest.Mock).mockResolvedValue({ success: true, filePath: 'notes/x.md', finalContent: null });
    (LocalGitWriter.push as jest.Mock).mockResolvedValue({ success: true });
    (LocalGitWriter.deleteAndCommit as jest.Mock).mockResolvedValue({ success: true });
    (LocalGitWriter.writeAndCommit as jest.Mock).mockResolvedValue({ success: true, filePath: 'x.md' });
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('api');
    resolveBranchMock.mockImplementation(async (_repo: string, hint?: string | null) => hint ?? 'main');
    (batchDeleteFiles as jest.Mock).mockResolvedValue({ success: true, deleted: [], failed: [] });
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
    (StorageService.saveAllNotes as jest.Mock).mockResolvedValue(undefined);
    (StorageService.deleteNote as jest.Mock).mockResolvedValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([]);
    (StorageService.getAllCanvases as jest.Mock).mockResolvedValue([]);
    (StorageService.getAllTodos as jest.Mock).mockResolvedValue([]);
    (StorageService.updateNote as jest.Mock).mockResolvedValue(null);
    (GitFsService.getCurrentBranch as jest.Mock).mockResolvedValue(null);

    // Re-arm the Alert spy every test: afterEach restoreAllMocks() detaches
    // module-scope spies, so a fresh spy is required per test.
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    // Boot-time hydrate (matches App bootstrap) arms the queue subscription
    // so registry ops re-derive from durable sources on queue churn.
    await hydrate();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('S1 BUG REPRO — repo-tree file delete skips nothing: sha {kind:error} keeps the row (no haptic, no deleteFile); retry with {kind:found} deletes and the row goes away', async () => {
    const successHaptic = jest.spyOn(HapticService, 'success');

    // FIRST attempt: sha lookup errors. The row must stay, no delete, no success haptic.
    (GitHubService.getFileSha as jest.Mock).mockResolvedValueOnce({ kind: 'error', message: 'network' });

    const tree = renderWithTheme(React.createElement(RemovableTree, { node: fileNode }));
    expect(tree.getByText('note.md')).toBeTruthy();

    const rows = tree.getAllByTestId('repo-tree-item.button.file-press');
    fireEvent(rows[rows.length - 1], 'longPress');
    fireEvent.press(tree.getByTestId('context-menu.item.press-delete'));
    await flushDeferredMenuAction();
    pressAlertButton('Delete');

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('Delete Failed', expect.stringContaining('network'));
    });
    // Row is STILL present (the bug was silent removal on lookup error).
    expect(tree.getByText('note.md')).toBeTruthy();
    expect(successHaptic).not.toHaveBeenCalled();
    expect(GitHubService.deleteFile).not.toHaveBeenCalled();
    // Registry op failed (drive the failed affordance) rather than silently succeeding.
    const ops = useGitOperationStore.getState().ops;
    const failedOp = Object.values(ops).find(
      (op) => op.kind === 'delete' && op.repo === 'owner/repo' && op.path === 'notes/note.md',
    );
    expect(failedOp?.status).toBe('failed');
    expect(failedOp?.error).toBe('network');
    expect(GitSyncGate.isPushActive('owner/repo')).toBe(false);

    // SECOND attempt via the failed-row Retry: sha now resolves -> deleteFile -> row gone.
    (GitHubService.getFileSha as jest.Mock).mockResolvedValueOnce({ kind: 'found', sha: 's123' });
    fireEvent.press(tree.getByTestId('repo-tree-item.button.failed'));
    pressAlertButton('Retry');

    await waitFor(() => {
      expect(GitHubService.deleteFile).toHaveBeenCalledWith(
        'owner',
        'repo',
        'notes/note.md',
        'Delete: notes/note.md',
        's123',
        'main',
      );
    });
    await waitFor(() => {
      expect(tree.queryByText('note.md')).toBeNull();
    });
    expect(tree.getByTestId('tree-empty')).toBeTruthy();
    expect(successHaptic).toHaveBeenCalledTimes(1);
    expect(GitSyncGate.isPushActive('owner/repo')).toBe(false);
  });

  it('S2 — note delete writes through: stageDelete drains immediately and removes the row; the succeeded event is idempotent', async () => {
    (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: true });

    const note = createNote({ id: 'n2', title: 'Second', repo: 'owner/repo', branch: 'main', filePath: 'notes/second.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderNotesList();
    expect(screen.getByText('Second')).toBeTruthy();

    fireEvent(screen.getByTestId('notes-card-n2'), 'longPress');
    await act(async () => {
      fireEvent.press(screen.getByTestId('notes-context-menu.delete'));
      await flushMicrotasks(40);
    });

    await waitFor(() => {
      expect(screen.queryByText('Second')).toBeNull();
    }, { timeout: 5000 });
    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();
    expect(StorageService.deleteNote).toHaveBeenCalledWith('n2');
    expect(useNoteStore.getState().notes.some((n) => n.id === 'n2')).toBe(false);

    // Write-through drained the queue during stageDelete; the succeeded
    // event fired and the mutation is gone without a manual drain.
    expect(deleteNoteFromGitHub).toHaveBeenCalledTimes(1);
    expect(await NoteSyncQueueService.pendingCount()).toBe(0);
  }, 15000);

  it('S3 — durable 401 drops with a failure entry; no row-level lock/error UI; retryDeleteFailure clears entry and re-enqueues; tombstone stays pinned past 24h', async () => {
    (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Bad credentials',
      status: 401,
    });

    const note = createNote({ id: 'n3', title: 'Third', repo: 'owner/repo', branch: 'main', filePath: 'notes/third.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderNotesList();
    fireEvent(screen.getByTestId('notes-card-n3'), 'longPress');
    fireEvent.press(screen.getByTestId('notes-context-menu.delete'));

    // Write-through: the durable 401 drops the mutation, so the delete is
    // preserved locally — the row stays (not removed) and no per-row lock UI
    // renders; the failure is recorded for the Stage screen.
    await waitFor(async () => {
      const failures = await readDeleteFailures();
      expect(Object.keys(failures)).toEqual(['owner/repo::main::notes/third.md']);
    });
    expect(screen.getByText('Third')).toBeTruthy();
    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();
    expect(screen.queryByTestId('note-row.lock-error')).toBeNull();
    expect(await NoteSyncQueueService.pendingCount()).toBe(0);

    const failures = await readDeleteFailures();
    expect(failures['owner/repo::main::notes/third.md']).toMatchObject({
      error: 'Bad credentials',
      kind: 'authentication',
    });
    const base = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => base + TOMBSTONE_TTL_MS + 60_000);
    try {
      expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'notes/third.md')).toBe(true);
    } finally {
      nowSpy.mockRestore();
    }

    let resolveRetryDelete: ((value: { success: boolean }) => void) | undefined;
    (deleteNoteFromGitHub as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolveRetryDelete = res; }),
    );
    await retryDeleteFailure('owner/repo', 'main', 'notes/third.md');

    expect(await readDeleteFailures()).toEqual({});
    expect(await NoteSyncQueueService.pendingCount()).toBe(1);
    expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'notes/third.md')).toBe(true);

    void NoteSyncQueueService.drain();
    await act(async () => {
      await flushMicrotasks();
    });
    await act(async () => {
      resolveRetryDelete?.({ success: true });
    });
    expect(await NoteSyncQueueService.pendingCount()).toBe(0);
  }, 15000);

  it('S4 — syncNow() waits while a push marker is active for repo R; pullAllFromRepos runs only after the marker clears; an unrelated repo S proceeds in parallel', async () => {
    jest.useFakeTimers();
    try {
      const pullAllSpy = pullAllFromRepos as jest.Mock;
      const pullSingleSpy = jest.spyOn(
        require('../src/services/RepoPullService'),
        'pullFromSingleRepo',
      );

      // Marker held for R: syncNow must NOT read any repo until it clears.
      GitSyncGate.markPushActive('owner/repo', 'main');
      expect(GitSyncGate.isPushActive('owner/repo')).toBe(true);

      const sync = syncNow();
      await flushMicrotasks(20);
      expect(pullAllSpy).not.toHaveBeenCalled();
      expect(GitSyncGate.isCycleHeld()).toBe(true);
      // The app-wide cycle op is published to the registry while waiting.
      const cycleOp = Object.values(useGitOperationStore.getState().ops).find(
        (op) => op.kind === 'pull' && op.repo === '*',
      );
      expect(cycleOp?.status).toBe('running');

      GitSyncGate.clearPushActive('owner/repo', 'main');
      jest.advanceTimersByTime(250);
      await flushMicrotasks(20);
      await sync;
      expect(pullAllSpy).toHaveBeenCalledTimes(1);
      expect(GitSyncGate.isCycleHeld()).toBe(false);

      // Unrelated repo S: a marker on R must not block a targeted sync of S.
      GitSyncGate.markPushActive('owner/repo', 'main');
      const targeted = syncNow({ repos: ['s/repo'] });
      await flushMicrotasks(20);
      expect(pullSingleSpy).toHaveBeenCalledWith('s/repo');
      await targeted;
      expect(GitSyncGate.isCycleHeld()).toBe(false);
    } finally {
      jest.useRealTimers();
      GitSyncGate.__resetForTest();
    }
  });

  it('S5 (api mode) — bulk delete of 10 notes is ONE queue write; no lock spinner; drain routes the group through ONE batchDeleteFiles call', async () => {
    let resolveBatch: ((value: unknown) => void) | undefined;
    (batchDeleteFiles as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolveBatch = res; }),
    );

    const notes = Array.from({ length: 10 }, (_, i) =>
      createNote({
        id: `b${i}`,
        title: `Bulk ${i}`,
        repo: 'owner/repo',
        branch: 'main',
        filePath: `notes/b${i}.md`,
      }),
    );
    useNoteStore.setState({ notes, isLoading: false, error: null });

    const screen = renderNotesList();
    for (let i = 0; i < 10; i += 1) {
      fireEvent.press(screen.getByTestId(`swipeable-select-b${i}`));
    }
    fireEvent.press(screen.getByTestId('bulk-action-bar.delete'));
    await pressAlertButtonAsync('Delete');

    void NoteSyncQueueService.drain();

    const queueWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]: [string]) => key === QUEUE_KEY,
    );
    expect(queueWrites).toHaveLength(1);
    expect(NoteSyncQueueService.enqueueNoteDeletes).not.toBeUndefined();
    const items = await NoteSyncQueueService.getAll();
    expect(items).toHaveLength(10);
    expect(items.every((m) => m.type === 'note.delete')).toBe(true);

    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();

    await act(async () => {
      await flushMicrotasks();
    });
    expect(batchDeleteFiles).toHaveBeenCalledTimes(1);
    expect(batchDeleteFiles).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner',
        repo: 'repo',
        branch: 'main',
        paths: Array.from({ length: 10 }, (_, i) => `notes/b${i}.md`),
        message: 'Delete 10 notes',
      }),
    );
    expect(deleteNoteFromGitHub).not.toHaveBeenCalled();

    const deleted = Array.from({ length: 10 }, (_, i) => `notes/b${i}.md`);
    await act(async () => {
      resolveBatch?.({ success: true, deleted, failed: [] });
    });
    expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    expect(useNoteStore.getState().notes).toHaveLength(0);
  });

  it('S5 (clone mode) — bulk delete of 10 notes is ONE queue write; no lock spinner; the group flushes with exactly ONE LocalGitWriter.push', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    let resolvePush: ((value: { success: boolean }) => void) | undefined;
    (LocalGitWriter.push as jest.Mock).mockImplementation(
      () => new Promise((res) => { resolvePush = res; }),
    );

    const notes = Array.from({ length: 10 }, (_, i) =>
      createNote({
        id: `c${i}`,
        title: `Clone ${i}`,
        repo: 'owner/repo',
        branch: 'main',
        filePath: `notes/c${i}.md`,
      }),
    );
    useNoteStore.setState({ notes, isLoading: false, error: null });

    const screen = renderNotesList();
    for (let i = 0; i < 10; i += 1) {
      fireEvent.press(screen.getByTestId(`swipeable-select-c${i}`));
    }
    fireEvent.press(screen.getByTestId('bulk-action-bar.delete'));
    await pressAlertButtonAsync('Delete');

    void NoteSyncQueueService.drain();

    const queueWrites = (AsyncStorage.setItem as jest.Mock).mock.calls.filter(
      ([key]: [string]) => key === QUEUE_KEY,
    );
    expect(queueWrites).toHaveLength(1);

    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();

    await act(async () => {
      await flushMicrotasks();
    });
    expect(batchDeleteFiles).not.toHaveBeenCalled();
    expect(LocalGitWriter.push).toHaveBeenCalledTimes(1);
    expect(LocalGitWriter.push).toHaveBeenCalledWith({
      repoPath: 'owner/repo',
      branch: 'main',
      token: 'tok',
    });
    const deleteCalls = (deleteNoteFromGitHub as jest.Mock).mock.calls;
    expect(deleteCalls).toHaveLength(10);
    for (const [args] of deleteCalls) {
      expect(args.push).toBe(false);
    }

    await act(async () => {
      resolvePush?.({ success: true });
    });
    expect(await NoteSyncQueueService.pendingCount()).toBe(0);
    expect(useNoteStore.getState().notes).toHaveLength(0);
  });

  it('S6 — a delete enqueued with note.branch undefined resolves the repo default (master); the tombstone keys on master, so a pull whose remote tree still contains the file does NOT resurrect the note', async () => {
    resolveBranchMock.mockImplementation(async (_repo: string, hint?: string | null) => hint ?? 'master');

    const note = createNote({
      id: 'n6',
      title: 'Sixth',
      content: 'local-original',
      repo: 'owner/repo',
      branch: undefined,
      filePath: 'notes/sixth.md',
    });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });
    (deleteNoteFromGitHub as jest.Mock).mockResolvedValue({ success: false, error: 'network down' });

    await useNoteStore.getState().deleteNote('n6');
    await flushMicrotasks();

    const items = await NoteSyncQueueService.getAll();
    expect(items).toHaveLength(1);
    expect(items[0].params.branch).toBe('master');
    expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'master', 'notes/sixth.md')).toBe(true);
    expect(await NoteSyncQueueService.isTombstoned('owner/repo', 'main', 'notes/sixth.md')).toBe(false);
    const rawTombstones = await AsyncStorage.getItem(TOMBSTONE_KEY);
    expect(rawTombstones).toContain('owner/repo::master::notes/sixth.md');
    expect(rawTombstones).not.toContain('owner/repo::main::notes/sixth.md');

    expect(useNoteStore.getState().notes.some((n) => n.id === 'n6')).toBe(false);
    expect(StorageService.deleteNote).toHaveBeenCalledWith('n6');

    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { path: 'notes/sixth.md', type: 'blob', sha: 'remote-sha' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue('remote changed content');
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([note]);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([{ path: 'owner/repo', branch: undefined }]);

    await pullFromSingleRepo('owner/repo');
    expect(GitHubService.getTreeRecursiveOrThrow).toHaveBeenCalledWith('owner', 'repo', 'master');

    expect(StorageService.saveAllNotes).toHaveBeenCalled();
    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0] as Note[];
    expect(saved.some((n) => n.id === 'n6' && n.content === 'local-original')).toBe(true);
    await useNoteStore.getState().refreshNotes();
    const current = useNoteStore.getState().notes.find((n) => n.id === 'n6');
    expect(current?.content).toBe('local-original');
  });

  it('S7 — clone divergence lifecycle: the delete commits locally (push:false) and the row is removed immediately; a diverged engine push surfaces without resurrecting the row, and the conflict store keeps the local-deleted-remote-modified entry unresolved', async () => {
    (SyncEngineService.getMode as jest.Mock).mockResolvedValue('clone');
    (SyncEngineService.listOverrides as jest.Mock).mockResolvedValue({ 'owner/repo': 'clone' });
    (LocalGitWriter.deleteAndCommit as jest.Mock).mockResolvedValue({ success: true });
    (LocalGitWriter.push as jest.Mock).mockResolvedValue({
      success: false,
      error: 'Push failed: diverged',
    });
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'owner/repo', branch: 'main' },
    ]);
    (GitFsService.getCommitOid as jest.Mock).mockImplementation(async ({ ref }: { ref: string }) =>
      ref.includes('remotes/origin') ? 'remote-oid' : 'local-oid',
    );

    // The divergence read (RepoPullService:108) already persisted this entry;
    // autoResolve leaves local-deleted-remote-modified unresolved by design.
    await useConflictStore.getState().addConflict({
      repoPath: 'owner/repo',
      branch: 'main',
      localRef: 'refs/heads/main',
      remoteRef: 'refs/remotes/origin/main',
      mergeBaseRef: 'base',
      files: [
        {
          path: 'notes/diverged.md',
          kind: 'local-deleted-remote-modified',
          format: 'text',
          localContent: null,
          remoteContent: 'remote body',
          baseContent: 'base body',
          mergedContent: null,
          localSha: null,
          remoteSha: 'rsha',
          autoResolved: false,
        },
      ],
      detectedAt: Date.now(),
    });

    const note = createNote({ id: 'n7', title: 'Diverged', repo: 'owner/repo', branch: 'main', filePath: 'notes/diverged.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    await useNoteStore.getState().deleteNote('n7');
    await flushMicrotasks();

    // Clone-mode stageDelete commits the delete locally; the row is removed
    // immediately and no queue mutation is created.
    expect(LocalGitWriter.deleteAndCommit).toHaveBeenCalledTimes(1);
    expect(LocalGitWriter.deleteAndCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        repoPath: 'owner/repo',
        branch: 'main',
        filePath: 'notes/diverged.md',
        push: false,
      }),
    );
    expect(useNoteStore.getState().notes.some((n) => n.id === 'n7')).toBe(false);
    expect(Object.values(useGitOperationStore.getState().ops).some(
      (op) => op.kind === 'delete' && op.path === 'notes/diverged.md' && op.status === 'failed',
    )).toBe(false);
    expect(await NoteSyncQueueService.getAll()).toHaveLength(0);

    // The engine's coalesced push is where divergence surfaces: the flush
    // fails, but the local row stays deleted (no resurrection).
    const pushResult = await StagingService.pushStaged('owner/repo', 'main');
    expect(pushResult.success).toBe(false);
    expect(pushResult.error).toContain('diverged');
    expect(useNoteStore.getState().notes.some((n) => n.id === 'n7')).toBe(false);

    // Linkage with the conflict store: the local-deleted-remote-modified
    // entry is still there and NOT auto-resolved.
    const conflict = useConflictStore.getState().getConflict('owner/repo', 'main');
    expect(conflict).toBeDefined();
    const file = conflict?.files.find((f) => f.path === 'notes/diverged.md');
    expect(file?.kind).toBe('local-deleted-remote-modified');
    expect(file?.autoResolved).toBe(false);
    expect(useConflictStore.getState().totalUnresolvedFiles()).toBeGreaterThanOrEqual(1);
  });

  it('S8 — restart: seeded AsyncStorage queue + failure map hydrate into the registry; rows render with no lock UI; failed entries are surfaced via the deleteFailures map', async () => {
    const now = Date.now();
    await AsyncStorage.setItem(
      QUEUE_KEY,
      JSON.stringify([
        {
          id: 'restart-queued',
          type: 'note.delete',
          createdAt: now,
          attempts: 0,
          params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/restart-queued.md', title: 'Restart queued', localNoteId: 'restart-queued' },
        },
      ]),
    );
    await AsyncStorage.setItem(
      DELETE_FAILURES_STORAGE_KEY,
      JSON.stringify({
        'owner/repo::main::notes/restart-failed.md': { error: 'Bad credentials', kind: 'authentication', at: now },
      }),
    );

    const queuedNote = createNote({ id: 'restart-queued', title: 'Restart queued', repo: 'owner/repo', branch: 'main', filePath: 'notes/restart-queued.md' });
    const failedNote = createNote({ id: 'restart-failed', title: 'Restart failed', repo: 'owner/repo', branch: 'main', filePath: 'notes/restart-failed.md' });
    useNoteStore.setState({ notes: [queuedNote, failedNote], isLoading: false, error: null });
    useGitOperationStore.setState({ ops: {} });

    await hydrate();

    const ops = useGitOperationStore.getState().ops;
    const queuedOp = Object.values(ops).find((op) => op.id === 'restart-queued');
    expect(queuedOp).toBeDefined();
    expect(queuedOp?.status).toBe('queued');
    expect(queuedOp?.kind).toBe('delete');
    expect(queuedOp?.entityIds).toContain('restart-queued');
    const failedOp = Object.values(ops).find((op) => op.id === 'owner/repo::main::notes/restart-failed.md');
    expect(failedOp).toBeDefined();
    expect(failedOp?.status).toBe('failed');
    expect(failedOp?.error).toBe('Bad credentials');

    const screen = renderNotesList();
    expect(screen.getByText('Restart queued')).toBeTruthy();
    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();
    expect(screen.getByText('Restart failed')).toBeTruthy();
    expect(screen.queryByTestId('note-row.lock-error')).toBeNull();
    expect(deleteNoteFromGitHub).not.toHaveBeenCalled();
    expect(await NoteSyncQueueService.pendingCount()).toBe(1);

    const failures = await readDeleteFailures();
    expect(Object.keys(failures)).toEqual(['owner/repo::main::notes/restart-failed.md']);
    expect(failures['owner/repo::main::notes/restart-failed.md']).toMatchObject({
      error: 'Bad credentials',
      kind: 'authentication',
    });
  });
});
