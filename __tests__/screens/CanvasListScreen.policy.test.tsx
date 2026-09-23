/**
 * Policy behavior tests for CanvasListScreen.
 *
 * Tests the Visual Canvas free / ASCII Diagram Pro-only policy:
 * - Visual Canvas creation and opening: free users can access without paywall
 * - ASCII Diagram creation: free users are blocked by paywall
 *
 * Run with: yarn jest __tests__/screens/CanvasListScreen.policy.test.tsx --no-coverage --forceExit --testPathIgnorePatterns "^$"
 */

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import CanvasListScreen from '@/screens/CanvasListScreen';

// ---------------------------------------------------------------------------
// Shared mock state — controlled per-test via Object.assign
// ---------------------------------------------------------------------------

const mockProState = { isPro: false, openPaywall: jest.fn() };

// ---------------------------------------------------------------------------
// Module-level mocks
// ---------------------------------------------------------------------------

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement('View', props, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  return {
    GestureHandlerRootView: View,
    Swipeable: View,
    DrawerLayout: View,
    FlatList: View,
    ScrollView: View,
    PanGestureHandler: View,
    TapGestureHandler: View,
    State: {},
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
    Easing: { linear: (v: number) => v },
  };
});

const mockNavigate = jest.fn();
const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    setParams: jest.fn(),
    canGoBack: () => true,
  }),
  useRoute: () => ({ params: {} }),
  useFocusEffect: jest.fn(),
  NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => children,
    Screen: ({ children }: { children: React.ReactNode }) => children,
  }),
}));

jest.mock('react-native', () => {
  const React = require('react');
  const RNView = ({ children, testID, accessibilityLabel, accessibilityRole, onPress, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', { testID, accessibilityLabel, accessibilityRole, onPress, ...props }, children);
  RNView.displayName = 'View';
  return {
    __esModule: true,
    View: RNView,
    Text: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('Text', props, children),
    TouchableOpacity: ({ children, testID, accessibilityLabel, accessibilityRole, onPress, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('TouchableOpacity', { testID, accessibilityLabel, accessibilityRole, onPress, ...props }, children),
    FlatList: ({ data, keyExtractor, renderItem, ListEmptyComponent, testID, contentContainerStyle: _contentContainerStyle, ...props }: Record<string, unknown>) => {
      const items = data as unknown[];
      if (!items || items.length === 0) {
        return (ListEmptyComponent as unknown) as null;
      }
      return React.createElement('View', { testID, ...props },
        items.map((item: unknown) => {
          const key = keyExtractor(item);
          const rendered = renderItem({ item });
          return React.createElement('View', { key }, rendered);
        })
      );
    },
    Modal: ({ children, visible }: { children: React.ReactNode; visible: boolean }) =>
      visible ? (children as unknown) : null,
    TextInput: (props: Record<string, unknown>) => React.createElement('TextInput', props),
    Alert: { alert: jest.fn() },
    Platform: { OS: 'ios', select: (opts: object) => opts },
    PixelRatio: { get: () => 2 },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    StyleSheet: {
      create: (s: Record<string, unknown>) => s,
      flatten: (s: unknown) => (Array.isArray(s) ? Object.assign({}, ...s) : s),
      hairlineWidth: 0.5,
    },
    KeyboardAvoidingView: ({ children }: { children: React.ReactNode }) => children,
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => 'Icon',
}));

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

const mockCanvases = [
  { id: 'canvas-1', title: 'Test Canvas', content: {} },
];

jest.mock('@/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: mockCanvases,
    filteredCanvases: mockCanvases,
    searchQuery: '',
    setSearchQuery: jest.fn(),
    deleteCanvas: jest.fn(),
    refreshCanvases: jest.fn(),
  }),
}));

jest.mock('@/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: [],
  }),
}));

jest.mock('@/hooks/useEntityFilter', () => ({
  useEntityFilter: () => ({
    applyFilters: (items: unknown[]) => items,
    activeCount: 0,
  }),
}));

jest.mock('@/components/SearchBar', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ testID }: { testID?: string }) => React.createElement(View, { testID }),
  };
});

jest.mock('@/components/ui', () => {
  const React = require('react');
  const { View, TouchableOpacity } = require('react-native');
  return {
    ScreenHeader: ({ title: _title, onBack: _onBack, actions }: { title: string; onBack?: () => void; actions?: React.ReactNode }) =>
      React.createElement(View, { testID: 'screen-header' }, actions),
    IconButton: ({ testID, onPress, children }: { testID?: string; onPress?: () => void; children?: React.ReactNode }) =>
      React.createElement(TouchableOpacity, { testID, onPress }, children),
    useScreenHeaderHeight: () => 44,
    useTabBarHeight: () => 49,
  };
});

jest.mock('@/components/ui/SafeAreaView', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, ...props }: { children: React.ReactNode; [key: string]: unknown }) =>
      React.createElement(View, props, children),
  };
});

jest.mock('@/components/EntityFilterModal', () => ({
  EntityFilterModal: () => null,
}));

jest.mock('@/components/ActiveFilterStrip', () => ({
  ActiveFilterStrip: () => null,
}));

