import React from 'react';
import { ActivityIndicator, RefreshControl } from 'react-native';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import NotesListScreen from '../src/screens/NotesListScreen';
import TodoListScreen from '../src/screens/TodoListScreen';
import { GitHubActivityIndicator } from '../src/components/GitHubActivityIndicator';
import { OfflineBanner } from '../src/components/ui/OfflineBanner';
import { useGitHubActivityStore } from '../src/stores/githubActivityStore';
import { useGitOperationStore, gitOperationRegistry } from '../src/stores/gitOperationStore';
import { GitSyncGate } from '../src/services/git/GitSyncGate';
import { HapticService } from '../src/utils/haptics';

const mockNavigate = jest.fn();
const mockSyncNow = jest.fn(async () => ({ ok: true }));
const mockUseNetworkStatus = jest.fn();

let mockPendingCount = 0;
const mockPendingCountFn = jest.fn(async () => mockPendingCount);

// ---- i18n: per-file mock that supports switching languages (overrides the
// en-only react-i18next mock from jest.setup). The offline banner case needs
// to resolve sync.offlineBanner from two different locale bundles. ----
jest.mock('react-i18next', () => {
  const en = require('../src/i18n/en.json');
  const es = require('../src/i18n/es.json');
  let current: Record<string, unknown> = en;
  function resolveKey(obj: Record<string, unknown>, path: string): string {
    const keys = path.split('.');
    let currentValue: unknown = obj;
    for (const k of keys) {
      if (currentValue && typeof currentValue === 'object' && k in (currentValue as Record<string, unknown>)) {
        currentValue = (currentValue as Record<string, unknown>)[k];
      } else {
        return path;
      }
    }
    return typeof currentValue === 'string' ? currentValue : path;
  }
  return {
    useTranslation: () => ({
      t: (key: string) => resolveKey(current, key),
      i18n: { changeLanguage: jest.fn(async () => undefined) },
    }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
    __setLanguage: (lng: string) => {
      current = lng === 'es' ? es : en;
    },
  };
});

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockUseNetworkStatus(),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    filteredNotes: [],
    isLoading: false,
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteNote: jest.fn(),
    refreshNotes: jest.fn(),
    togglePin: jest.fn(),
    error: null,
    createNote: jest.fn(),
    updateNote: jest.fn(),
  }),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../src/contexts/ViewModeContext', () => ({
  useViewMode: () => ({ viewMode: 'list', setViewMode: jest.fn() }),
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

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: { setToken: jest.fn() },
}));

jest.mock('../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    pendingCount: () => mockPendingCountFn(),
    subscribe: jest.fn(() => jest.fn()),
    drain: jest.fn(async () => ({ succeeded: 0, failed: 0, remaining: 0 })),
    enqueueNoteDeletes: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../src/services/git/manualSync', () => ({
  syncNow: (...args: unknown[]) => mockSyncNow(...args),
  isSyncNowRunning: jest.fn(() => false),
}));

jest.mock('../src/services/ShareService', () => ({
  ShareService: { isAvailable: jest.fn(() => false) },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: { deleteNote: jest.fn(async () => true), deleteTodo: jest.fn(async () => true) },
}));

jest.mock('../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(async () => ({ success: true, deleted: [], failed: [] })),
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, hint?: string) => hint ?? 'main'),
}));

jest.mock('../src/stores/todoStore', () => ({
  useTodoStore: (selector: (state: { deleteTodo: () => Promise<boolean> }) => unknown) =>
    selector({ deleteTodo: jest.fn(async () => true) }),
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    selection: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 720 }),
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
  useEntityList: ({ data }: { data: unknown[] }) => ({
    filteredData: data,
    searchQuery: '',
    setSearchQuery: jest.fn(),
  }),
}));

