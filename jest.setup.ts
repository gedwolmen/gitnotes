jest.mock('nativewind', () => ({
  cssInterop: () => {},
  rem: (v: number) => v,
  useColorScheme: () => ({ colorScheme: 'light', setColorScheme: jest.fn() }),
  NativeWindStyleSheet: { setDimensions: jest.fn(), setDirection: jest.fn(), setAppearance: jest.fn() },
}));

jest.mock('react-native-css', () => {
  const React = require('react');

  return {
    cssInterop: () => {},
    styled: <Component>(component: Component): Component => component,
    useCssElement: (
      Component: React.ElementType,
      props: Record<string, unknown>,
      mapping: Readonly<Record<string, unknown>>,
    ) => {
      void mapping;
      return React.createElement(Component, props);
    },
    useUnstableNativeVariable: (name: string) => undefined,
  };
});

jest.mock('@rn-primitives/slot', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Slot = React.forwardRef(({ children, ...props }: { children?: React.ReactNode }, ref: React.Ref<unknown>) =>
    React.createElement(View, { ...props, ref }, children)
  );
  Slot.displayName = 'Slot';
  return { __esModule: true, Slot };
});

jest.mock('@rn-primitives/portal', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    PortalHost: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
    Portal: ({ children }: { children?: React.ReactNode }) => React.createElement(View, null, children),
  };
});

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
   
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    View,
    useSharedValue: (initial: unknown) => ({ value: initial }),
    useAnimatedStyle: (cb: () => Record<string, unknown>) => cb(),
    useDerivedValue: (cb: () => unknown) => ({ value: cb() }),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
    withDelay: (_d: unknown, anim: unknown) => anim,
    withSequence: (...anims: unknown[]) => anims[anims.length - 1],
    withRepeat: (anim: unknown) => anim,
    cancelAnimation: () => {},
    runOnJS: (fn: (...args: unknown[]) => unknown) => fn,
    Easing: { linear: (v: unknown) => v, in: (v: unknown) => v, out: (v: unknown) => v, inOut: (v: unknown) => v },
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
      getAllKeys: jest.fn(async () => Object.keys(store)),
      multiGet: jest.fn(async (keys: string[]) =>
        keys.map((k) => [k, k in store ? store[k] : null] as [string, string | null]),
      ),
      multiSet: jest.fn(async (pairs: ReadonlyArray<readonly [string, string]>) => {
        for (const [k, v] of pairs) store[k] = v;
      }),
      multiRemove: jest.fn(async (keys: readonly string[]) => {
        for (const k of keys) delete store[k];
      }),
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

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(async () => ({ canceled: true, assets: [] })),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(async () => ''),
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockIcon = (props: { name?: string }) =>
    React.createElement(View, { testID: 'icon-' + (props.name || '') });
  return {
    Ionicons: Object.assign(MockIcon, {
      glyphMap: { 'logo-github': 0, 'heart': 1, 'book': 2, 'create': 3, 'trash': 4, 'settings': 5 },
    }),
  };
});

jest.mock('./src/components/ui/EmptyState', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    EmptyState: function MockEmptyState({ title, subtitle, testID }: { title: string; subtitle?: string; icon?: string; testID?: string }) {
      return React.createElement(View, { testID: testID || 'empty-state' },
        React.createElement(Text, null, title),
        subtitle && React.createElement(Text, null, subtitle)
      );
    },
  };
});

jest.mock('./src/components/notes/NotesEmptyState', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    NotesEmptyState: function MockNotesEmptyState({ isFiltered }: { isFiltered: boolean }) {
      return React.createElement(View, { testID: 'notes-empty-state' },
        React.createElement(Text, null, isFiltered ? 'No matching notes' : 'No notes yet'),
        React.createElement(Text, null, isFiltered ? 'Try adjusting your search or filters' : 'Create your first note to get started')
      );
    },
  };
});

jest.mock('./src/components/todos/TodosEmptyState', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    TodosEmptyState: function MockTodosEmptyState({ isFiltered }: { isFiltered: boolean }) {
      return React.createElement(View, { testID: 'todos-empty-state' },
        React.createElement(Text, null, isFiltered ? 'No matching todos' : 'No todos yet'),
        React.createElement(Text, null, isFiltered ? 'Try adjusting your filters' : 'Create your first todo to get started')
      );
    },
  };
});

jest.mock('expo-clipboard', () => ({
  getClipboardAsync: jest.fn(async () => ''),
  setClipboardAsync: jest.fn(async () => undefined),
  hasClipboardAsync: jest.fn(async () => false),
}));

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const mockGesture = () => ({
    activeOffsetX: () => mockGesture(),
    activeOffsetY: () => mockGesture(),
    failOffsetY: () => mockGesture(),
    onBegin: () => mockGesture(),
    onStart: () => mockGesture(),
    onUpdate: () => mockGesture(),
    onEnd: () => mockGesture(),
    onFinalize: () => mockGesture(),
    runOnJS: () => mockGesture(),
  });
  return {
    Gesture: {
      Pan: mockGesture,
      Tap: mockGesture,
      Fling: mockGesture,
      LongPress: mockGesture,
      Native: mockGesture,
      native: mockGesture,
    },
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    State: {},
    PanGestureHandler: View,
    TapGestureHandler: View,
    FlingGestureHandler: View,
    LongPressGestureHandler: View,
    NativeViewGestureHandler: View,
    ScrollView: View,
    FlatList: View,
  };
});

jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeListeners: jest.fn(),
  })),
  NativeModulesProxy: {},
  requireNativeModule: jest.fn(),
  requireOptionalNativeModule: jest.fn(),
}));

jest.mock('expo', () => ({
  fetch: jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
  FileSystem: { readAsStringAsync: jest.fn(async () => '') },
  Crypto: { randomUUID: () => 'test-uuid' },
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'test-push-token' })),
  getDevicePushTokenAsync: jest.fn(async () => ({ data: 'test-device-token' })),
  getRegistrationForRemoteNotificationsAsync: jest.fn(async () => null),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  addNotificationReceivedListener: jest.fn(),
  addNotificationsReceivedListener: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  removeNotificationSubscription: jest.fn(),
  dismissNotificationAsync: jest.fn(),
  dismissAllNotificationsAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'notification-id'),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getPresentedNotificationsAsync: jest.fn(async () => []),
}));
