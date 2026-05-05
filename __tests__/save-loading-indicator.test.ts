import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

const mockNavigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
};

const mockRouteParams = {
  noteId: undefined,
  initialTitle: 'Draft note',
  initialContent: 'Draft content',
  initialRepo: 'owner/repo',
  initialBranch: 'main',
  initialFormat: 'markdown',
};

const mockCreateNote = jest.fn();
const mockUpdateNote = jest.fn();
const mockDeleteNote = jest.fn();
const mockRefreshNotes = jest.fn(async () => undefined);
const mockTogglePin = jest.fn(async () => true);
const mockSetSearchQuery = jest.fn();
const mockSetViewMode = jest.fn();
const mockUseNoteStore: any = jest.fn();
mockUseNoteStore.getState = () => ({ error: 'Delete failed' });

const mockNote = {
  id: 'note-1',
  title: 'First note',
  content: 'Body',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  format: 'markdown',
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('expo-image-picker', () => ({
  MediaTypeOptions: { Images: 'Images' },
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ granted: true })),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true })),
}));
jest.mock('expo-speech', () => ({
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
}));
jest.mock('react-native-marked', () => ({ useMarkdown: jest.fn(() => []) }));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      surfaceSecondary: '#e5e7eb',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
    isDark: false,
  }),
  useTokens: () => ({
    colors: {
      surface: '#f4f4f4',
      border: '#ddd',
      accent: '#2563eb',
      text: '#111',
    },
    radii: { pill: 999 },
    spacing: { 2: 8, 3: 12 },
    type: { sm: 12 },
  }),
}));

jest.mock('../src/contexts/AuthContext', () => ({ useAuth: () => ({ authState: { token: null } }) }));
jest.mock('../src/contexts/RepoContext', () => ({ useRepos: () => ({ repositories: [{ path: 'owner/repo' }] }) }));
jest.mock('../src/contexts/FolderContext', () => ({ useFolders: () => ({ folders: [] }) }));
jest.mock('../src/contexts/CanvasContext', () => ({ useCanvases: () => ({ canvases: [] }) }));
jest.mock('../src/hooks/useResponsive', () => ({ useResponsive: () => ({ sideBySide: false, isTablet: false, maxContentWidth: 0 }) }));
jest.mock('../src/contexts/ViewModeContext', () => ({ useViewMode: () => ({ viewMode: 'list', setViewMode: mockSetViewMode }) }));
jest.mock('../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [mockNote],
    filteredNotes: [mockNote],
    isLoading: false,
    searchQuery: '',
    setSearchQuery: mockSetSearchQuery,
    deleteNote: mockDeleteNote,
    refreshNotes: mockRefreshNotes,
    togglePin: mockTogglePin,
    error: null,
    createNote: mockCreateNote,
    updateNote: mockUpdateNote,
    getNoteById: jest.fn(() => null),
  }),
}));
jest.mock('../src/stores/noteStore', () => ({ useNoteStore: mockUseNoteStore }));
jest.mock('../src/services/GitService', () => ({ GitService: { getBranches: jest.fn(async () => []), getRepositoryFolders: jest.fn(async () => []) } }));
jest.mock('../src/services/GitHubService', () => ({ GitHubService: { setToken: jest.fn() } }));
jest.mock('../src/services/NoteGitHubSyncService', () => ({
  syncNoteToGitHub: jest.fn(async () => ({ success: true, filePath: 'notes/draft-note.md', finalContent: null })),
}));
jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteUpsert: jest.fn(async () => undefined),
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0 })),
  },
}));
jest.mock('../src/services/RepoPullService', () => ({ pullAllFromRepos: jest.fn(async () => undefined) }));
jest.mock('../src/services/ShareService', () => ({ ShareService: { shareText: jest.fn(), shareByNoteFormat: jest.fn(async () => true) } }));
jest.mock('../src/utils/haptics', () => ({
  HapticService: { light: jest.fn(), medium: jest.fn(), success: jest.fn(), warning: jest.fn(), selection: jest.fn(), error: jest.fn() },
}));

jest.mock('../src/components/GitHubActivityIndicator', () => ({
  GitHubActivityIndicator: () => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, { testID: 'github-activity-indicator' }, 'GitHub activity');
  },
}));

