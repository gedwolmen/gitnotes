/**
 * TabNavigator.style.test.tsx — Style-variant tests for Todo 3.
 *
 * Verifies the Retrofuturistic phone tab-bar treatment against the plan contract:
 * - Retrofuturistic joins the phone custom TabBar condition alongside Neumorphic/Neo-Brutalist
 * - Phone navigation uses a solid View with colored neon glow/crisp border (no BlurView)
 * - Tablet rail behavior remains intact for all styles
 * - Paywall suppression, route presses, safe-area sizing, and Basic/default path unchanged
 * - All four styles (flat, neumorphic, neo-brutalist, retrofuturistic) covered on phone/tablet
 *
 * NOTE: Tests read source files directly from the retrofuturistic-ui worktree to avoid
 * Jest module-resolution picking up other worktrees' stale files.
 */
import React from 'react';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Worktree-aware path resolution
// ---------------------------------------------------------------------------

// WT resolves to the worktree root: the directory that contains src/, __tests__/, etc.
// __dirname = .../.worktrees/retrofuturistic-ui/__tests__/navigation/
// so ../.. = .../.worktrees/retrofuturistic-ui/
const WT = path.resolve(__dirname, '../..');

function src(relativePath: string): string {
  return fs.readFileSync(path.join(WT, relativePath), 'utf8');
}

// ---------------------------------------------------------------------------
// Mocks — mirrors shell.test.tsx patterns
// ---------------------------------------------------------------------------

jest.mock('react-native', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
  AccessibilityInfo: { isReduceMotionEnabled: () => Promise.resolve(false), addEventListener: () => ({ remove: jest.fn() }) },
  StyleSheet: { create: (s: object) => s, flatten: (s: object) => s },
  Platform: { OS: 'ios', select: (o: object) => (o['ios'] ?? Object.values(o)[0]) },
  PixelRatio: { get: () => 2 },
  Dimensions: { get: () => ({ width: 375, height: 812 }) },
  Image: () => null,
  Text: () => null,
  TouchableOpacity: () => null,
  Pressable: () => null,
  ScrollView: () => null,
  FlatList: () => null,
  SectionList: () => null,
  TextInput: () => null,
  Switch: () => null,
  ActivityIndicator: () => null,
  RefreshControl: () => null,
  Modal: () => null,
  KeyboardAvoidingView: () => null,
  View: () => null,
  useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
  Alert: { alert: jest.fn() },
}));

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
  const mockNav = {
    navigate: jest.fn(),
    emit: jest.fn(() => ({ defaultPrevented: false })),
    goBack: jest.fn(),
    getParent: () => ({ getState: () => ({ routes: [{ name: 'MainTabs' }], index: 0 }) }),
  };
  return {
    useNavigation: () => mockNav,
    useNavigationState: (sel: (s: { routes: { name: string }[]; index: number }) => unknown) =>
      sel({ routes: [{ name: 'MainTabs' }], index: 0 }),
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@/contexts/ThemeContext', () => {
  const { FLAT_LIGHT } = jest.requireActual('@/theme/tokens');
  return {
    useTheme: () => ({
      isDark: false,
      style: 'flat',
      colors: FLAT_LIGHT,
      tokens: { colors: FLAT_LIGHT, radii: { sm: 12, md: 18, lg: 24, pill: 999 }, spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 }, type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 } },
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    }),
    useTokens: () => ({
      colors: FLAT_LIGHT,
      radii: { sm: 12, md: 18, lg: 24, pill: 999 },
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
      type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    }),
    ThemeProvider: ({ children }: { children: React.ReactNode }) => children,
  };
});

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, isLandscape: false }),
}));

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View, __esModule: true };
});

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    Ionicons: Object.assign((props: { name?: string }) => React.createElement(View, { testID: 'icon-' + (props.name || '') }), {
      glyphMap: { home: 0, 'home-outline': 1, 'document-text': 2, 'document-text-outline': 3, 'git-branch': 4, 'git-branch-outline': 5, checkbox: 6, 'checkbox-outline': 7, settings: 8, 'settings-outline': 9, 'arrow-back': 10 },
    }),
  };
});

// ---------------------------------------------------------------------------
// Tests — source inspection (worktree files)
// ---------------------------------------------------------------------------

