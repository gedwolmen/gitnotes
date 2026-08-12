import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockCreateThread = jest.fn(() => ({ id: 'thread-from-fab' }));
const mockRunOnJSCallbacks: Array<() => void> = [];
let mockAIState = {
  isEnabled: true,
  chatRepoOwner: 'owner',
  chatRepoName: 'repo',
  chatRepoBranch: 'main',
  selectedModelId: 'model-1',
  getAvailableModels: jest.fn(() => [{ id: 'model-1' }]),
};

interface MockPanUpdateEvent {
  readonly translationX: number;
  readonly translationY: number;
}

const mockPanCallbacks: {
  begin: (() => void) | undefined;
  start: (() => void) | undefined;
  update: ((event: MockPanUpdateEvent) => void) | undefined;
  end: ((successful: boolean) => void) | undefined;
  finalize: ((successful: boolean) => void) | undefined;
} = {
  begin: undefined,
  start: undefined,
  update: undefined,
  end: undefined,
  finalize: undefined,
};

async function flushRunOnJSCallbacks(): Promise<void> {
  const callbacks = mockRunOnJSCallbacks.splice(0);
  await act(async () => {
    for (const callback of callbacks) callback();
    await Promise.resolve();
  });
}

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
    runOnJS: (callback: (...args: readonly unknown[]) => unknown) => (
      (...args: readonly unknown[]) => {
        mockRunOnJSCallbacks.push(() => callback(...args));
      }
    ),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const gesture = {
      onBegin: (callback: (event: object) => void) => {
        mockPanCallbacks.begin = () => callback({});
        return gesture;
      },
      onStart: (callback: (event: object) => void) => {
        mockPanCallbacks.start = () => callback({});
        return gesture;
      },
      onUpdate: (callback: (event: MockPanUpdateEvent) => void) => {
        mockPanCallbacks.update = callback;
        return gesture;
      },
      onEnd: (callback: (event: object, successful: boolean) => void) => {
        mockPanCallbacks.end = (successful) => callback({}, successful);
        return gesture;
      },
      onFinalize: (callback: (event: object, successful: boolean) => void) => {
        mockPanCallbacks.finalize = (successful) => callback({}, successful);
        return gesture;
      },
    };
    return gesture;
  };

  return {
    Gesture: {
      Pan: createGesture,
      Tap: createGesture,
      LongPress: createGesture,
      Exclusive: jest.fn((...gestures: readonly unknown[]) => ({ gestures })),
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
  };
});

import { FloatingAIButton } from '../src/components/ai/FloatingAIButton';
import { useAIHubStore } from '../src/stores/aiHubStore';

type HubHelper = 'goNewChat' | 'goChatHistory' | 'goAISettings' | 'goThoughtDump' | 'goVoiceDump';
interface HubActionCase {
  readonly itemId: string;
  readonly label: string;
  readonly helper: HubHelper;
}

const HUB_ACTION_CASES = [
  { itemId: 'new-chat', label: 'New chat', helper: 'goNewChat' },
  { itemId: 'voice-dump', label: 'Voice dump', helper: 'goVoiceDump' },
  { itemId: 'chat-history', label: 'Chat history', helper: 'goChatHistory' },
  { itemId: 'ai-settings', label: 'AI settings', helper: 'goAISettings' },
  { itemId: 'thought-dump', label: 'Thought dump', helper: 'goThoughtDump' },
] as const satisfies readonly HubActionCase[];

async function renderInitializedFloatingAIButton() {
  const rendered = render(<FloatingAIButton currentRouteName="Home" />);
  await act(async () => {
    await Promise.resolve();
  });
  await waitFor(() => {
    expect(AccessibilityInfo.isReduceMotionEnabled).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.getItem).toHaveBeenCalledWith('ai-button-position');
  });
  return rendered;
}

