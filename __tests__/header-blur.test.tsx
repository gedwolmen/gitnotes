import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
}));

const mockColorProxy = new Proxy(
  {
    background: '#fff',
    surface: '#f4f4f4',
    surfaceSecondary: '#e5e7eb',
    surfaceTertiary: '#d1d5db',
    primary: '#2563eb',
    accent: '#2563eb',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#d1d5db',
    error: '#dc2626',
    success: '#16a34a',
  },
  {
    get(target, key: string) {
      return key in target ? (target as Record<string, string>)[key] : '#111827';
    },
  },
);

const mockTokens = {
  colors: mockColorProxy,
  radii: { sm: 12, md: 18, lg: 24, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
};

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColorProxy, isDark: false }),
  useTokens: () => mockTokens,
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
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

jest.mock('../src/services/git/manualSync', () => ({
  syncNow: jest.fn(async () => ({ ok: true })),
  isSyncNowRunning: jest.fn(() => false),
}));

jest.mock('../src/services/git/GitSyncGate', () => ({
  GitSyncGate: {
    isCycleHeld: jest.fn(() => false),
    isPushActive: jest.fn(() => false),
  },
}));

jest.mock('../src/stores/gitOperationStore', () => ({
  useGitOperationStore: (selector: (s: { ops: Record<string, unknown> }) => unknown) =>
    selector({ ops: {} }),
  gitOperationRegistry: { begin: jest.fn(), succeed: jest.fn(), fail: jest.fn() },
  hasActivePull: jest.fn(() => false),
  hydrate: jest.fn(async () => undefined),
  GIT_OP_ALL_REPOS: '*',
}));

jest.mock('../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
  useGitHubActivityStore: () => ({ inflight: 0 }),
}));

jest.mock('../src/stores/reminderStore', () => ({
  useReminderStore: (selector: (s: { consumePendingFilter: () => undefined }) => unknown) =>
    selector({ consumePendingFilter: () => undefined }),
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    enqueueNoteDelete: jest.fn(async () => undefined),
    enqueueNoteDeletes: jest.fn(async () => undefined),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
    pendingCount: jest.fn(async () => 0),
    subscribe: jest.fn(() => jest.fn()),
    getAll: jest.fn(async () => []),
  },
}));

jest.mock('../src/services/JournalService', () => ({
  formatJournalDate: jest.fn(() => ''),
}));

jest.mock('../src/stores/noteStore', () => ({
  useNoteStore: (selector: (s: Record<string, never>) => unknown) => selector({}),
  deriveDefaultNotePath: jest.fn(() => 'notes/x.md'),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [{ id: 1, name: 'repo', path: 'owner/repo', branch: 'main' }],
    refreshRepos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    filteredNotes: [],
    isLoading: false,
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteNote: jest.fn(),
    togglePin: jest.fn(),
    error: null,
    clearError: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
  }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list' as const, setViewMode: jest.fn() }),
}));

jest.mock('../src/components/notes/useNotesListFilters', () => ({
  useNotesListFilters: () => ({
    filters: {
      selectedRepo: null,
      selectedFormat: null,
      selectedBranch: null,
      selectedFolder: null,
      selectedTags: [],
      selectedColors: [],
    },
    displayNotes: [],
    hasActiveSearch: false,
    searchMatchCount: 0,
    activeFilterCount: 0,
    allColors: [],
    allTags: [],
    allFolders: [],
    allBranches: [],
    sortMode: { field: 'modified', direction: 'desc' },
    setSortMode: jest.fn(),
    handleClearFilters: jest.fn(),
    handleSelectRepo: jest.fn(),
    handleSelectFormat: jest.fn(),
    handleSelectBranch: jest.fn(),
    handleSelectFolder: jest.fn(),
    handleToggleTag: jest.fn(),
    handleToggleColor: jest.fn(),
  }),
}));

jest.mock('../src/components/notes/useNotesListNoteActions', () => ({
  useNotesListNoteActions: () => ({
    handleNotePress: jest.fn(),
    handleColorSelect: jest.fn(),
    handleDeleteNote: jest.fn(),
    handleNoteLongPress: jest.fn(),
    handleTogglePin: jest.fn(),
    handleExport: jest.fn(),
    handleOpenColorPicker: jest.fn(),
    handleDuplicate: jest.fn(),
  }),
}));