jest.mock('../src/components/notes/useNotesListFilters', () => ({
  useNotesListFilters: () => ({
    filters: {
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
    sortMode: 'recent',
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

jest.mock('../src/components/ui', () => {
  const React = require('react');
  const { Text, View, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
      <View>
        <Text testID="screen-header">{title}</Text>
        {actions}
      </View>
    ),
    IconButton: ({
      testID,
      onPress,
      children,
    }: {
      testID?: string;
      onPress?: () => void;
      children?: React.ReactNode;
    }) => (
      <Pressable testID={testID} onPress={onPress}>
        {children}
      </Pressable>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
  };
});

jest.mock('../src/components/ColorPicker', () => ({ __esModule: true, default: () => null }));
jest.mock('../src/components/ui/ConflictBanner', () => ({ ConflictBanner: () => null }));
jest.mock('../src/components/FilterBar', () => ({ FilterBar: () => null }));
jest.mock('../src/components/list/BulkActionBar', () => ({ BulkActionBar: () => null }));
jest.mock('../src/components/notes/NotesListHeader', () => ({ NotesListHeader: () => null }));
jest.mock('../src/components/notes/NotesViewModePicker', () => ({ NotesViewModePicker: () => null }));
jest.mock('../src/components/notes/NotesFilterModal', () => ({ NotesFilterModal: () => null }));
jest.mock('../src/components/notes/NotesContextMenu', () => ({ NotesContextMenu: () => null }));
jest.mock('../src/components/todos/TodosListHeader', () => ({ TodosListHeader: () => null }));
jest.mock('../src/components/todos/TodoEditorModal', () => ({ TodoEditorModal: () => null }));
jest.mock('../src/components/EntityFilterModal', () => ({ EntityFilterModal: () => null }));

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(
    ({ children }: { children?: React.ReactNode }, _ref: React.Ref<unknown>) => (
      <View>{children}</View>
    ),
  );
});

function textOf(node: { props: { children: unknown } }): string {
  const children = node.props.children;
  if (Array.isArray(children)) return children.join('');
  return String(children ?? '');
}

function seedCycleBusy(): void {
  act(() => {
    gitOperationRegistry.begin({ kind: 'pull', repo: '*', entityIds: [], attempts: 0, status: 'running' });
  });
}

describe('git-state surfaces', () => {
  beforeEach(() => {
    mockPendingCount = 0;
    mockNavigate.mockClear();
    mockSyncNow.mockClear();
    mockPendingCountFn.mockClear();
    mockUseNetworkStatus.mockReturnValue({ isConnected: true, isInternetReachable: true });
    useGitOperationStore.setState({ ops: {} });
    useGitHubActivityStore.getState().reset();
    GitSyncGate.__resetForTest();
  });

  it('shows the persistent cloud-upload badge with the queue count while the pill is hidden', async () => {
    mockPendingCount = 2;

    const { getByTestId, getByText, queryByTestId } = renderWithTheme(<NotesListScreen />);

    await waitFor(() => expect(getByText('2')).toBeTruthy());
    expect(getByTestId('icon-cloud-upload')).toBeTruthy();
    // Transient activity affordance is not rendered while the persistent
    // queue badge is: no HTTP activity means no pill, but pending>0 still
    // shows the count.
    expect(queryByTestId('github-activity-indicator')).toBeNull();
    expect(useGitHubActivityStore.getState().visible).toBe(false);
  });

  it('renders a spinner on the cloud icon and no-ops the press while the gate cycle is held', () => {
    seedCycleBusy();

    const { getByTestId, UNSAFE_getByType } = renderWithTheme(<NotesListScreen />);

    expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    fireEvent.press(getByTestId('notes-list.icon-button.sync'));
    expect(mockSyncNow).not.toHaveBeenCalled();
    expect(HapticService.warning).toHaveBeenCalled();
  });

  it('never renders a trailing-ellipsis label for the pill (default or provided)', () => {
    // Default label: store label is null, the fallback must be ellipsis-free.
    useGitHubActivityStore.setState({ label: null });
    const defaultRender = renderWithTheme(<GitHubActivityIndicator />);
    const defaultText = defaultRender.getByText(/Syncing with GitHub/);
    expect(textOf(defaultText).endsWith('…')).toBe(false);
    defaultRender.unmount();

    // Provided label with a legacy trailing ellipsis gets stripped defensively.
    useGitHubActivityStore.setState({ label: 'Pushing note…' });
    const providedRender = renderWithTheme(<GitHubActivityIndicator />);
    const providedText = providedRender.getByText(/Pushing note/);
    expect(textOf(providedText)).toBe('Pushing note');
    expect(textOf(providedText).includes('…')).toBe(false);
    providedRender.unmount();
  });

  it('disables pull-to-refresh on both list screens while a git cycle is held', () => {
    seedCycleBusy();

    const notes = renderWithTheme(<NotesListScreen />);
    expect(notes.UNSAFE_getByType(RefreshControl).props.enabled).toBe(false);
    notes.unmount();

    const todos = renderWithTheme(<TodoListScreen />);
    expect(todos.UNSAFE_getByType(RefreshControl).props.enabled).toBe(false);
    todos.unmount();
  });

  it('keeps pull-to-refresh enabled when idle', () => {
    const notes = renderWithTheme(<NotesListScreen />);
    expect(notes.UNSAFE_getByType(RefreshControl).props.enabled).toBe(true);
    notes.unmount();

    const todos = renderWithTheme(<TodoListScreen />);
    expect(todos.UNSAFE_getByType(RefreshControl).props.enabled).toBe(true);
    todos.unmount();
  });

  it('localizes the offline banner across at least two locales', () => {
    const i18nMock = require('react-i18next') as unknown as { __setLanguage: (lng: string) => void };
    mockUseNetworkStatus.mockReturnValue({ isConnected: false, isInternetReachable: false });

    const enResources = require('../src/i18n/en.json');
    const esResources = require('../src/i18n/es.json');

    i18nMock.__setLanguage('en');
    const enRender = renderWithTheme(<OfflineBanner />);
    expect(enRender.getByText(enResources.sync.offlineBanner)).toBeTruthy();
    enRender.unmount();

    i18nMock.__setLanguage('es');
    const esRender = renderWithTheme(<OfflineBanner />);
    expect(esRender.getByText(esResources.sync.offlineBanner)).toBeTruthy();
    esRender.unmount();
  });
});
