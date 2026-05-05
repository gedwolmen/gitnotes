// Mocks for the @testing-library/react-native render path.

// expo-crypto ships ESM; the jest transform pipeline can't load it. The
// real surface area we depend on is `randomUUID` (consumed by
// `src/utils/ids.ts`). Tests that need to control its behaviour can still
// override this with a per-file `jest.mock('expo-crypto', ...)`.
jest.mock('react-i18next', () => {
  const en = require('./src/i18n/en.json');

  function resolve(obj: Record<string, unknown>, path: string): string {
    const keys = path.split('.');
    let current: unknown = obj;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[k];
      } else {
        return path;
      }
    }
    return typeof current === 'string' ? current : path;
  }

  return {
    useTranslation: () => ({
      t: (key: string, params?: Record<string, string>) => {
        const value = resolve(en, key);
        if (!params) return value;
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{{${k}}}`, v),
          value,
        );
      },
      i18n: { changeLanguage: jest.fn() },
    }),
    initReactI18next: { type: '3rdParty', init: jest.fn() },
  };
});

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'en' }],
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () =>
    `test-${Math.random().toString(36).slice(2, 11)}-${Math.random().toString(36).slice(2, 11)}`,
}));

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

// reanimated-color-picker pulls in react-native-gesture-handler, which
// depends on a TurboModule that isn't registered in the jest runtime.
// Stub the picker with a passthrough View — its drag interactions can't
// be unit-tested anyway; runtime verification happens on a sim.
jest.mock('reanimated-color-picker', () => {
  const { View } = require('react-native');
  const Stub = ({ children }: { children?: React.ReactNode }) =>
    require('react').createElement(View, null, children);
  return {
    __esModule: true,
    default: Stub,
    Panel1: Stub,
    Panel2: Stub,
    Panel3: Stub,
    Panel4: Stub,
    Panel5: Stub,
    HueSlider: Stub,
    HueCircular: Stub,
    SaturationSlider: Stub,
    BrightnessSlider: Stub,
    LuminanceSlider: Stub,
    LuminanceCircular: Stub,
    HSLSaturationSlider: Stub,
    OpacitySlider: Stub,
    RedSlider: Stub,
    GreenSlider: Stub,
    BlueSlider: Stub,
    Preview: Stub,
    PreviewText: Stub,
    InputWidget: Stub,
    Swatches: Stub,
    ExtraThumb: Stub,
    colorKit: {},
    useColorPickerContext: () => ({}),
  };
});

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const insets = { top: 0, right: 0, bottom: 0, left: 0 };
  const frame = { x: 0, y: 0, width: 0, height: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (i: typeof insets) => React.ReactNode }) => children(insets),
    SafeAreaView: View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => frame,
    initialWindowMetrics: { insets, frame },
  };
});

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
  supportedAuthenticationTypesAsync: jest.fn(async () => []),
  getEnrolledLevelAsync: jest.fn(async () => 0),
}));

jest.mock('expo-background-task', () => ({
  registerTaskAsync: jest.fn(async () => undefined),
  unregisterTaskAsync: jest.fn(async () => undefined),
  BackgroundTaskResult: {
    Success: 'Success',
    Failed: 'Failed',
  },
  BackgroundTaskStatus: {
    Available: 'Available',
    Denied: 'Denied',
    Restricted: 'Restricted',
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskDefined: jest.fn(() => true),
  unregisterTaskAsync: jest.fn(async () => undefined),
}));