jest.mock('@/components/CanvasCard', () => {
  const React = require('react');
  const { TouchableOpacity } = require('react-native');
  return {
    __esModule: true,
    default: ({ canvas, onPress, onLongPress }: { canvas: { id: string; title: string }; onPress?: () => void; onLongPress?: () => void }) =>
      React.createElement(TouchableOpacity, { onPress, onLongPress, testID: 'canvas-card-' + canvas.id }),
  };
});

jest.mock('@/components/list/SwipeableListItem', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    SwipeableListItem: ({ children }: { children: unknown }) => {
      return React.createElement(View, null, children);
    },
  };
});

jest.mock('@/components/list/BulkActionBar', () => ({
  BulkActionBar: () => null,
}));

jest.mock('@/utils/haptics', () => ({
  HapticService: {
    success: jest.fn(),
    warning: jest.fn(),
  },
}));

// DocumentTypePickerModal mock — renders inline for behavioral testing
jest.mock('@/components/editor/DocumentTypePickerModal', () => {
  const React = require('react');
  const { View, TouchableOpacity } = require('react-native');
  return {
    DocumentTypePickerModal: ({ visible, onSelectVisualCanvas, onSelectDiagram, onClose }: {
      visible: boolean;
      onSelectVisualCanvas: () => void;
      onSelectDiagram: () => void;
      onClose: () => void;
    }) => {
      if (!visible) return null;
      return React.createElement(View, { testID: 'document-type-picker-modal' },
        React.createElement(TouchableOpacity, { testID: 'picker-button.visual-canvas', onPress: onSelectVisualCanvas }),
        React.createElement(TouchableOpacity, { testID: 'picker-button.ascii-diagram', onPress: onSelectDiagram }),
        React.createElement(TouchableOpacity, { testID: 'picker-button.cancel', onPress: onClose }),
      );
    },
  };
});

// useProGate mock — reads from shared mockProState object
jest.mock('@/hooks/useProGate', () => ({
  useProGate: () => mockProState,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CanvasListScreen policy — Visual Canvas free / ASCII Diagram Pro-only', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to free user by default
    mockProState.isPro = false;
    mockProState.openPaywall = jest.fn();
  });

  // -------------------------------------------------------------------------
  // Visual Canvas — free for all users
  // -------------------------------------------------------------------------

  describe('Visual Canvas creation — free for all users', () => {
    it('free user: tapping new canvas opens DocumentTypePickerModal without calling paywall', () => {
      const { getByTestId } = render(React.createElement(CanvasListScreen));

      // Tap "new canvas" button in header
      fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));

      // DocumentTypePickerModal should appear
      expect(getByTestId('document-type-picker-modal')).toBeTruthy();
      // Paywall should NOT have been called
      expect(mockProState.openPaywall).not.toHaveBeenCalled();
    });

    it('free user: selecting Visual Canvas from picker reaches size picker without calling paywall', () => {
      const { getByTestId } = render(React.createElement(CanvasListScreen));

      // Open picker
      fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));
      expect(getByTestId('document-type-picker-modal')).toBeTruthy();

      // Select Visual Canvas
      fireEvent.press(getByTestId('picker-button.visual-canvas'));

      // Size picker modal should now be visible
      expect(getByTestId('canvas-list.overlay.size-picker')).toBeTruthy();
      // Paywall should NOT have been called
      expect(mockProState.openPaywall).not.toHaveBeenCalled();
    });
  });

  describe('Visual Canvas opening — free for all users', () => {
    it('free user: opening a canvas navigates to CanvasEditor without calling paywall', () => {
      const { getByTestId } = render(React.createElement(CanvasListScreen));

      // Tap the canvas card to trigger handleOpen
      fireEvent.press(getByTestId('canvas-card-canvas-1'));

      // Should navigate to CanvasEditor with canvasId
      expect(mockNavigate).toHaveBeenCalledWith('CanvasEditor', { canvasId: 'canvas-1' });
      // Paywall should NOT have been called
      expect(mockProState.openPaywall).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // ASCII Diagram — Pro-only
  // -------------------------------------------------------------------------

  describe('ASCII Diagram creation — Pro-only', () => {
    it('free user: selecting ASCII Diagram from picker calls paywall and does not navigate', () => {
      const { getByTestId } = render(React.createElement(CanvasListScreen));

      // Open picker
      fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));
      expect(getByTestId('document-type-picker-modal')).toBeTruthy();

      // Select ASCII Diagram
      fireEvent.press(getByTestId('picker-button.ascii-diagram'));

      // Paywall should have been called (user is free)
      expect(mockProState.openPaywall).toHaveBeenCalledTimes(1);
      // Should NOT navigate to DiagramEditor
      expect(mockNavigate).not.toHaveBeenCalledWith(
        expect.objectContaining({ screen: 'DiagramEditor' }),
      );
    });

    it('Pro user: selecting ASCII Diagram does NOT call paywall', () => {
      // Switch to Pro user
      mockProState.isPro = true;

      const { getByTestId } = render(React.createElement(CanvasListScreen));

      // Open picker
      fireEvent.press(getByTestId('canvas-list.icon-button.new-canvas'));
      expect(getByTestId('document-type-picker-modal')).toBeTruthy();

      // Select ASCII Diagram
      fireEvent.press(getByTestId('picker-button.ascii-diagram'));

      // Paywall should NOT have been called (user is Pro)
      expect(mockProState.openPaywall).not.toHaveBeenCalled();
    });
  });
});