jest.mock('../src/components/ui', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    Button: ({ label, onPress, disabled }: any) => require('react').createElement(
      Pressable,
      { onPress, disabled, accessibilityRole: 'button' },
      require('react').createElement(Text, null, label),
    ),
    IconButton: ({ children, onPress }: any) => require('react').createElement(Pressable, { onPress }, children),
    Modal: ({ visible, children }: any) => (visible ? require('react').createElement(View, null, children) : null),
    ScreenHeader: ({ title }: any) => require('react').createElement(Text, null, title),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
  };
});
jest.mock('../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/components/SortPicker', () => () => null);
jest.mock('../src/components/MarkdownEditor', () => () => {
  const { Text } = require('react-native');
  return require('react').createElement(Text, null, 'Markdown editor');
});
jest.mock('../src/components/GitContextPicker', () => () => null);
jest.mock('../src/components/NeorgRenderer', () => () => null);
jest.mock('../src/components/PdfViewer', () => () => null);
jest.mock('../src/components/TagInput', () => () => null);
jest.mock('../src/components/VoiceInputModal', () => () => null);
jest.mock('../src/components/CanvasModal', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/CanvasPreview', () => () => null);
jest.mock('../src/components/FolderSelectionDialog', () => () => null);
jest.mock('../src/components/ContextMenu', () => () => null);
jest.mock('../src/utils/markdownRenderer', () => ({ NotePreviewRenderer: class {} }));
jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: any) => require('react').createElement(TextInput, { value, onChangeText });
});
jest.mock('../src/components/NoteCard', () => ({
  __esModule: true,
  default: ({ note }: any) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, note.title);
  },
}));
jest.mock('@shopify/flash-list', () => {
  const { View } = require('react-native');
  return {
    FlashList: require('react').forwardRef(({ data, renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data?.length) return require('react').createElement(View, null, ListEmptyComponent ?? null);
      return require('react').createElement(
        View,
        null,
        data.map((item: any, index: number) => require('react').createElement(View, { key: item.id ?? index }, renderItem({ item, index }))),
      );
    }),
  };
});
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { Pressable, View } = require('react-native');
  const React = require('react');
  return React.forwardRef(({ children, renderRightActions, onSwipeableWillOpen }: any, ref: any) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const noteId = children?.props?.note?.id ?? 'unknown';
    const methods = React.useRef({
      close: jest.fn(() => setIsOpen(false)),
      openLeft: jest.fn(),
      openRight: jest.fn(),
      reset: jest.fn(),
    }).current;

    React.useEffect(() => {
      if (typeof ref === 'function') {
        ref(methods);
        return () => ref(null);
      }
      if (ref) {
        ref.current = methods;
        return () => {
          ref.current = null;
        };
      }
      return undefined;
    }, [ref, methods]);

    return React.createElement(
      View,
      null,
      React.createElement(Pressable, {
        testID: `open-swipe-${noteId}`,
        onPress: () => {
          onSwipeableWillOpen?.();
          setIsOpen(true);
        },
      }),
      children,
      isOpen ? React.createElement(View, { testID: `swipe-actions-${noteId}` }, renderRightActions?.(undefined, undefined, methods)) : null,
    );
  });
});
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => {
    const { View } = require('react-native');
    return require('react').createElement(View, null, children);
  },
}));

import NoteEditorScreen from '../src/screens/NoteEditorScreen';
import NotesListScreen from '../src/screens/NotesListScreen';

describe('save/loading indicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams.noteId = undefined;
    mockRouteParams.initialTitle = 'Draft note';
    mockRouteParams.initialContent = 'Draft content';
    mockRouteParams.initialRepo = 'owner/repo';
    mockRouteParams.initialBranch = 'main';
    mockRouteParams.initialFormat = 'markdown';
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows and hides the save spinner on success', async () => {
    const deferred = createDeferred<{ id: string } | null>();
    mockCreateNote.mockReturnValueOnce(deferred.promise);

    const screen = render(React.createElement(NoteEditorScreen));
    fireEvent.press(screen.getByText('Save'));

    expect(screen.getByTestId('github-activity-indicator')).toBeTruthy();

    await act(async () => {
      deferred.resolve({ id: 'note-1' });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('github-activity-indicator')).toBeNull();
    });
  });

  it('hides the save spinner on error', async () => {
    const deferred = createDeferred<{ id: string } | null>();
    mockCreateNote.mockReturnValueOnce(deferred.promise);

    const screen = render(React.createElement(NoteEditorScreen));
    fireEvent.press(screen.getByText('Save'));

    expect(screen.getByTestId('github-activity-indicator')).toBeTruthy();

    await act(async () => {
      deferred.reject(new Error('save failed'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('github-activity-indicator')).toBeNull();
    });
  });

  it('shows and hides the delete spinner on success', async () => {
    const deferred = createDeferred<boolean>();
    mockDeleteNote.mockReturnValueOnce(deferred.promise);

    const screen = render(React.createElement(NotesListScreen));
    fireEvent.press(screen.getByTestId('open-swipe-note-1'));
    fireEvent.press(screen.getByText('Delete'));

    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const lastCall = alertCalls[alertCalls.length - 1];
    const deleteButton = (lastCall?.[2] as Array<{ text?: string; onPress?: () => void | Promise<void> }>).find((button) => button.text === 'Delete');

    act(() => {
      deleteButton?.onPress?.();
    });

    expect(screen.getByTestId('github-activity-indicator')).toBeTruthy();

    await act(async () => {
      deferred.resolve(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('github-activity-indicator')).toBeNull();
    });
  });

  it('hides the delete spinner on error', async () => {
    const deferred = createDeferred<boolean>();
    mockDeleteNote.mockReturnValueOnce(deferred.promise);

    const screen = render(React.createElement(NotesListScreen));
    fireEvent.press(screen.getByTestId('open-swipe-note-1'));
    fireEvent.press(screen.getByText('Delete'));

    const alertCalls = (Alert.alert as jest.Mock).mock.calls;
    const lastCall = alertCalls[alertCalls.length - 1];
    const deleteButton = (lastCall?.[2] as Array<{ text?: string; onPress?: () => void | Promise<void> }>).find((button) => button.text === 'Delete');

    act(() => {
      deleteButton?.onPress?.();
    });

    expect(screen.getByTestId('github-activity-indicator')).toBeTruthy();

    await act(async () => {
      deferred.reject(new Error('delete failed'));
    });

    await waitFor(() => {
      expect(screen.queryByTestId('github-activity-indicator')).toBeNull();
    });
  });
});