jest.mock('../src/contexts/TodoContext', () => ({
  useTodos: () => ({
    todos: [],
    createTodo: jest.fn(),
    updateTodo: jest.fn(),
    toggleTodo: jest.fn(),
    refreshTodos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../src/stores/todoStore', () => ({
  useTodoStore: (selector: (s: { deleteTodo: () => void }) => unknown) =>
    selector({ deleteTodo: jest.fn() }),
}));

jest.mock('../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    applyFilters: (items: unknown[]) => items,
    activeCount: 0,
    state: {
      selectedRepo: null,
      selectedBranch: null,
      selectedFolder: null,
      selectedTags: [],
      selectedAccountId: null,
    },
    setSelectedRepo: jest.fn(),
    setSelectedBranch: jest.fn(),
    setSelectedFolder: jest.fn(),
    setSelectedAccountId: jest.fn(),
    toggleTag: jest.fn(),
    clearAll: jest.fn(),
  }),
}));

jest.mock('../src/hooks/useEntityList', () => ({
  useEntityList: () => ({
    filteredData: [],
    searchQuery: '',
    setSearchQuery: jest.fn(),
    sortMode: { field: 'modified', direction: 'desc' },
    setSortMode: jest.fn(),
  }),
}));

jest.mock('../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../src/services/LastSelectionPreferenceService', () => ({
  LastSelectionPreferenceService: { get: jest.fn(async () => ({ repo: undefined, branch: undefined })) },
}));

// Mock expo-blur so BlurView renders as a plain View that forwards testID,
// onLayout, and children. This lets the single-blur assertion be real.
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: (p: { testID?: string; onLayout?: (e: unknown) => void; children?: React.ReactNode }) =>
      <View testID={p.testID} onLayout={p.onLayout as never}>{p.children}</View>,
  };
});

// Use the REAL ScreenHeader (via jest.requireActual) so the single-blur
// assertion exercises the actual component. Other UI helpers stay mocked.
jest.mock('../src/components/ui', () => {
  const { Pressable: RNPressable, Text: RNText, View: RNView } = require('react-native');
  const { ScreenHeader } = jest.requireActual('../src/components/ui/ScreenHeader');
  return {
    ScreenHeader,
    Modal: ({ visible, children }: { visible: boolean; children: React.ReactNode }) =>
      visible ? <RNView testID="branch-picker-modal">{children}</RNView> : null,
    IconButton: ({ children, onPress, testID }: { children: React.ReactNode; onPress?: () => void; testID?: string }) => (
      <RNPressable onPress={onPress} testID={testID}>
        {children}
      </RNPressable>
    ),
    EmptyState: ({ title }: { title: string }) => <RNText>{title}</RNText>,
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
  };
});

jest.mock('../src/components/ui/SafeAreaView', () => {
  const { View: RNView } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <RNView>{children}</RNView> };
});

jest.mock('../src/components/ui/OfflineBanner', () => ({ OfflineBanner: () => null }));
jest.mock('../src/components/ui/ConflictBanner', () => ({ ConflictBanner: () => null }));
jest.mock('../src/components/GitHubActivityIndicator', () => ({ GitHubActivityIndicator: () => null }));

jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));

jest.mock('../src/components/SearchBar', () => {
  const { View: RNView } = require('react-native');
  return ({ testID }: { testID?: string }) => <RNView testID={testID} />;
});

jest.mock('../src/components/SortPicker', () => () => null);

jest.mock('../src/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../src/components/EntityFilterModal', () => ({ EntityFilterModal: () => null }));

jest.mock('../src/components/notes/NoteCard', () => {
  const { View: RNView } = require('react-native');
  return { NoteCard: () => <RNView testID="note-card" /> };
});

jest.mock('../src/components/notes/NotesListHeader', () => {
  const { View: RNView } = require('react-native');
  return { NotesListHeader: () => <RNView testID="notes-list.search-bar.search" /> };
});

jest.mock('../src/components/notes/NotesViewModePicker', () => ({ NotesViewModePicker: () => null }));
jest.mock('../src/components/notes/NotesFilterModal', () => ({ NotesFilterModal: () => null }));
jest.mock('../src/components/notes/NotesEmptyState', () => ({ NotesEmptyState: () => null }));
jest.mock('../src/components/notes/NotesContextMenu', () => ({ NotesContextMenu: () => null }));

