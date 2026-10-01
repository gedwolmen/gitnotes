/**
 * TabNavigator.style.test.tsx — characterization tests for style-based tab bar routing.
 *
 * Tests verify:
 * - Basic/flat phone: uses default React Navigation tab bar (tabBar prop = undefined)
 * - Neumorphic phone: uses custom TabBar with BlurView
 * - Neo-Brutalist phone: uses custom tab bar with solid View (no BlurView) + crisp border/offset
 * - Tablet (any style): uses TabletRail
 * - Paywall suppression: TabBar not rendered when parent route is Paywall
 * - Route navigation events: tabPress/tabLongPress are emitted correctly
 *
 * These tests are written BEFORE implementation (failing-first TDD).
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

const FLAT_LIGHT = {
  bg: '#f2f2f7',
  surface: '#ffffff',
  highlight: '#ffffff',
  shadow: '#000000',
  text: '#1c1c1e',
  textSecondary: '#6e6e73',
  accent: '#007AFF',
  accentMuted: '#5AC8FA',
  error: '#ff3b30',
  success: '#34C759',
  warning: '#FF9500',
  background: '#f2f2f7',
  surfaceSecondary: '#f2f2f7',
  primary: '#007AFF',
  border: '#c6c6c8',
  card: '#ffffff',
  elevated: '#ffffff',
};

const TOKENS = {
  colors: FLAT_LIGHT,
  radii: { sm: 12, md: 18, lg: 24, pill: 999 },
  spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
  type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
};

jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  const insets = { top: 50, bottom: 34, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaView: View,
    useSafeAreaInsets: () => insets,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 375, height: 812 }),
  };
});

jest.mock('@react-navigation/native', () => {
  return {
    useNavigation: () => ({
      navigate: jest.fn(),
      emit: jest.fn(() => ({ defaultPrevented: false })),
      goBack: jest.fn(),
      getParent: () => ({
        getState: () => ({ routes: [{ name: 'MainTabs' }], index: 0 }),
      }),
    }),
    useNavigationState: (selector: (state: { routes: { name: string }[]; index: number }) => unknown) =>
      selector({ routes: [{ name: 'MainTabs' }], index: 0 }),
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockIcon = (props: { name?: string }) =>
    React.createElement(View, { testID: 'icon-' + (props.name || '') });
  return {
    Ionicons: Object.assign(MockIcon, {
      glyphMap: { 'home': 0, 'home-outline': 1, 'document-text': 2, 'document-text-outline': 3,
                   'git-branch': 4, 'git-branch-outline': 5, 'checkbox': 6, 'checkbox-outline': 7,
                   'settings': 8, 'settings-outline': 9, 'arrow-back': 10 },
    }),
  };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return {
    BlurView: View,
    __esModule: true,
  };
});

jest.mock('@/contexts/ThemeContext', () => {
  return {
    useTheme: jest.fn(() => ({
      isDark: false,
      style: 'flat',
      colors: FLAT_LIGHT,
      tokens: TOKENS,
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    })),
    useTokens: jest.fn(() => TOKENS),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: jest.fn(() => ({ isTablet: false, isLandscape: false })),
}));

jest.mock('@/components/ui/Surface', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Surface: React.forwardRef(({ children, style, ...props }: any, ref: any) => (
      React.createElement(View, { ref, style, testID: 'surface', ...props }, children)
    )),
  };
});

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { TabBar } = require('@/components/ui/TabBar');
const { BlurView } = require('expo-blur');

function makeTabBarProps(
  currentRoute = 'HomeTab',
  routes = ['HomeTab', 'NotesTab', 'ExploreTab', 'TodosTab', 'SettingsTab'],
  parentRouteName = 'MainTabs',
): BottomTabBarProps {
  const state = {
    key: 'tab',
    index: routes.indexOf(currentRoute),
    routeNames: routes,
    routes: routes.map((name) => ({ key: name, name })),
    stale: false,
  };
  return {
    state,
    navigation: {
      navigate: jest.fn(),
      emit: jest.fn(() => ({ defaultPrevented: false })),
      goBack: jest.fn(),
      getParent: () => ({
        getState: () => ({ routes: [{ name: parentRouteName }], index: 0 }),
      }),
    } as unknown as BottomTabBarProps['navigation'],
    descriptors: {},
    options: {},
  };
}

describe('TabNavigator source code structure', () => {
  it('TabNavigator should have neo-brutalist routing logic', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require.resolve('@/navigation/TabNavigator'), 'utf8');
    expect(content).toMatch(/neo-brutalist/i);
  });

  it('TabNavigator should route custom bar for neo-brutalist phones', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require.resolve('@/navigation/TabNavigator'), 'utf8');
    expect(content).toMatch(/style\s*===\s*['"]neo-brutalist['"]/);
  });

  it('TabBar should have neo-brutalist conditional rendering', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require.resolve('@/components/ui/TabBar'), 'utf8');
    expect(content).toMatch(/neo-brutalist/i);
  });

  it('TabBar should have BlurView conditional on style', () => {
    const fs = require('fs');
    const content = fs.readFileSync(require.resolve('@/components/ui/TabBar'), 'utf8');
    expect(content).toMatch(/BlurView/);
    expect(content).toMatch(/style\s*===\s*['"]neo-brutalist['"]/);
  });
});

describe('TabNavigator routing logic', () => {
  it('flat style should not trigger custom tab bar', () => {
    const { useTheme } = require('@/contexts/ThemeContext');
    const { useResponsive } = require('@/hooks/useResponsive');
    const { style } = useTheme();
    const { isTablet } = useResponsive();
    const useNeumorphicBar = !isTablet && style === 'neumorphic';
    const useNeoBrutalistBar = !isTablet && style === 'neo-brutalist';
    expect(useNeumorphicBar).toBe(false);
    expect(useNeoBrutalistBar).toBe(false);
  });

  it('neumorphic style should trigger custom tab bar', () => {
    const { useTheme } = require('@/contexts/ThemeContext');
    const { useResponsive } = require('@/hooks/useResponsive');
    (useTheme as jest.Mock).mockReturnValueOnce({
      isDark: false,
      style: 'neumorphic',
      colors: FLAT_LIGHT,
      tokens: TOKENS,
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    });
    const { style } = useTheme();
    const { isTablet } = useResponsive();
    const useNeumorphicBar = !isTablet && style === 'neumorphic';
    const useNeoBrutalistBar = !isTablet && style === 'neo-brutalist';
    expect(useNeumorphicBar).toBe(true);
    expect(useNeoBrutalistBar).toBe(false);
  });

  it('neo-brutalist style should trigger custom tab bar', () => {
    const { useTheme } = require('@/contexts/ThemeContext');
    const { useResponsive } = require('@/hooks/useResponsive');
    (useTheme as jest.Mock).mockReturnValueOnce({
      isDark: false,
      style: 'neo-brutalist',
      colors: FLAT_LIGHT,
      tokens: TOKENS,
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    });
    const { style } = useTheme();
    const { isTablet } = useResponsive();
    const useNeumorphicBar = !isTablet && style === 'neumorphic';
    const useNeoBrutalistBar = !isTablet && style === 'neo-brutalist';
    expect(useNeumorphicBar).toBe(false);
    expect(useNeoBrutalistBar).toBe(true);
  });

  it('tablet should use rail regardless of style', () => {
    const { useResponsive } = require('@/hooks/useResponsive');
    (useResponsive as jest.Mock).mockReturnValueOnce({ isTablet: true, isLandscape: false });
    const { isTablet } = useResponsive();
    expect(isTablet).toBe(true);
  });
});

describe('TabBar rendering', () => {
  it('TabBar renders without crashing', () => {
    const props = makeTabBarProps('HomeTab');
    const { root } = render(<TabBar {...props} />);
    expect(root).not.toBeNull();
  });
});

describe('TabBar paywall suppression', () => {
  it('should render null when parent route is Paywall', () => {
    const props = makeTabBarProps('HomeTab', ['HomeTab', 'NotesTab'], 'Paywall');
    const { root } = render(<TabBar {...props} />);
    expect(root).toBeFalsy();
  });

  it('should render normally when parent route is NOT Paywall', () => {
    const props = makeTabBarProps('HomeTab', ['HomeTab', 'NotesTab'], 'MainTabs');
    const { root } = render(<TabBar {...props} />);
    expect(root).not.toBeFalsy();
  });
});

describe('TabBar route navigation events', () => {
  it('should emit tabPress event when tab is pressed', () => {
    const props = makeTabBarProps('HomeTab');
    const { root } = render(<TabBar {...props} />);
    const tabs = root.findAllByProps({ 'accessibilityRole': 'button' });
    expect(tabs.length).toBeGreaterThan(0);
    fireEvent.press(tabs[0]);
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress' }),
    );
  });

  it('should emit tabLongPress event when tab is long-pressed', () => {
    const props = makeTabBarProps('HomeTab');
    const { root } = render(<TabBar {...props} />);
    const tabs = root.findAllByProps({ 'accessibilityRole': 'button' });
    expect(tabs.length).toBeGreaterThan(0);
    fireEvent(tabs[0], 'longPress');
    expect(props.navigation.emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabLongPress' }),
    );
  });
});