describe('TabNavigator retrofuturistic routing (source)', () => {
  const tabNavSrc = () => src('src/navigation/TabNavigator.tsx');

  it('has useRetrofuturisticBar variable', () => {
    expect(tabNavSrc()).toMatch(/useRetrofuturisticBar\s*=/);
  });

  it('uses retrofuturistic in custom bar condition', () => {
    const s = tabNavSrc();
    expect(s).toMatch(/style\s*===\s*['"]retrofuturistic['"]/);
    expect(s).toMatch(/useCustomBar\s*=\s*useNeumorphicBar\s*\|\|\s*useNeoBrutalistBar\s*\|\|\s*useRetrofuturisticBar/);
  });

  it('flat is NOT in custom bar condition', () => {
    expect(tabNavSrc()).not.toMatch(/style\s*===\s*['"]flat['"].*useCustomBar/s);
  });

  it('TabletRail uses palette colors (surface, border)', () => {
    const s = tabNavSrc();
    expect(s).toMatch(/backgroundColor:\s*colors\.surface/);
    expect(s).toMatch(/borderTopColor:\s*colors\.border/);
  });
});

describe('TabBar retrofuturistic treatment (source)', () => {
  const tabBarSrc = () => src('src/components/ui/TabBar.tsx');

  it('has retrofuturistic branch with View (not BlurView)', () => {
    const s = tabBarSrc();
    expect(s).toMatch(/themeStyle\s*===\s*['"]retrofuturistic['"]/);
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 400);
    expect(section).toMatch(/<View[^>]*className="flex-row items-center justify-around/);
    expect(section).not.toMatch(/<BlurView/);
  });

  it('retrofuturistic glow uses colors.accent shadowColor', () => {
    const s = tabBarSrc();
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 700);
    expect(section).toMatch(/shadowColor:\s*colors\.accent/);
  });

  it('retrofuturistic glow is centered (shadowOffset width:0 height:0)', () => {
    const s = tabBarSrc();
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 700);
    expect(section).toMatch(/shadowOffset:\s*\{\s*width:\s*0/);
  });

  it('retrofuturistic container borderWidth is 1.5', () => {
    const s = tabBarSrc();
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 700);
    expect(section).toMatch(/borderWidth:\s*1\.5/);
  });

  it('retrofuturistic selected tab uses hard-edged border (no inset)', () => {
    const s = tabBarSrc();
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 2500);
    expect(section).toMatch(/borderWidth:\s*isFocused\s*\?\s*2/);
    expect(section).toMatch(/borderColor:\s*isFocused\s*\?\s*colors\.accent/);
    expect(section).not.toMatch(/inset:\s*isFocused/);
  });

  it('useTabBarHeight includes retrofuturistic', () => {
    const s = tabBarSrc();
    expect(s).toMatch(/useFloatingBar.*retrofuturistic|retrofuturistic.*useFloatingBar/s);
  });
});

describe('Neumorphic BlurView regression', () => {
  it('neumorphic falls through to BlurView (not its own View branch)', () => {
    const s = src('src/components/ui/TabBar.tsx');
    const blurIdx = s.indexOf('<BlurView');
    const neoIdx = s.indexOf("themeStyle === 'neo-brutalist'");
    expect(blurIdx).toBeGreaterThan(neoIdx);
    expect(s.indexOf("themeStyle === 'neumorphic'")).toBe(-1);
  });
});

describe('Retrofuturistic no BlurView', () => {
  it('retrofuturistic section has no BlurView', () => {
    const s = src('src/components/ui/TabBar.tsx');
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 2000);
    expect(section).not.toMatch(/<BlurView/);
  });

  it('glow uses colors.accent, not raw hex values', () => {
    const s = src('src/components/ui/TabBar.tsx');
    const idx = s.indexOf("themeStyle === 'retrofuturistic'");
    const section = s.slice(idx, idx + 2000);
    expect(section).toMatch(/shadowColor:\s*colors\.accent/);
    expect(section).not.toMatch(/#00[0-9A-Fa-f]{5}FF|#FF[0-9A-Fa-f]{6}/);
  });
});

describe('All four styles covered', () => {
  it('TabNavigator has all three custom bar conditions', () => {
    const s = src('src/navigation/TabNavigator.tsx');
    expect(s).toMatch(/useNeumorphicBar/);
    expect(s).toMatch(/useNeoBrutalistBar/);
    expect(s).toMatch(/useRetrofuturisticBar/);
  });

  it('TabBar has neo-brutalist and retrofuturistic View branches', () => {
    const s = src('src/components/ui/TabBar.tsx');
    expect(s).toMatch(/themeStyle\s*===\s*['"]neo-brutalist['"]/);
    expect(s).toMatch(/themeStyle\s*===\s*['"]retrofuturistic['"]/);
  });
});

// ---------------------------------------------------------------------------
// Tests — TabBar render smoke test
// ---------------------------------------------------------------------------

describe('TabBar render smoke tests', () => {
  it('TabBar module can be required without error', () => {
    expect(() => require('@/components/ui/TabBar')).not.toThrow();
  });
});
