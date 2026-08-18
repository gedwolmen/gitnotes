const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
  useIsFocused: () => true,
  useRoute: () => ({ params: {} }),
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
  }),
  useTokens: () => ({
    colors: {
      background: '#fff',
      surface: '#f4f4f4',
      primary: '#2563eb',
      accent: '#2563eb',
      text: '#111',
      textSecondary: '#666',
      border: '#ddd',
      error: '#dc2626',
    },
    spacing: [0, 4, 8, 12, 16, 20, 24],
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../src/services/ChatStorageService', () => ({
  loadThreads: jest.fn(async () => []),
  deleteThread: jest.fn(async () => undefined),
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../../src/stores/chatStore', () => {
  const state = {
    threads: [],
    isLoading: false,
    loadThreads: jest.fn(async () => undefined),
    deleteThread: jest.fn(async () => undefined),
    createThread: jest.fn(),
    renameThread: jest.fn(async () => undefined),
    setStorageAdapter: jest.fn(),
    error: null,
    clearThread: jest.fn(),
  };
  return {
    useChatStore: Object.assign(jest.fn((selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state
    ), { getState: () => state }),
  };
});

jest.mock('../../src/stores/aiStore', () => {
  const state = {
    chatRepoOwner: 'o',
    chatRepoName: 'n',
    chatRepoBranch: 'main',
    selectedModelId: null,
    getAvailableModels: () => [],
  };
  return {
    useAIStore: Object.assign(jest.fn((selector?: (s: typeof state) => unknown) =>
      selector ? selector(state) : state
    ), { getState: () => state }),
  };
});

jest.mock('../../src/stores/githubActivityStore', () => ({
  githubActivity: { begin: jest.fn(), end: jest.fn(), setProgress: jest.fn() },
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity } = require('react-native');
  const Stub = ({ children }: { children?: unknown }) => React.createElement(View, null, children);
  const StubRow = ({ children, onPress }: { children?: unknown; onPress?: () => void }) =>
    React.createElement(TouchableOpacity, { onPress }, children);
  return {
    useScreenHeaderHeight: () => 60,
    useTabBarHeight: () => 60,
    TAB_BAR_BASE_HEIGHT: 60,
    ScreenHeader: ({ title, actions, footer }: { title?: unknown; actions?: unknown; footer?: unknown }) =>
      React.createElement(View, null, actions, title, footer),
    Button: ({ label, onPress, testID, disabled }: { label?: unknown; onPress?: () => void; testID?: string; disabled?: boolean }) =>
      React.createElement(TouchableOpacity, { testID, disabled, onPress }, React.createElement(Text, null, String(label))),
    Input: Stub,
    EmptyState: ({ title }: { title?: unknown }) => React.createElement(Text, null, String(title)),
    Modal: Stub,
    Card: Stub,
    Group: Stub,
    GroupRow: StubRow,
    Chip: Stub,
    Toggle: Stub,
    Surface: Stub,
    IconButton: StubRow,
    SavingOverlay: Stub,
    TabBar: Stub,
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const React = require('react');
  return {
    SafeAreaView: ({ children }: { children: unknown }) => React.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import React from 'react';
import { render } from '@testing-library/react-native';
import ChatThreadListScreen from '../../src/screens/ChatThreadListScreen';
import ThoughtDumpScreen from '../../src/screens/ThoughtDumpScreen';
import { __setProState } from '../../src/stores/proStore';

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

beforeEach(() => {
  jest.clearAllMocks();
  setPro();
});

describe('AI screen pro guards', () => {
  it('ChatThreadListScreen renders the Pro gate for a free user', () => {
    setFree();
    const { getByTestId } = render(<ChatThreadListScreen />);
    expect(getByTestId('pro-required')).toBeTruthy();
  });

  it('ChatThreadListScreen renders normally for a pro user', () => {
    const { queryByTestId } = render(<ChatThreadListScreen />);
    expect(queryByTestId('pro-required')).toBeNull();
  });

  it('ThoughtDumpScreen renders the Pro gate for a free user', () => {
    setFree();
    const { getByTestId } = render(<ThoughtDumpScreen />);
    expect(getByTestId('pro-required')).toBeTruthy();
  });

  it('ThoughtDumpScreen renders normally for a pro user', () => {
    const { queryByTestId } = render(<ThoughtDumpScreen />);
    expect(queryByTestId('pro-required')).toBeNull();
  });

  it('the Pro gate upgrade button navigates to the Paywall', () => {
    setFree();
    const { getByTestId } = render(<ThoughtDumpScreen />);
    const { fireEvent } = require('@testing-library/react-native');
    fireEvent.press(getByTestId('pro-required.upgrade'));
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
  });
});