jest.mock('../src/components/todos/TodosListHeader', () => {
  const { View: RNView } = require('react-native');
  return { TodosListHeader: () => <RNView testID="todos-list-header.search-bar.search" /> };
});

jest.mock('../src/components/todos/TodosEmptyState', () => ({ TodosEmptyState: () => null }));
jest.mock('../src/components/todos/TodoCard', () => ({ TodoCard: () => null }));
jest.mock('../src/components/todos/TodoEditorModal', () => ({ TodoEditorModal: () => null }));

jest.mock('../src/components/list/SwipeableListItem', () => {
  const { View: RNView } = require('react-native');
  return { SwipeableListItem: ({ children }: { children?: React.ReactNode }) => <RNView>{children}</RNView> };
});

jest.mock('../src/components/list/BulkActionBar', () => ({ BulkActionBar: () => null }));

jest.mock('../src/components/RepoFileTree', () => ({
  __esModule: true,
  default: () => null,
}));

import NotesListScreen from '../src/screens/NotesListScreen';
import TodoListScreen from '../src/screens/TodoListScreen';
import ExploreScreen from '../src/screens/ExploreScreen';

function hasAncestorWithTestID(element: { parent: unknown }, testID: string): boolean {
  let node: unknown = element.parent;
  while (node) {
    if (typeof node === 'object' && node !== null && 'props' in node) {
      const props = (node as { props?: { testID?: string } }).props;
      if (props?.testID === testID) return true;
    }
    node = (node as { parent?: unknown })?.parent;
  }
  return false;
}

describe('blurred title + tools header treatment', () => {
  it('renders the NotesList title AND search bar inside a SINGLE blurred header and pads the list below it', () => {
    const screen = render(<NotesListScreen />);

    // The title text and the search bar must both be inside the same blur region.
    const title = screen.getByText('Notes');
    expect(hasAncestorWithTestID(title, 'notes-list.header-blur')).toBe(true);

    const searchBar = screen.getByTestId('notes-list.search-bar.search');
    expect(hasAncestorWithTestID(searchBar, 'notes-list.header-blur')).toBe(true);

    // Initial padding uses the bare header height estimate (60) so the list is
    // never under the header before onLayout fires.
    const list = screen.UNSAFE_getByType(FlatList);
    const initialPaddingTop = (list.props.contentContainerStyle as { paddingTop: number }).paddingTop;
    expect(initialPaddingTop).toBe(60 + 4);

    // After the unified header measures itself, the padding tracks that single height.
    fireEvent(screen.getByTestId('notes-list.header-blur'), 'layout', {
      nativeEvent: { layout: { height: 130 } },
    });

    const paddedList = screen.UNSAFE_getByType(FlatList);
    expect((paddedList.props.contentContainerStyle as { paddingTop: number }).paddingTop).toBe(
      130 + 4,
    );
  });

  it('renders the TodoList title AND search bar inside a SINGLE blurred header', () => {
    const screen = render(<TodoListScreen />);

    const title = screen.getByText('Todos');
    expect(hasAncestorWithTestID(title, 'todos-list.header-blur')).toBe(true);

    const searchBar = screen.getByTestId('todos-list-header.search-bar.search');
    expect(hasAncestorWithTestID(searchBar, 'todos-list.header-blur')).toBe(true);
  });

  it('blurs the Explore repo-list search bar', () => {
    const screen = render(<ExploreScreen />);

    const searchBar = screen.getByTestId('explore.search-bar.repo-search');
    expect(hasAncestorWithTestID(searchBar, 'explore.header-blur')).toBe(true);
  });

  it('renders the Explore file-tree header via ScreenHeader with the repo title and working back button', () => {
    const screen = render(<ExploreScreen />);

    fireEvent.press(screen.getByTestId('explore.button.select-repo'));
    fireEvent.press(screen.getByTestId('explore.button.open-file-tree'));

    expect(screen.getByText('owner/repo')).toBeTruthy();

    // The real ScreenHeader renders the back button as an IconButton with
    // accessibilityLabel="Back" (no hardcoded testID).
    const back = screen.getByLabelText('Back');
    fireEvent.press(back);
    expect(screen.getByTestId('explore.button.open-file-tree')).toBeTruthy();
  });
});
