import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import NotesListScreen from '../src/screens/NotesListScreen';
import NoteEditorScreen from '../src/screens/NoteEditorScreen';
import { Note } from '../src/models/Note';
import { useNoteStore } from '../src/stores/noteStore';
import { useGitOperationStore, gitOperationRegistry, hydrate } from '../src/stores/gitOperationStore';
import { NoteSyncQueueService } from '../src/services/NoteSyncQueueService';
import { StorageService } from '../src/services/StorageService';
import { clearDeleteFailure } from '../src/services/git/deleteFailures';
import { renderWithTheme } from './helpers/renderWithTheme';

type SucceededHandler = (event: { mutation: { id: string; type: string; params: Record<string, any> } }) => void;
type DroppedHandler = (event: {
  mutation: { id: string; type: string; params: Record<string, any> };
  reason: string;
  error?: string;
}) => void;

const mockNavigate = jest.fn();
let mockRouteNoteId = 'editor-note';

jest.mock('../src/services/NoteSyncQueueService', () => {
  const succeeded = new Set<SucceededHandler>();
  const dropped = new Set<DroppedHandler>();
  return {
    NoteSyncQueueService: {
      enqueueNoteDelete: jest.fn(async () => undefined),
      enqueueNoteDeletes: jest.fn(async () => undefined),
      drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
      pendingCount: jest.fn(async () => 0),
      subscribe: jest.fn(() => jest.fn()),
      getAll: jest.fn(async () => []),
      onMutationSucceeded: jest.fn((fn: SucceededHandler) => {
        succeeded.add(fn);
        return () => succeeded.delete(fn);
      }),
      onDroppedMutation: jest.fn((fn: DroppedHandler) => {
        dropped.add(fn);
        return () => dropped.delete(fn);
      }),
      __testSucceededHandlers: succeeded,
      __testDroppedHandlers: dropped,
    },
  };
});

jest.mock('../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(async () => ({ success: true, filePath: 'notes/x.md', finalContent: null })),
  deleteNoteFromGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../src/services/git/deleteFailures', () => ({
  clearDeleteFailure: jest.fn(async () => undefined),
  readDeleteFailures: jest.fn(async () => ({})),
  recordDeleteFailure: jest.fn(async () => undefined),
  deleteFailureKey: jest.fn((repo: string, branch: string | undefined, filePath: string) => `${repo}::${branch || 'main'}::${filePath}`),
  DELETE_FAILURES_STORAGE_KEY: '@gitnotes:delete_failures_v1',
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    deleteNote: jest.fn(async () => true),
    getAllNotes: jest.fn(async () => []),
    getSavedRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn(), isAuthenticated: jest.fn(() => true), getFileSha: jest.fn(), deleteFile: jest.fn() },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../src/services/git/manualSync', () => ({
  syncNow: jest.fn(async () => ({ ok: true })),
  isSyncNowRunning: jest.fn(() => false),
}));

jest.mock('../src/services/ShareService', () => ({
  ShareService: { shareText: jest.fn(), shareInFormat: jest.fn(async () => true), getAvailableFormats: jest.fn(() => []) },
}));

