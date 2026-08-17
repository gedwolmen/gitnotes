import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import TodoListScreen from '../../src/screens/TodoListScreen';
import { Todo } from '../../src/models/Todo';

let mockTodosSeed: Todo[] = [];
let mockSearchQuery = '';

const mockSetSearchQuery = jest.fn();
const mockCreateTodo = jest.fn(async () => null);
const mockUpdateTodo = jest.fn(async () => null);
const mockToggleTodo = jest.fn(async () => true);
const mockRefreshTodos = jest.fn(async () => undefined);

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  );
  return {
    __esModule: true,
    default: { addEventListener, fetch },
    addEventListener,
    fetch,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
      accent: '#8b5cf6',
    },
    isDark: false,
  }),
}));

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null }, activeAccountId: null }),
}));

jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: [] }),
}));

jest.mock('../../src/contexts/TodoContext', () => ({
  useTodos: () => ({
    todos: mockTodosSeed,
    createTodo: mockCreateTodo,
    updateTodo: mockUpdateTodo,
    toggleTodo: mockToggleTodo,
    refreshTodos: mockRefreshTodos,
  }),
}));

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: () => jest.fn(async () => true),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    activeCount: 0,
    applyFilters: (items: any[]) => items,
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
    allBranches: [],
    allTags: [],
    allAccountIds: [],
  }),
}));

jest.mock('../../src/hooks/useEntityList', () => ({
  useEntityList: ({ data }: any) => ({
    filteredData: data,
    searchQuery: mockSearchQuery,
    setSearchQuery: mockSetSearchQuery,
  }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/git/BatchGitOperations', () => ({
  batchDeleteFiles: jest.fn(async () => ({ success: true, deleted: [], failed: [] })),
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api') },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: { deleteTodo: jest.fn(async () => true) },
}));

jest.mock('../../src/services/git/resolveBranch', () => ({
  resolveBranch: jest.fn(async (_repo: string, hint?: string) => hint ?? 'main'),
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/git/manualSync', () => ({
  syncNow: jest.fn(async () => ({ ok: true })),
  isSyncNowRunning: jest.fn(() => false),
}));

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn() },
  useGitHubActivityStore: () => ({ inflight: 0 }),
}));

jest.mock('../../src/components/ui', () => ({
  ScreenHeader: ({ title, footer, actions }: { title: string; footer?: React.ReactNode; actions?: React.ReactNode }) => {
    const { Text, View } = require('react-native');
    return (
      <View>
        <Text testID="screen-header">{title}</Text>
        {footer}
        {actions}
      </View>
    );
  },
  useScreenHeaderHeight: () => 60,
  SCREEN_HEADER_BASE_HEIGHT: 60,
  SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
  useTabBarHeight: () => 84,
  TAB_BAR_BASE_HEIGHT: 84,
  IconButton: ({ onPress, accessibilityLabel }: any) => {
    const { Pressable, Text } = require('react-native');
    return (
      <Pressable testID={`icon-btn-${accessibilityLabel}`} onPress={onPress}>
        <Text>{accessibilityLabel}</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../src/components/ui/OfflineBanner', () => ({
  OfflineBanner: () => null,
}));

jest.mock('../../src/components/EntityFilterModal', () => ({
  EntityFilterModal: () => null,
}));

jest.mock('../../src/components/ActiveFilterStrip', () => ({
  ActiveFilterStrip: () => null,
}));

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({
    value,
    onChangeText,
  }: {
    value: string;
    onChangeText: (v: string) => void;
  }) => <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />;
});

jest.mock('../../src/components/todos/TodoCard', () => ({
  TodoCard: ({ todo, onPress, onToggle }: { todo: Todo; onPress: (t: Todo) => void; onToggle: (id: string) => void }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable testID={`todo-card-${todo.id}`} onPress={() => onPress(todo)}>
        <Text>{todo.text}</Text>
      </Pressable>
    );
  },
}));

jest.mock('../../src/components/todos/TodosEmptyState', () => ({
  TodosEmptyState: ({ isFiltered }: { isFiltered: boolean }) => {
    const { Text } = require('react-native');
    return (
      <Text testID="todos-empty-state">
        {isFiltered ? 'No matching todos' : 'No todos yet'}
      </Text>
    );
  },
}));

jest.mock('../../src/components/todos/TodosListHeader', () => ({
  TodosListHeader: ({ searchQuery, onSearchChange }: { searchQuery: string; onSearchChange: (q: string) => void }) => {
    const { TextInput } = require('react-native');
    return (
      <TextInput
        testID="todos-list-header-search"
        value={searchQuery}
        onChangeText={onSearchChange}
      />
    );
  },
}));

jest.mock('../../src/components/todos/TodoEditorModal', () => ({
  TodoEditorModal: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
}));



jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, _ref: any) => (
    <View>{children}</View>
  ));
});

const createTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: `todo-${Math.random().toString(36).slice(2, 8)}`,
  text: 'Test Todo',
  completed: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  tags: [],
  priority: 'medium',
  ...overrides,
});

describe('TodoListScreen', () => {
  beforeEach(() => {
    mockTodosSeed = [];
    mockSearchQuery = '';
    mockSetSearchQuery.mockClear();
    mockCreateTodo.mockClear();
    mockUpdateTodo.mockClear();
    mockToggleTodo.mockClear();
    mockRefreshTodos.mockClear();
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<TodoListScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
  });

  it('shows empty state when no todos exist', () => {
    const { getByText } = render(<TodoListScreen />);
    expect(getByText('No todos yet')).toBeTruthy();
  });

  it('renders a list of todos', () => {
    mockTodosSeed = [
      createTodo({ id: 't1', text: 'Buy groceries' }),
      createTodo({ id: 't2', text: 'Walk the dog' }),
    ];

    const { getByText, getByTestId } = render(<TodoListScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
    expect(getByText('Buy groceries')).toBeTruthy();
    expect(getByText('Walk the dog')).toBeTruthy();
  });

  it('passes search query changes to setSearchQuery', () => {
    const { getByTestId } = render(<TodoListScreen />);
    fireEvent.changeText(getByTestId('todos-list-header-search'), 'groceries');
    expect(mockSetSearchQuery).toHaveBeenCalledWith('groceries');
  });

  it('calls onPress when a todo card is pressed', () => {
    const todo = createTodo({ id: 'press-me', text: 'Pressable Todo' });
    mockTodosSeed = [todo];

    const { getByTestId } = render(<TodoListScreen />);
    fireEvent.press(getByTestId('todo-card-press-me'));
  });

  it('shows add todo button in header actions', () => {
    const { getByTestId } = render(<TodoListScreen />);
    expect(getByTestId('icon-btn-Add todo')).toBeTruthy();
  });

  it('shows filter button in header actions', () => {
    const { getByTestId } = render(<TodoListScreen />);
    expect(getByTestId('icon-btn-Filters')).toBeTruthy();
  });

  it('shows completed filter toggle in header actions', () => {
    const { getByTestId } = render(<TodoListScreen />);
    expect(getByTestId('icon-btn-Toggle completed filter')).toBeTruthy();
  });

  it('shows filtered empty state when search is active with no results', () => {
    mockSearchQuery = 'nonexistent';
    const { getByText } = render(<TodoListScreen />);
    expect(getByText('No matching todos')).toBeTruthy();
  });
});
