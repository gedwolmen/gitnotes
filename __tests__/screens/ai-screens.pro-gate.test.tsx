const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
let mockRouteParams: Record<string, unknown> = {};

jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useNavigation: () => ({
      navigate: mockNavigate,
      goBack: mockGoBack,
      canGoBack: () => true,
    }),
    useIsFocused: () => true,
    useFocusEffect: (cb: () => unknown) => React.useEffect(cb),
    useRoute: () => ({ params: mockRouteParams }),
  };
});

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
    radii: { pill: 999 },
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../src/services/ChatStorageService', () => ({
  loadThreads: jest.fn(async () => []),
  loadThreadSummaries: jest.fn(async () => []),
  loadThread: jest.fn(async () => null),
  saveThread: jest.fn(async () => undefined),
  deleteThread: jest.fn(async () => undefined),
  setChatRepoAccount: jest.fn(),
}));

jest.mock('../../src/stores/chatStore', () => {
  const state = {
    threads: [],
    activeThread: null,
    isLoading: false,
    isStreaming: false,
    storageAdapter: null,
    loadThreads: jest.fn(async () => undefined),
    loadThread: jest.fn(async () => undefined),
    addMessage: jest.fn(),
    updateMessage: jest.fn(),
    removeMessage: jest.fn(),
    setStreaming: jest.fn(),
    truncateAfter: jest.fn(),
    deleteThread: jest.fn(async () => undefined),
    createThread: jest.fn(),
    renameThread: jest.fn(async () => undefined),
    setStorageAdapter: jest.fn(),
    error: null,
    clearError: jest.fn(),
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
    providers: [],
    githubToolsEnabled: false,
    getAvailableModels: () => [],
    getSelectedModel: () => null,
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

jest.mock('../../src/services/AIService', () => ({
  initializeModel: jest.fn(async () => ({})),
  streamChatResponse: jest.fn(),
}));

jest.mock('../../src/services/ContextService', () => ({
  buildContextString: jest.fn(async () => ''),
}));

jest.mock('../../src/services/ai/systemPrompt', () => ({
  buildSystemPrompt: jest.fn(() => 'system prompt'),
}));

jest.mock('../../src/services/ai/modelLimits', () => ({
  checkContextBudget: jest.fn(() => ({ warningLevel: 'none', message: '' })),
  getModelContextLimit: jest.fn(() => 8000),
}));

jest.mock('../../src/services/ai/actionExecutor', () => ({
  executeToolCall: jest.fn(async () => ({ success: true, requiresConfirmation: false })),
}));

jest.mock('../../src/services/ai/tools', () => ({
  chatTools: { create_note: { description: 'Create a note' } },
  githubTools: {},
}));

jest.mock('react-native-marked', () => ({
  useMarkdown: () => [],
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
import { Alert } from 'react-native';
import { render } from '@testing-library/react-native';
import ChatThreadListScreen from '../../src/screens/ChatThreadListScreen';
import ChatScreen from '../../src/screens/ChatScreen';
import ThoughtDumpScreen from '../../src/screens/ThoughtDumpScreen';
import { useAIHubStore } from '../../src/stores/aiHubStore';
import { __setProState } from '../../src/stores/proStore';

function setFree(): void {
  __setProState({ status: 'free', entitlementActive: false, isGrandfathered: false });
}

function setPro(): void {
  __setProState({ status: 'pro', entitlementActive: true, isGrandfathered: false });
}

interface CapturedAlertButton {
  text?: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

let alertSpy: jest.SpyInstance;

function lastAlertButtons(): CapturedAlertButton[] {
  const calls = alertSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][2] as CapturedAlertButton[];
}

function pressCapturedButton(style: 'cancel' | 'upgrade'): void {
  const buttons = lastAlertButtons();
  const button =
    style === 'cancel'
      ? buttons.find((b) => b.style === 'cancel')
      : buttons.find((b) => b.style !== 'cancel');
  expect(button).toBeTruthy();
  button?.onPress?.();
}

beforeEach(() => {
  jest.clearAllMocks();
  setPro();
  mockRouteParams = {};
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  alertSpy.mockRestore();
});

describe('AI screen pro guards', () => {
  it('ChatThreadListScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    render(<ChatThreadListScreen />);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('ChatThreadListScreen guard cancel goes back and closes the chat repo picker', () => {
    setFree();
    render(<ChatThreadListScreen />);
    useAIHubStore.getState().openChatRepoPicker();
    expect(useAIHubStore.getState().pickerVisible).toBe(true);
    pressCapturedButton('cancel');
    expect(mockGoBack).toHaveBeenCalled();
    expect(useAIHubStore.getState().pickerVisible).toBe(false);
  });

  it('ChatThreadListScreen guard upgrade opens the Paywall and closes the chat repo picker', () => {
    setFree();
    render(<ChatThreadListScreen />);
    useAIHubStore.getState().openChatRepoPicker();
    expect(useAIHubStore.getState().pickerVisible).toBe(true);
    pressCapturedButton('upgrade');
    expect(mockNavigate).toHaveBeenCalledWith('Paywall');
    expect(useAIHubStore.getState().pickerVisible).toBe(false);
  });

  it('ChatThreadListScreen does not alert for a pro user', () => {
    render(<ChatThreadListScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('ThoughtDumpScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    render(<ThoughtDumpScreen />);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('ThoughtDumpScreen guard cancel goes back', () => {
    setFree();
    render(<ThoughtDumpScreen />);
    pressCapturedButton('cancel');
    expect(mockGoBack).toHaveBeenCalled();
  });

  it('ThoughtDumpScreen does not alert for a pro user', () => {
    render(<ThoughtDumpScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('ChatScreen fires the Pro upgrade alert for a free user', () => {
    setFree();
    mockRouteParams = { threadId: 't-abc' };
    render(<ChatScreen />);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('ChatScreen does not alert for a pro user', () => {
    mockRouteParams = { threadId: 't-abc' };
    render(<ChatScreen />);
    expect(alertSpy).not.toHaveBeenCalled();
  });
});
