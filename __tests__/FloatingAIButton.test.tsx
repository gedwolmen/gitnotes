import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSharedValues: Array<{ value: unknown }> = [];
let mockAIEnabled = true;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('../src/stores/aiStore', () => ({
  useAIStore: () => ({ isEnabled: mockAIEnabled }),
}));

jest.mock('../src/contexts/ThemeContext', () => {
  const colors = {
    primary: '#7B8CDE',
    surface: '#FFFFFF',
    highlight: '#FFFFFF',
    shadow: '#BFBFBF',
  };

  return {
    useTheme: () => ({ colors, style: 'neumorphic' }),
    useTokens: () => ({ colors, radii: { sm: 12, md: 18, lg: 24, pill: 999 } }),
  };
});

jest.mock('react-native-reanimated', () => {
  const MockView = require('react-native').View;

  return {
    __esModule: true,
    default: { View: MockView },
    useSharedValue: (initial: unknown) => {
      const sharedValue = { value: initial };
      mockSharedValues.push(sharedValue);
      return sharedValue;
    },
    useDerivedValue: (callback: () => unknown) => ({ value: callback() }),
    useAnimatedStyle: (callback: () => Record<string, unknown>) => callback(),
    withSpring: (value: unknown) => value,
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
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
      Exclusive: jest.fn((pan: unknown, tap: unknown) => ({ pan, tap })),
    },
    GestureDetector: ({ children }: { children: ReactNode }) => children,
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

import { FloatingAIButton } from '../src/components/ai/FloatingAIButton';

describe('FloatingAIButton', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSharedValues.length = 0;
    mockAIEnabled = true;
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  it('renders the liquid visual inside the existing navigation target', async () => {
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(getByTestId('floating-ai.button.navigate-chat')).toBeTruthy();
      expect(getByTestId('floating-ai.button.liquid')).toBeTruthy();
    });
  });

  it.each(['ChatScreen', 'ChatThreadList'])(
    'stays hidden on the %s route',
    async (routeName) => {
      const { queryByTestId } = render(<FloatingAIButton currentRouteName={routeName} />);

      await waitFor(() => {
        expect(queryByTestId('floating-ai.button.navigate-chat')).toBeNull();
        expect(queryByTestId('floating-ai.button.liquid')).toBeNull();
      });
    },
  );

  it('restores the persisted drag position', async () => {
    await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: 40, y: 120 }));

    render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('ai-button-position');
      expect(mockSharedValues[0]?.value).toBe(40);
      expect(mockSharedValues[1]?.value).toBe(120);
      expect(mockSharedValues[2]?.value).toBe(40);
      expect(mockSharedValues[3]?.value).toBe(120);
    });
  });

  it('uses the current Surface visual when Reduce Motion is enabled', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    const { getByTestId, queryByTestId } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );

    await waitFor(() => {
      expect(getByTestId('floating-ai.button.navigate-chat')).toBeTruthy();
      expect(queryByTestId('floating-ai.button.liquid')).toBeNull();
    });
  });
});
