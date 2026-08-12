import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockNavigate = jest.fn();
const mockSharedValues: Array<{ value: unknown }> = [];
const mockSpringCalls: Array<readonly [unknown, unknown]> = [];
const mockRunOnJSCallbacks: Array<() => void> = [];
let mockPanBegin: (() => void) | undefined;
let mockPanStart: (() => void) | undefined;
let mockPanUpdate: ((event: MockPanUpdateEvent) => void) | undefined;
let mockPanEnd: ((successful: boolean) => void) | undefined;
let mockPanFinalize: ((successful: boolean) => void) | undefined;
let mockAIEnabled = true;
let mockTabBarHeight = 0;
let mockWindowDimensions = { width: 320, height: 480, scale: 2, fontScale: 1 };
let mockSafeAreaInsets = { top: 24, right: 0, bottom: 20, left: 0 };

interface Deferred<Value> {
  readonly promise: Promise<Value>;
  readonly resolve: (value: Value) => void;
}

interface MockPanUpdateEvent {
  readonly translationX: number;
  readonly translationY: number;
}

function createDeferred<Value>(): Deferred<Value> {
  const resolver: { resolve?: (value: Value) => void } = {};
  const promise = new Promise<Value>((resolve) => {
    resolver.resolve = resolve;
  });

  return {
    promise,
    resolve: (value) => {
      if (resolver.resolve === undefined) {
        throw new RangeError('Expected deferred promise resolver');
      }
      resolver.resolve(value);
    },
  };
}

async function flushRunOnJSCallbacks(): Promise<void> {
  const callbacks = mockRunOnJSCallbacks.splice(0);
  await act(async () => {
    for (const callback of callbacks) callback();
    await Promise.resolve();
  });
}

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: () => mockWindowDimensions,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => mockSafeAreaInsets,
}));