jest.mock('../src/services/GitService', () => ({
  GitService: { getBranches: jest.fn(async () => []), getRepositoryFolders: jest.fn(async () => []) },
}));

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
  useRoute: () => ({ params: { noteId: mockRouteNoteId } }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

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
        updateNote: jest.fn(async (input: any) => {
          const updated = await store.getState().updateNote(input);
          return updated ?? null;
        }),
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

jest.mock('../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
  useGitHubActivityStore: () => ({ inflight: 0 }),
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0, columnCount: 1 }),
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/components/ContextMenu', () => () => null);
jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/SortPicker', () => () => null);
jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (v: string) => void }) => (
    <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../src/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    Button: ({ label, onPress, disabled, testID }: any) =>
      require('react').createElement(
        Pressable,
        { onPress, disabled, accessibilityRole: 'button', testID },
        require('react').createElement(Text, null, label),
      ),
    IconButton: ({ children, onPress, testID }: any) =>
      require('react').createElement(Pressable, { onPress, testID }, children),
    Modal: ({ visible, children }: any) => (visible ? require('react').createElement(View, null, children) : null),
    ScreenHeader: ({ title, actions }: any) =>
      require('react').createElement(
        View,
        { testID: 'screen-header' },
        require('react').createElement(Text, null, title),
        actions,
      ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    Card: ({ children }: any) => require('react').createElement(View, null, children),
    Input: ({ testID, value, onChangeText, multiline }: any) =>
      require('react').createElement(require('react-native').TextInput, { testID, value, onChangeText, multiline }),
    EmptyState: ({ title }: any) => require('react').createElement(Text, null, title),
  };
});

jest.mock('../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/components/ui/ConflictBanner', () => ({ ConflictBanner: () => null }));

jest.mock('../src/components/notes/NoteCard', () => {
  const { Pressable, Text } = require('react-native');
  return {
    NoteCard: ({ note, onPress, onLongPress }: { note: Note; onPress: (n: Note) => void; onLongPress?: (n: Note) => void }) => (
      <Pressable
        testID={`notes-card-${note.id}`}
        onPress={() => onPress(note)}
        onLongPress={onLongPress ? () => onLongPress(note) : undefined}
      >
        <Text>{note.title}</Text>
      </Pressable>
    ),
  };
});

jest.mock('../src/components/notes/NotesListHeader', () => ({ NotesListHeader: () => null }));
jest.mock('../src/components/notes/NotesViewModePicker', () => ({ NotesViewModePicker: () => null }));
jest.mock('../src/components/notes/NotesFilterModal', () => ({ NotesFilterModal: () => null }));
jest.mock('../src/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../src/components/notes/NotesEmptyState', () => ({ NotesEmptyState: () => null }));

jest.mock('../src/components/notes/NotesContextMenu', () => {
  const { Pressable, Text } = require('react-native');
  return {
    NotesContextMenu: ({ note, onDelete }: { note: Note | null; onDelete: (n: Note) => void }) =>
      note ? (
        <Pressable testID="notes-context-menu.delete" onPress={() => onDelete(note)}>
          <Text>Delete</Text>
        </Pressable>
      ) : null,
  };
});

