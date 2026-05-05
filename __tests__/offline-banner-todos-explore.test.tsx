import React from 'react';
import { render } from '@testing-library/react-native';

// Mock netinfo at the source so any indirect import resolves.
jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

// Hook-level mock — easier to flip per test than driving NetInfo events.
jest.mock('../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(),
}));

import { useNetworkStatus } from '../src/hooks/useNetworkStatus';

const mockUseNetworkStatus = useNetworkStatus as jest.Mock;

const setOnline = () =>
  mockUseNetworkStatus.mockReturnValue({ isConnected: true, isInternetReachable: true });
const setOffline = () =>
  mockUseNetworkStatus.mockReturnValue({ isConnected: false, isInternetReachable: false });

const BANNER_TEXT = "You're offline — changes won't sync";

// ---------- Shared theme + navigation mocks ----------
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

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: mockColorProxy, isDark: false }),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: { value: string; onChangeText: (value: string) => void }) => (
    <TextInput value={value} onChangeText={onChangeText} />
  );
});

jest.mock('../src/components/SortPicker', () => () => null);

jest.mock('../src/components/ui', () => {
  const { Text, TouchableOpacity } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) => <Text>{title}</Text>,
    IconButton: ({ children, onPress }: any) => (
      <TouchableOpacity onPress={onPress}>{children}</TouchableOpacity>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
  };
});

// ---------- TodoListScreen-specific mocks ----------
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
  useTodoStore: (selector: any) => selector({ deleteTodo: jest.fn() }),
}));

jest.mock('../src/contexts/AuthContext', () => ({
  useAuth: () => ({ authState: { token: null, user: null, isAuthenticated: false } }),
}));

jest.mock('../src/contexts/RepoContext', () => ({
  // Pre-seed a repo so ExploreScreen skips its mount-time refresh effect
  // (avoids spurious act() warnings without affecting banner visibility).
  useRepos: () => ({
    repositories: [{ id: 1, name: 'r', path: 'github:owner/r', branch: 'main' }],
    refreshRepos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../src/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    applyFilters: (items: any[]) => items,
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

jest.mock('../src/components/EntityFilterModal', () => ({
  EntityFilterModal: () => null,
}));

jest.mock('../src/components/ActiveFilterStrip', () => ({
  ActiveFilterStrip: () => null,
}));

jest.mock('../src/components/FilterBar', () => ({
  FilterBar: () => null,
}));

jest.mock('../src/components/GitContextPicker', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../src/services/TodoGitHubSyncService', () => ({
  syncTodoToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../src/services/RepoPullService', () => ({
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('@react-native/datetimepicker', () => () => null);

// ---------- ExploreScreen-specific mocks ----------
jest.mock('../src/components/RepoFileTree', () => ({
  __esModule: true,
  default: () => null,
}));

// FlashList — render items inline so screens render without virtualization.
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: React.forwardRef(({ data, renderItem, ListEmptyComponent }: any, _ref: any) => {
      if (!data?.length) {
        return <View>{ListEmptyComponent ?? null}</View>;
      }
      return <View>{data.map((item: any, index: number) => renderItem({ item, index }))}</View>;
    }),
  };
});

jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const React = require('react');
  const { View } = require('react-native');
  return React.forwardRef(({ children }: any, _ref: any) => <View>{children}</View>);
});

import TodoListScreen from '../src/screens/TodoListScreen';
import ExploreScreen from '../src/screens/ExploreScreen';

describe('OfflineBanner mounted on TodoListScreen and ExploreScreen', () => {
  describe('TodoListScreen', () => {
    it('renders banner when offline', () => {
      setOffline();
      const { getByText } = render(<TodoListScreen />);
      expect(getByText(BANNER_TEXT)).toBeTruthy();
    });

    it('hides banner when online', () => {
      setOnline();
      const { queryByText } = render(<TodoListScreen />);
      expect(queryByText(BANNER_TEXT)).toBeNull();
    });
  });

  describe('ExploreScreen', () => {
    it('renders banner when offline', () => {
      setOffline();
      const { getByText } = render(<ExploreScreen />);
      expect(getByText(BANNER_TEXT)).toBeTruthy();
    });

    it('hides banner when online', () => {
      setOnline();
      const { queryByText } = render(<ExploreScreen />);
      expect(queryByText(BANNER_TEXT)).toBeNull();
    });
  });
});