describe('FloatingAIButton liquid hub', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockRunOnJSCallbacks.length = 0;
    mockPanCallbacks.begin = undefined;
    mockPanCallbacks.start = undefined;
    mockPanCallbacks.update = undefined;
    mockPanCallbacks.end = undefined;
    mockPanCallbacks.finalize = undefined;
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
    const { getByTestId } = await renderInitializedFloatingAIButton();

    fireEvent.press(getByTestId('floating-ai.button.navigate-chat'));

    expect(goNewChat).toHaveBeenCalledTimes(1);
    expect(mockCreateThread).toHaveBeenCalledWith(
      expect.objectContaining({ repoOwner: 'owner', repoName: 'repo', branch: 'main' }),
    );
    expect(mockNavigate).toHaveBeenCalledWith('ChatScreen', {
      threadId: 'thread-from-fab',
    });
  });

  it('opens the repo picker instead of navigating when no chat repo is configured', async () => {
    mockAIState = { ...mockAIState, chatRepoOwner: '', chatRepoName: '' };
    const openChatRepoPicker = jest.spyOn(
      useAIHubStore.getState(),
      'openChatRepoPicker',
    );
    const { getByTestId } = await renderInitializedFloatingAIButton();

    fireEvent.press(getByTestId('floating-ai.button.navigate-chat'));

    expect(openChatRepoPicker).toHaveBeenCalledTimes(1);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('shows all five hub items after a long press without navigating', async () => {
    const { getByRole, getByTestId } = await renderInitializedFloatingAIButton();

    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    await waitFor(() => {
      for (const item of HUB_ACTION_CASES) {
        expect(getByTestId(`floating-ai.hub.${item.itemId}`)).toBeTruthy();
        expect(getByRole('button', { name: item.label })).toBeTruthy();
      }
    });
    expect(
      getByTestId('floating-ai.button.navigate-chat').props.accessibilityState,
    ).toEqual({ expanded: true });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('closes the open hub from the central button without starting a chat', async () => {
    // Given
    const goNewChat = jest.spyOn(useAIHubStore.getState(), 'goNewChat');
    const openChatRepoPicker = jest.spyOn(
      useAIHubStore.getState(),
      'openChatRepoPicker',
    );
    const { getByTestId, queryByTestId } = await renderInitializedFloatingAIButton();
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');
    await waitFor(() => {
      expect(
        getByTestId('floating-ai.button.navigate-chat').props.accessibilityState,
      ).toEqual({ expanded: true });
    });

    // When
    fireEvent.press(getByTestId('floating-ai.button.navigate-chat'));

    // Then
    await waitFor(() => {
      for (const item of HUB_ACTION_CASES) {
        expect(queryByTestId(`floating-ai.hub.${item.itemId}`)).toBeNull();
      }
      expect(queryByTestId('floating-ai.hub.backdrop')).toBeNull();
      expect(
        getByTestId('floating-ai.button.navigate-chat').props.accessibilityState,
      ).toEqual({ expanded: false });
    });
    expect(goNewChat).not.toHaveBeenCalled();
    expect(openChatRepoPicker).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('stays collapsed when pan recognition begins before a second long press', async () => {
    const { getByTestId, queryByTestId } = await renderInitializedFloatingAIButton();
    const trigger = getByTestId('floating-ai.button.navigate-chat');
    fireEvent(trigger, 'longPress');
    await waitFor(() => expect(getByTestId('floating-ai.hub.new-chat')).toBeTruthy());
    expect(mockPanCallbacks.begin).toBeDefined();

    act(() => mockPanCallbacks.begin?.());
    await flushRunOnJSCallbacks();

    fireEvent(trigger, 'longPress');

    await waitFor(() => expect(queryByTestId('floating-ai.hub.new-chat')).toBeNull());
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it.each(HUB_ACTION_CASES)('calls $helper and collapses after item selection', async ({ itemId, helper }) => {
    const action = jest.spyOn(useAIHubStore.getState(), helper).mockImplementation(() => undefined);
    const { getByTestId, queryByTestId } = await renderInitializedFloatingAIButton();
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    fireEvent.press(getByTestId(`floating-ai.hub.${itemId}`));

    expect(action).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(queryByTestId(`floating-ai.hub.${itemId}`)).toBeNull());
  });

  it('collapses on backdrop press without navigating', async () => {
    const { getByTestId, queryByTestId } = await renderInitializedFloatingAIButton();
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    fireEvent.press(getByTestId('floating-ai.hub.backdrop'));

    await waitFor(() => expect(queryByTestId('floating-ai.hub.new-chat')).toBeNull());
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