jest.mock('../src/components/list/SwipeableListItem', () => {
  const { Pressable, View } = require('react-native');
  return {
    SwipeableListItem: ({ itemId, disabled, onToggleSelect, children }: any) => (
      <View testID={`swipeable-${itemId}`}>
        <Pressable
          testID={`swipeable-select-${itemId}`}
          disabled={disabled}
          accessibilityState={{ disabled: !!disabled }}
          onPress={disabled ? undefined : onToggleSelect}
        >
          <View>{children}</View>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('../src/components/list/BulkActionBar', () => {
  const { Pressable, Text } = require('react-native');
  return {
    BulkActionBar: ({ count, onDelete }: { count: number; onDelete: () => void }) =>
      count > 0 ? (
        <Pressable testID="bulk-action-bar.delete" onPress={onDelete}>
          <Text>Delete {count}</Text>
        </Pressable>
      ) : null,
  };
});

jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: React.forwardRef(({ data = [], renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data.length) {
        return <View testID="flash-list-empty">{ListEmptyComponent ?? null}</View>;
      }
      return <View testID="flash-list">{data.map((item: any, index: number) => renderItem({ item, index }))}</View>;
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
});

// Editor-only mocks (acceptance case 6).
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn(async () => false) }));
jest.mock('react-native-marked', () => ({ useMarkdown: jest.fn(() => []) }));
jest.mock('../src/components/ui/EmptyState', () => {
  const { Text } = require('react-native');
  return { EmptyState: ({ title }: any) => require('react').createElement(Text, null, title) };
});
jest.mock('../src/components/ui/SafeAreaView', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: any) => require('react').createElement(View, null, children) };
});
jest.mock('../src/components/GitHubActivityIndicator', () => {
  const { Text } = require('react-native');
  return {
    GitHubActivityIndicator: () => require('react').createElement(Text, { testID: 'github-activity-indicator' }, 'activity'),
  };
});
jest.mock('../src/components/MarkdownEditor', () => () => {
  const { Text } = require('react-native');
  return require('react').createElement(Text, null, 'Markdown editor');
});
jest.mock('../src/components/GitContextPicker', () => () => null);
jest.mock('../src/components/StructuredRenderer', () => () => null);
jest.mock('../src/components/PdfViewer', () => () => null);
jest.mock('../src/components/TagInput', () => () => null);
jest.mock('../src/components/VoiceInputModal', () => () => null);
jest.mock('../src/components/CanvasPreview', () => () => null);
jest.mock('../src/components/FolderSelectionDialog', () => () => null);
jest.mock('../src/utils/markdownRenderer', () => ({ NotePreviewRenderer: class {} }));
jest.mock('../src/components/NoteCard', () => ({
  __esModule: true,
  default: ({ note }: any) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, note.title);
  },
}));
jest.mock('../src/components/editor/NoteEditorForm', () => {
  const { Text } = require('react-native');
  return { NoteEditorForm: () => require('react').createElement(Text, null, 'form') };
});
jest.mock('../src/components/editor/NotePreviewPane', () => ({ NotePreviewPane: () => null }));
jest.mock('../src/components/editor/NoteViewer', () => {
  const { Pressable, Text } = require('react-native');
  return {
    NoteViewer: ({ onEdit }: any) =>
      require('react').createElement(
        Pressable,
        { testID: 'note-viewer.edit', onPress: onEdit },
        require('react').createElement(Text, null, 'Edit'),
      ),
  };
});
jest.mock('../src/components/editor/EditorToolbar', () => ({ EditorToolbar: () => null }));
jest.mock('../src/components/editor/CanvasPickerModal', () => ({ CanvasPickerModal: () => null }));
jest.mock('../src/components/editor/useNoteEditorPreview', () => ({
  useNoteEditorPreview: () => ({
    isSpeaking: false,
    speakableContent: '',
    tocEntries: [],
    showToc: false,
    previewContent: '',
    parsedStructuredContent: null,
    markdownStyles: {},
    notePreviewRenderer: null,
    pdfViewerUri: null,
    pdfLoadError: null,
    setShowToc: jest.fn(),
    handleToggleSpeak: jest.fn(),
    setPdfLoadError: jest.fn(),
    onOpenNote: jest.fn(),
    handleTocPress: jest.fn(),
    currentNotePath: undefined,
    headingPositions: [],
    previewScrollRef: { current: null },
    handlePreviewScroll: jest.fn(),
    handlePreviewContentSizeChange: jest.fn(),
  }),
}));

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

function succeededHandlers(): Set<SucceededHandler> {
  return (NoteSyncQueueService as any).__testSucceededHandlers;
}

function droppedHandlers(): Set<DroppedHandler> {
  return (NoteSyncQueueService as any).__testDroppedHandlers;
}

function emitSucceeded(mutation: any): void {
  act(() => {
    succeededHandlers().forEach((fn) => fn({ mutation }));
  });
}

function emitDropped(mutation: any, error = '401 unauthorized'): void {
  act(() => {
    droppedHandlers().forEach((fn) => fn({ mutation, reason: 'durable', error }));
  });
}

function pressLatestRetryAlert(): void {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  const buttons = lastCall[2] as Array<{ text?: string; onPress?: () => void }>;
  const retry = buttons.find((b) => b.text === 'Retry');
  act(() => {
    retry?.onPress?.();
  });
}

