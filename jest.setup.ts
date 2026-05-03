// Mocks for the @testing-library/react-native render path.

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: View
  };
});

// Minimal reanimated stub — official mock pulls in TS source that the
// jest transform pipeline can't load. We only need the surface area used
// by neumorphic primitives (useSharedValue, useAnimatedStyle, withSpring,
// Animated.View).
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    View,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (cb: () => Record<string, unknown>) => cb(),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// expo-haptics: noop the native calls.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// AsyncStorage in-memory mock so providers using it for hydration don't crash.
jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k: string, v: string) => { store[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete store[k]; }),
      clear: jest.fn(async () => { store = {}; }),
    },
  };
});