jest.mock('../src/components/ui/TabBar', () => ({
  useTabBarHeight: () => mockTabBarHeight,
}));

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
      const React: typeof import('react') = require('react');
      const sharedValueRef = React.useRef<{ value: unknown } | null>(null);
      if (sharedValueRef.current === null) {
        sharedValueRef.current = { value: initial };
        mockSharedValues.push(sharedValueRef.current);
      }
      return sharedValueRef.current;
    },
    useDerivedValue: (callback: () => unknown) => ({ value: callback() }),
    useAnimatedStyle: (callback: () => Record<string, unknown>) => callback(),
    withSpring: (value: unknown, config: unknown) => {
      mockSpringCalls.push([value, config]);
      return value;
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => (
      (...args: unknown[]) => {
        mockRunOnJSCallbacks.push(() => callback(...args));
      }
    ),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const createGesture = () => {
    const gesture = {
      onBegin: (callback: (event: object) => void) => {
        mockPanBegin = () => callback({});
        return gesture;
      },
      onStart: (callback: (event: object) => void) => {
        mockPanStart = () => callback({});
        return gesture;
      },
      onUpdate: (callback: (event: MockPanUpdateEvent) => void) => {
        mockPanUpdate = callback;
        return gesture;
      },
      onEnd: (callback: (event: object, successful: boolean) => void) => {
        mockPanEnd = (successful) => callback({}, successful);
        return gesture;
      },
      onFinalize: (callback: (event: object, successful: boolean) => void) => {
        mockPanFinalize = (successful) => callback({}, successful);
        return gesture;
      },
    };
    return gesture;
  };

  return {
    Gesture: {
      Pan: createGesture,
      Tap: createGesture,
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
    mockSpringCalls.length = 0;
    mockRunOnJSCallbacks.length = 0;
    mockPanBegin = undefined;
    mockPanStart = undefined;
    mockPanUpdate = undefined;
    mockPanEnd = undefined;
    mockPanFinalize = undefined;
    mockAIEnabled = true;
    mockTabBarHeight = 0;
    mockWindowDimensions = { width: 320, height: 480, scale: 2, fontScale: 1 };
    mockSafeAreaInsets = { top: 24, right: 0, bottom: 20, left: 0 };
    await AsyncStorage.clear();
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  });

  it('renders the liquid visual inside the existing navigation target', async () => {
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(getByTestId('floating-ai.button.navigate-chat')).toBeTruthy();
      expect(getByTestId('floating-ai.button.liquid')).toBeTruthy();
    });
    expect(mockSpringCalls).toContainEqual([
      0,
      expect.objectContaining({ overshootClamping: true }),
    ]);
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

  it('normalizes stale left and invalid vertical persisted coordinates', async () => {
    await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: -180, y: -90 }));

    render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('ai-button-position');
      expect(mockSharedValues[0]?.value).toBe(16);
      expect(mockSharedValues[1]?.value).toBe(168);
      expect(mockSharedValues[2]?.value).toBe(16);
      expect(mockSharedValues[3]?.value).toBe(168);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        'ai-button-position',
        JSON.stringify({ x: 16, y: 168 }),
      );
    });
  });

  it('clamps oversized persisted coordinates to a smaller viewport', async () => {
    mockWindowDimensions = { width: 320, height: 360, scale: 2, fontScale: 1 };
    await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: 900, y: 1200 }));

    render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(mockSharedValues[0]?.value).toBe(248);
      expect(mockSharedValues[1]?.value).toBe(96);
      expect(mockSharedValues[2]?.value).toBe(248);
      expect(mockSharedValues[3]?.value).toBe(96);
    });
  });

  it('keeps persisted right-side coordinates on the right edge', async () => {
    await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: 260, y: 180 }));

    render(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(mockSharedValues[0]?.value).toBe(248);
      expect(mockSharedValues[1]?.value).toBe(180);
      expect(mockSharedValues[2]?.value).toBe(248);
      expect(mockSharedValues[3]?.value).toBe(180);
    });
  });

  it.each([
    { tabBarHeight: 40, expectedY: 216 },
    { tabBarHeight: 148, expectedY: 168 },
  ])(
    'uses max(tabBarHeight, 100) bottom clearance for height $tabBarHeight',
    async ({ tabBarHeight, expectedY }) => {
      mockTabBarHeight = tabBarHeight;
      await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: 260, y: 900 }));

      render(<FloatingAIButton currentRouteName="Home" />);

      await waitFor(() => {
        expect(mockSharedValues[1]?.value).toBe(expectedY);
        expect(mockSharedValues[3]?.value).toBe(expectedY);
      });
    },
  );

  it('re-normalizes the saved and rendered position when the viewport shrinks', async () => {
    await AsyncStorage.setItem('ai-button-position', JSON.stringify({ x: 260, y: 324 }));
    const { rerender } = render(<FloatingAIButton currentRouteName="Home" />);
    await waitFor(() => expect(mockSharedValues[1]?.value).toBe(216));

    mockWindowDimensions = { width: 280, height: 360, scale: 2, fontScale: 1 };
    rerender(<FloatingAIButton currentRouteName="Home" />);

    await waitFor(() => {
      expect(mockSharedValues[0]?.value).toBe(208);
      expect(mockSharedValues[1]?.value).toBe(96);
      expect(mockSharedValues[2]?.value).toBe(208);
      expect(mockSharedValues[3]?.value).toBe(96);
      expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
        'ai-button-position',
        JSON.stringify({ x: 208, y: 96 }),
      );
    });
  });

  it('uses resize-before-restore geometry through a real pan begin/update/end/finalize', async () => {
    const storedPosition = createDeferred<string | null>();
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => storedPosition.promise);
    const { rerender } = render(<FloatingAIButton currentRouteName="Home" />);

    mockWindowDimensions = { width: 280, height: 360, scale: 2, fontScale: 1 };
    rerender(<FloatingAIButton currentRouteName="Home" />);
    await act(async () => {
      storedPosition.resolve(null);
      await storedPosition.promise;
    });

    await waitFor(() => {
      expect(mockSharedValues[0]?.value).toBe(208);
      expect(mockSharedValues[1]?.value).toBe(96);
      expect(mockSharedValues[2]?.value).toBe(208);
      expect(mockSharedValues[3]?.value).toBe(96);
    });

    expect(mockPanBegin).toBeDefined();
    expect(mockPanStart).toBeDefined();
    expect(mockPanUpdate).toBeDefined();
    expect(mockPanEnd).toBeDefined();
    expect(mockPanFinalize).toBeDefined();
    jest.mocked(AsyncStorage.setItem).mockClear();

    act(() => {
      mockPanBegin?.();
      mockPanStart?.();
      mockPanUpdate?.({ translationX: 20, translationY: -50 });
      mockPanEnd?.(true);
      mockPanFinalize?.(true);
    });
    await flushRunOnJSCallbacks();

    expect(mockSharedValues[0]?.value).toBe(208);
    expect(mockSharedValues[1]?.value).toBe(96);
    expect(mockSharedValues[2]?.value).toBe(208);
    expect(mockSharedValues[3]?.value).toBe(96);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'ai-button-position',
      JSON.stringify({ x: 208, y: 96 }),
    );
  });

  it('does not normalize or persist a canceled endpoint before latest-geometry recovery', async () => {
    const { rerender } = render(<FloatingAIButton currentRouteName="Home" />);
    await waitFor(() => expect(mockPanBegin).toBeDefined());
    await waitFor(() => expect(mockSharedValues[1]?.value).toBe(216));
    jest.mocked(AsyncStorage.setItem).mockClear();

    act(() => {
      mockPanBegin?.();
      mockPanStart?.();
      mockPanUpdate?.({ translationX: -180, translationY: -40 });
    });
    mockWindowDimensions = { width: 280, height: 360, scale: 2, fontScale: 1 };
    rerender(<FloatingAIButton currentRouteName="Home" />);

    expect(mockSharedValues[0]?.value).toBe(68);
    expect(mockSharedValues[1]?.value).toBe(176);
    expect(mockSharedValues[2]?.value).toBe(248);
    expect(mockSharedValues[3]?.value).toBe(216);

    act(() => mockPanEnd?.(false));

    expect(mockSharedValues[0]?.value).toBe(68);
    expect(mockSharedValues[1]?.value).toBe(176);
    expect(mockSharedValues[2]?.value).toBe(248);
    expect(mockSharedValues[3]?.value).toBe(216);
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();

    act(() => mockPanFinalize?.(false));
    await flushRunOnJSCallbacks();

    expect(mockSharedValues[0]?.value).toBe(208);
    expect(mockSharedValues[1]?.value).toBe(96);
    expect(mockSharedValues[2]?.value).toBe(208);
    expect(mockSharedValues[3]?.value).toBe(96);
    expect(AsyncStorage.setItem).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      'ai-button-position',
      JSON.stringify({ x: 208, y: 96 }),
    );
  });

  it.each([
    { storedX: 0, expectedX: 46 },
    { storedX: 320, expectedX: 238 },
  ])(
    'respects asymmetric horizontal safe-area insets when snapping $storedX',
    async ({ storedX, expectedX }) => {
      mockSafeAreaInsets = { top: 24, right: 10, bottom: 20, left: 30 };
      await AsyncStorage.setItem(
        'ai-button-position',
        JSON.stringify({ x: storedX, y: 140 }),
      );

      render(<FloatingAIButton currentRouteName="Home" />);

      await waitFor(() => {
        expect(mockSharedValues[0]?.value).toBe(expectedX);
        expect(mockSharedValues[2]?.value).toBe(expectedX);
      });
    },
  );

  it('normalizes drag-end coordinates with the restore geometry', async () => {
    render(<FloatingAIButton currentRouteName="Home" />);
    await waitFor(() => expect(mockPanEnd).toBeDefined());
    const renderedX = mockSharedValues[0];
    const renderedY = mockSharedValues[1];
    if (renderedX === undefined || renderedY === undefined) {
      throw new RangeError('Expected rendered position shared values');
    }
    renderedX.value = -100;
    renderedY.value = 900;
    mockSpringCalls.length = 0;

    act(() => {
      mockPanEnd?.(true);
      mockPanFinalize?.(true);
    });

    expect(mockSharedValues[0]?.value).toBe(16);
    expect(mockSharedValues[1]?.value).toBe(216);
    expect(mockSharedValues[2]?.value).toBe(16);
    expect(mockSharedValues[3]?.value).toBe(216);
    expect(mockSpringCalls).toEqual([
      [16, expect.objectContaining({ overshootClamping: true })],
      [216, expect.objectContaining({ overshootClamping: true })],
    ]);
  });

  it('resolves and persists the live position before opening on long press', async () => {
    // Given
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);
    await waitFor(() => expect(mockSharedValues[0]).toBeDefined());
    const renderedX = mockSharedValues[0];
    const renderedY = mockSharedValues[1];
    if (renderedX === undefined || renderedY === undefined) {
      throw new RangeError('Expected rendered position shared values');
    }
    renderedX.value = 16;
    renderedY.value = 60;

    // When
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');

    // Then
    expect(mockSharedValues[0]?.value).toBe(16);
    expect(mockSharedValues[1]?.value).toBe(168);
    expect(mockSharedValues[2]?.value).toBe(16);
    expect(mockSharedValues[3]?.value).toBe(168);
    expect(AsyncStorage.setItem).toHaveBeenLastCalledWith(
      'ai-button-position',
      JSON.stringify({ x: 16, y: 168 }),
    );
    expect(getByTestId('floating-ai.button.navigate-chat').props.accessibilityState).toEqual({
      expanded: true,
    });
  });

  it('does not let a delayed restore overwrite a long-press placement', async () => {
    // Given
    const storedPosition = createDeferred<string | null>();
    jest.spyOn(AsyncStorage, 'getItem').mockImplementationOnce(() => storedPosition.promise);
    const { getByTestId } = render(<FloatingAIButton currentRouteName="Home" />);

    // When
    fireEvent(getByTestId('floating-ai.button.navigate-chat'), 'longPress');
    await act(async () => {
      storedPosition.resolve(JSON.stringify({ x: 16, y: 140 }));
      await storedPosition.promise;
    });

    // Then
    await waitFor(() => {
      expect(mockSharedValues[0]?.value).toBe(248);
      expect(mockSharedValues[1]?.value).toBe(216);
      expect(mockSharedValues[2]?.value).toBe(248);
      expect(mockSharedValues[3]?.value).toBe(216);
    });
  });

  it('closes an open hub when viewport geometry changes', async () => {
    // Given
    const { getByTestId, queryByTestId, rerender } = render(
      <FloatingAIButton currentRouteName="Home" />,
    );
    const trigger = getByTestId('floating-ai.button.navigate-chat');
    fireEvent(trigger, 'longPress');
    expect(getByTestId('floating-ai.hub.new-chat')).toBeTruthy();

    // When
    mockWindowDimensions = { width: 280, height: 360, scale: 2, fontScale: 1 };
    rerender(<FloatingAIButton currentRouteName="Home" />);

    // Then
    await waitFor(() => expect(queryByTestId('floating-ai.hub.new-chat')).toBeNull());
    expect(trigger.props.accessibilityState).toEqual({ expanded: false });
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