async function pressLatestDeleteAlertConfirm(): Promise<void> {
  const calls = (Alert.alert as jest.Mock).mock.calls;
  const lastCall = calls[calls.length - 1];
  const buttons = lastCall[2] as Array<{ text?: string; onPress?: () => void | Promise<void> }>;
  const confirm = buttons.find((b) => b.text === 'Delete' || b.text === 'delete 1');
  await act(async () => {
    await confirm?.onPress?.();
  });
}

describe('notes delete lock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    useNoteStore.setState({ notes: [], isLoading: false, error: null, searchQuery: '' });
    useGitOperationStore.setState({ ops: {} });
    (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => []);
    (NoteSyncQueueService.enqueueNoteDelete as jest.Mock).mockClear();
    (NoteSyncQueueService.enqueueNoteDeletes as jest.Mock).mockClear();
    (NoteSyncQueueService.drain as jest.Mock).mockClear();
    (clearDeleteFailure as jest.Mock).mockClear();
    (StorageService.deleteNote as jest.Mock).mockClear();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps the row visible-but-locked with a spinner after a delete press; press handlers no-op and swipe is disabled', async () => {
    const note = createNote({ id: 'n1', title: 'First', repo: 'owner/repo', branch: 'main', filePath: 'notes/first.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderWithTheme(<NotesListScreen />);
    expect(screen.getByText('First')).toBeTruthy();

    fireEvent(screen.getByTestId('notes-card-n1'), 'longPress');
    fireEvent.press(screen.getByTestId('notes-context-menu.delete'));

    await waitFor(() => {
      expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy();
    });

    // The note is still in the list and still rendered.
    expect(screen.getByText('First')).toBeTruthy();
    // Swipe (selection toggle) is disabled while locked.
    expect(screen.getByTestId('swipeable-select-n1').props.accessibilityState.disabled).toBe(true);
    // Card press no-ops: navigation is not invoked.
    fireEvent.press(screen.getByTestId('notes-card-n1'));
    expect(mockNavigate).not.toHaveBeenCalledWith('NoteEditor', { noteId: 'n1' });
    // Swipe press (selection toggle) no-ops: bulk action bar never appears.
    fireEvent.press(screen.getByTestId('swipeable-select-n1'));
    expect(screen.queryByTestId('bulk-action-bar.delete')).toBeNull();
    expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy();
  });

  it('places the lock spinner inside the card bounds (right/top 16, relative wrapper)', async () => {
    const note = createNote({ id: 'n-pos', title: 'Position', repo: 'owner/repo', branch: 'main', filePath: 'notes/position.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderWithTheme(<NotesListScreen />);
    fireEvent(screen.getByTestId('notes-card-n-pos'), 'longPress');
    fireEvent.press(screen.getByTestId('notes-context-menu.delete'));
    await waitFor(() => expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy());

    const spinner = screen.getByTestId('note-row.lock-spinner');
    const lockView = spinner.parent?.parent;
    expect(lockView).toBeTruthy();
    const lockStyle = (lockView?.props as { style?: Record<string, unknown> }).style;
    expect(lockStyle?.position).toBe('absolute');
    // The card is inset by marginHorizontal:16, so an in-bounds spinner must be
    // at least 16px from the wrapper's right/top edges.
    expect(lockStyle?.right).toBeGreaterThanOrEqual(16);
    expect(lockStyle?.top).toBeGreaterThanOrEqual(16);

    const wrapper = lockView?.parent?.parent;
    expect(wrapper).toBeTruthy();
    expect((wrapper?.props as { style?: Record<string, unknown> }).style?.position).toBe('relative');
  });

  it('removes the row and purges local storage when the queue success event fires', async () => {
    const note = createNote({ id: 'n2', title: 'Second', repo: 'owner/repo', branch: 'main', filePath: 'notes/second.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderWithTheme(<NotesListScreen />);
    fireEvent(screen.getByTestId('notes-card-n2'), 'longPress');
    fireEvent.press(screen.getByTestId('notes-context-menu.delete'));
    await waitFor(() => expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy());

    const mutation = {
      id: 'mutation-n2',
      type: 'note.delete',
      params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/second.md', localNoteId: 'n2' },
    };
    emitSucceeded(mutation);

    await waitFor(() => {
      expect(StorageService.deleteNote).toHaveBeenCalledWith('n2');
    });
    await waitFor(() => {
      expect(screen.queryByText('Second')).toBeNull();
    });
    expect(screen.queryByTestId('note-row.lock-spinner')).toBeNull();
  });

  it('renders a failure icon after a drop and Retry re-enqueues the delete (failure entry cleared)', async () => {
    const note = createNote({ id: 'n3', title: 'Third', repo: 'owner/repo', branch: 'main', filePath: 'notes/third.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });

    const screen = renderWithTheme(<NotesListScreen />);
    fireEvent(screen.getByTestId('notes-card-n3'), 'longPress');
    fireEvent.press(screen.getByTestId('notes-context-menu.delete'));
    await waitFor(() => expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy());

    const mutation = {
      id: 'mutation-n3',
      type: 'note.delete',
      params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/third.md', localNoteId: 'n3' },
    };
    emitDropped(mutation, '401 unauthorized');

    await waitFor(() => {
      expect(screen.getByTestId('note-row.lock-error')).toBeTruthy();
    });
    // The row is still present, at normal opacity.
    expect(screen.getByText('Third')).toBeTruthy();

    // Tapping the row surfaces the failure with a Retry action.
    fireEvent.press(screen.getByTestId('notes-card-n3'));
    expect(Alert.alert).toHaveBeenCalled();
    pressLatestRetryAlert();

    await waitFor(() => {
      expect(NoteSyncQueueService.enqueueNoteDelete).toHaveBeenCalled();
      expect(clearDeleteFailure).toHaveBeenCalledWith('owner/repo', 'main', 'notes/third.md');
      expect(NoteSyncQueueService.drain).toHaveBeenCalled();
    });
    // The queue notify → hydrate path (real app) re-derives the queued op,
    // which takes the row straight back to locked.
    (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [mutation]);
    await act(async () => {
      await hydrate();
    });
    await waitFor(() => {
      expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy();
    });
  });

  it('locks all three rows simultaneously on a bulk delete', async () => {
    const notes = [
      createNote({ id: 'b1', title: 'Bulk one', repo: 'owner/repo', branch: 'main', filePath: 'notes/b1.md' }),
      createNote({ id: 'b2', title: 'Bulk two', repo: 'owner/repo', branch: 'main', filePath: 'notes/b2.md' }),
      createNote({ id: 'b3', title: 'Bulk three', repo: 'owner/repo', branch: 'main', filePath: 'notes/b3.md' }),
    ];
    useNoteStore.setState({ notes, isLoading: false, error: null });

    const screen = renderWithTheme(<NotesListScreen />);
    for (const id of ['b1', 'b2', 'b3']) {
      fireEvent.press(screen.getByTestId(`swipeable-select-${id}`));
    }
    fireEvent.press(screen.getByTestId('bulk-action-bar.delete'));
    await pressLatestDeleteAlertConfirm();

    await waitFor(() => {
      expect(screen.getAllByTestId('note-row.lock-spinner')).toHaveLength(3);
    });
    expect(NoteSyncQueueService.enqueueNoteDeletes).toHaveBeenCalledTimes(1);
    const params = (NoteSyncQueueService.enqueueNoteDeletes as jest.Mock).mock.calls[0][0];
    expect(params.map((p: any) => p.filePath).sort()).toEqual(['notes/b1.md', 'notes/b2.md', 'notes/b3.md']);
    expect(params.map((p: any) => p.localNoteId).sort()).toEqual(['b1', 'b2', 'b3']);
    // All three rows remain rendered.
    expect(screen.getByText('Bulk one')).toBeTruthy();
    expect(screen.getByText('Bulk two')).toBeTruthy();
    expect(screen.getByText('Bulk three')).toBeTruthy();
  });

  it('renders the row locked after a restart hydrate from a seeded queue, before any drain', async () => {
    const note = createNote({ id: 'restart-note', title: 'Restart note', repo: 'owner/repo', branch: 'main', filePath: 'notes/restart.md' });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });
    useGitOperationStore.setState({ ops: {} });

    (NoteSyncQueueService.getAll as jest.Mock).mockImplementation(async () => [
      {
        id: 'restart-mutation',
        type: 'note.delete',
        createdAt: 1,
        attempts: 0,
        params: { repo: 'owner/repo', branch: 'main', filePath: 'notes/restart.md', title: 'Restart note', localNoteId: 'restart-note' },
      },
    ]);

    await act(async () => {
      await hydrate();
    });

    const screen = renderWithTheme(<NotesListScreen />);
    expect(screen.getByText('Restart note')).toBeTruthy();
    expect(screen.getByTestId('note-row.lock-spinner')).toBeTruthy();
    expect(NoteSyncQueueService.drain).not.toHaveBeenCalled();
  });

  it('blocks editor save on a path with a queued delete: sync spy not called and Alert shown', async () => {
    // Synced note → the header lock is visible: the save button is disabled
    // while the delete runs.
    mockRouteNoteId = 'editor-synced';
    const syncedNote = createNote({
      id: 'editor-synced',
      title: 'Editor synced',
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/editor-synced.md',
    });
    useNoteStore.setState({ notes: [syncedNote], isLoading: false, error: null });
    gitOperationRegistry.begin({
      kind: 'delete',
      repo: 'owner/repo',
      branch: 'main',
      path: 'notes/editor-synced.md',
      entityIds: [syncedNote.id],
      status: 'running',
      attempts: 0,
    });

    const screen = renderWithTheme(<NoteEditorScreen />);
    await waitFor(() => expect(screen.getByTestId('note-viewer.edit')).toBeTruthy());
    fireEvent.press(screen.getByTestId('note-viewer.edit'));
    await waitFor(() => expect(screen.getByTestId('note-editor.button.save')).toBeTruthy());
    expect(screen.getByTestId('note-editor.button.save').props.accessibilityState.disabled).toBe(true);

    // Unsynced note (no filePath): the header cannot lock by path, but
    // handleSave still blocks the save via the derived path.
    mockRouteNoteId = 'editor-note';
    useNoteStore.setState({ notes: [], isLoading: false, error: null });
    useGitOperationStore.setState({ ops: {} });
    const note = createNote({
      id: 'editor-note',
      title: 'Editor note',
      repo: 'owner/repo',
      branch: 'main',
      folderPath: 'notes',
    });
    useNoteStore.setState({ notes: [note], isLoading: false, error: null });
    gitOperationRegistry.begin({
      kind: 'delete',
      repo: 'owner/repo',
      branch: 'main',
      path: 'notes/editor-note.md',
      entityIds: [],
      status: 'running',
      attempts: 0,
    });

    const screen2 = renderWithTheme(<NoteEditorScreen />);
    await waitFor(() => expect(screen2.getByTestId('note-viewer.edit')).toBeTruthy());
    fireEvent.press(screen2.getByTestId('note-viewer.edit'));
    await waitFor(() => expect(screen2.getByTestId('note-editor.button.save')).toBeTruthy());

    fireEvent.press(screen2.getByTestId('note-editor.button.save'));

    const { syncNoteToGitHub } = require('../src/services/NoteGitHubSyncService');
    expect(syncNoteToGitHub).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(expect.any(String), expect.stringContaining('deleted'));
  });
});
