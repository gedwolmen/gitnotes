import React from 'react';
import { render, screen } from '@testing-library/react-native';

import DiagramEditorScreen from '@/screens/DiagramEditorScreen';

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  function makeGesture() {
    const chain = {
      activeOffsetX: () => chain,
      activeOffsetY: () => chain,
      failOffsetY: () => chain,
      minPointers: () => chain,
      maxPointers: () => chain,
      averageTouches: () => chain,
      onBegin: () => chain,
      onStart: () => chain,
      onUpdate: () => chain,
      onEnd: () => chain,
      onFinalize: () => chain,
      runOnJS: () => chain,
    };
    return chain;
  }
  return {
    Gesture: {
      Pan: () => makeGesture(),
      Tap: () => makeGesture(),
      Pinch: () => makeGesture(),
      Fling: () => makeGesture(),
      LongPress: () => makeGesture(),
      Native: () => makeGesture(),
      native: () => makeGesture(),
      Simultaneous: () => makeGesture(),
      Race: () => makeGesture(),
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

jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (c: unknown) => c },
    View,
    useSharedValue: (initial: number) => ({ value: initial }),
    useAnimatedStyle: (cb: () => Record<string, unknown>) => cb(),
    withSpring: (v: number) => v,
    withTiming: (v: number) => v,
    runOnJS: (fn: unknown) => fn,
    interpolate: (v: number) => v,
    Easing: { linear: (v: number) => v },
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
    setParams: jest.fn(),
  }),
  useRoute: () => ({
    params: {},
  }),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ children }: { children: React.ReactNode }) => children,
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  const RNView = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', props, children);
  RNView.displayName = 'View';
  const RNText = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('Text', props, children);
  RNText.displayName = 'Text';
  return {
    __esModule: true,
    View: RNView,
    Text: RNText,
    StyleSheet: {
      create: (s: Record<string, unknown>) => s,
      flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s) : s),
    },
    Platform: { OS: 'ios', select: (opts: object) => opts },
    PixelRatio: { get: () => 2 },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Image: RNView,
    TouchableOpacity: RNView,
    Pressable: RNView,
    TextInput: RNView,
    Switch: RNView,
    ActivityIndicator: RNView,
    RefreshControl: RNView,
    Modal: RNView,
    KeyboardAvoidingView: RNView,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    Alert: { alert: jest.fn() },
  };
});

jest.mock('@/contexts/ThemeContext', () => {
  const mockColors = {
    background: '#ffffff',
    text: '#000000',
    textSecondary: '#666666',
    accent: '#0066ff',
    primary: '#0066ff',
    surface: '#f5f5f5',
    card: '#ffffff',
    border: '#e0e0e0',
    shadow: '#000000',
  };
  return {
    useTheme: () => ({ colors: mockColors, style: {}, isDark: false }),
    useTokens: () => ({
      colors: mockColors,
      spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
      radii: { sm: 4, md: 8, lg: 16, full: 9999 },
      type: 'light' as const,
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-file-system/legacy', () => ({
  readAsStringAsync: jest.fn(() => Promise.resolve('')),
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
  cacheDirectory: '/mock/cache/',
}));

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockIcon = (props: { name?: string; size?: number; color?: string }) =>
    React.createElement(View, { testID: 'icon-' + (props.name || '') });
  return {
    Ionicons: Object.assign(MockIcon, { glyphMap: {} }),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

jest.mock('@/hooks/useProScreenGuard', () => ({
  useProScreenGuard: () => false,
}));

jest.mock('@/components/diagram/DiagramEditorContent', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: () => React.createElement(View, { testID: 'diagram-editor-content' }),
  };
});

jest.mock('@/contexts/DiagramContext', () => ({
  DiagramProvider: ({ children }: { children: React.ReactNode }) => children,
  useDiagrams: () => ({
    diagrams: [],
    isLoading: false,
    error: null,
    searchQuery: '',
    setSearchQuery: () => {},
    filteredDiagrams: [],
    createDiagram: () => Promise.resolve(null),
    updateDiagram: () => Promise.resolve(null),
    deleteDiagram: () => Promise.resolve(true),
    getDiagramById: () => undefined,
    refreshDiagrams: () => Promise.resolve(),
    clearError: () => {},
  }),
}));

describe('DiagramEditorScreen', () => {
  it('renders the editor content when not blocked by Pro gate', () => {
    render(<DiagramEditorScreen />);
    expect(screen.getByTestId('diagram-editor-content')).toBeTruthy();
  });
});
