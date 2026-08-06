import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockCreateThread = jest.fn(() => ({ id: 'thread-from-fab' }));
let mockAIState = {
  isEnabled: true,
  chatRepoOwner: 'owner',
  chatRepoName: 'repo',
  chatRepoBranch: 'main',
  selectedModelId: 'model-1',
  getAvailableModels: jest.fn(() => [{ id: 'model-1' }]),
};

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: Object.assign(
    jest.fn(() => ({ isEnabled: mockAIState.isEnabled })),
    { getState: () => mockAIState },
  ),
}));

jest.mock('../src/stores/chatStore', () => ({
  useChatStore: Object.assign(jest.fn(), {
    getState: () => ({ createThread: mockCreateThread }),
  }),
}));

jest.mock('../src/contexts/ThemeContext', () => {
  const colors = {
    primary: '#7B8CDE',
    surface: '#FFFFFF',
    elevated: '#FFFFFF',
    text: '#1C1C1E',
    textSecondary: '#6E6E73',
    border: '#D8D8D8',
    highlight: '#FFFFFF',
    shadow: '#BFBFBF',
  };

  return {
    useTheme: () => ({ colors, style: 'neumorphic' }),
    useTokens: () => ({
      colors,
      radii: { sm: 12, md: 18, lg: 24, pill: 999 },
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
      type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    }),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const MockView = require('react-native').View;

  return {
    Canvas: MockView,
    Group: ({ children }: { children: ReactNode }) => children,
    Circle: MockView,
    Paint: ({ children }: { children: ReactNode }) => children,
    Blur: MockView,
    ColorMatrix: MockView,
  };
});

jest.mock('react-native-reanimated', () => {
  const MockView = require('react-native').View;

  return {
    __esModule: true,
    default: { View: MockView },
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useDerivedValue: (callback: () => unknown) => ({ value: callback() }),
    useAnimatedStyle: (callback: () => Record<string, unknown>) => callback(),
    withSpring: (value: unknown) => value,
    runOnJS: (callback: (...args: readonly unknown[]) => unknown) => callback,
  };
});

jest.mock('react-native-gesture-handler', () => {
  const gesture = () => ({
    onStart: gesture,
    onUpdate: gesture,
    onEnd: gesture,
  });

  return {
    Gesture: {
      Pan: gesture,
      Tap: gesture,
      LongPress: gesture,
      Exclusive: jest.fn((...gestures: readonly unknown[]) => ({ gestures })),
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});

import { FloatingAIButton } from '../src/components/ai/FloatingAIButton';
import { useAIHubStore } from '../src/stores/aiHubStore';

type HubHelper = 'goNewChat' | 'goChatHistory' | 'goAISettings' | 'goThoughtDump';
const HUB_ACTION_CASES: [string, HubHelper][] = [
  ['new-chat', 'goNewChat'],
  ['chat-history', 'goChatHistory'],
  ['ai-settings', 'goAISettings'],
  ['thought-dump', 'goThoughtDump'],
];

describe('FloatingAIButton liquid hub', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    useAIHubStore.setState({ pickerVisible: false });
    mockAIState = {
      isEnabled: true,
      chatRepoOwner: 'owner',
      chatRepoName: 'repo',
      chatRepoBranch: 'main',
      selectedModelId: 'model-1',
      getAvailableModels: jest.fn(() => [{ id: 'model-1' }]),
    };
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  });

  it('creates a thread and navigates to ChatScreen when tapped', async () => {
    const goNewChat = jest.spyOn(useAIHubStore.getState(), 'goNewChat');
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);

    fireEvent.press(getByTestId('floating-ai.button.navigate-chat'));

    expect(goNewChat).toHaveBeenCalledTimes(1);
    expect(mockCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({ repoOwner: 'owner', repoName: 'repo', branch: 'main' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('ChatScreen', {
      threadId: 'thread-from-fab',
    });
  });

  it('opens the repo picker instead of navigating when no chat repo is configured', () => {
    mockAIState = { ...mockAIState, chatRepoOwner: '', chatRepoName: '' };
    const openChatRepoPicker = jest.spyOn(
      useAIHubStore.getState(),
      'openChatRepoPicker',
    );
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);

    fireEvent.press(getByTestId('floating-ai.button.navigate-chat'));

    expect(openChatRepoPicker).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows all four hub items after a long press without navigating', async () => {
    const { getByTestId, getByText } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );

    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    await waitFor(() => {
      expect(getByText('New chat')).toBeTruthy();
      expect(getByText('Chat history')).toBeTruthy();
      expect(getByText('AI settings')).toBeTruthy();
      expect(getByText('Thought dump')).toBeTruthy();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('collapses after a second long press without navigating', async () => {
    const { getByTestId, queryByText } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );
    const trigger = getByTestId('floating-ai.button.navigate-chat');
    fireEvent(trigger, 'longPress');

    fireEvent(trigger, 'longPress');

    await waitFor(() => expect(queryByText('New chat')).toBeNull());
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each(HUB_ACTION_CASES)('calls %s helper and collapses after item selection', async (itemId, helper) => {
    const action = jest.spyOn(useAIHubStore.getState(), helper).mockImplementation(() => undefined);
    const { getByTestId, queryByText } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    fireEvent.press(getByTestId(`floating-ai.hub.${itemId}`));

    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByText('New chat')).toBeNull());
  });

  it('collapses on backdrop press without navigating', async () => {
    const { getByTestId, queryByText } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    fireEvent.press(getByTestId('floating-ai.hub.backdrop'));

    await waitFor(() => expect(queryByText('New chat')).toBeNull());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
