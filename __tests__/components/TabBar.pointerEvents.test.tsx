import React from 'react';
import { render } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  surfaceSecondary: '#f0f0f0',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 16, left: 0, right: 0 }),
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, isDark: false, style: 'neumorphic' }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'neumorphic',
  }),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false }),
}));

jest.mock('../../src/components/ui/Surface', () => {
  const { View } = require('react-native');
  return { Surface: ({ children, style }: any) => <View style={style}>{children}</View> };
});

import { TabBar } from '../../src/components/ui/TabBar';

const fakeNavigationProps = {
  state: {
    index: 1,
    routes: [
      { key: 'home', name: 'HomeTab' },
      { key: 'notes', name: 'NotesTab' },
      { key: 'explore', name: 'ExploreTab' },
      { key: 'todos', name: 'TodosTab' },
      { key: 'settings', name: 'SettingsTab' },
    ],
    routeNames: ['HomeTab', 'NotesTab', 'ExploreTab', 'TodosTab', 'SettingsTab'],
  } as any,
  navigation: {
    emit: jest.fn(() => ({ defaultPrevented: false })),
    navigate: jest.fn(),
  } as any,
  descriptors: {} as any,
  insets: { top: 0, bottom: 16, left: 0, right: 0 } as any,
};

describe('TabBar pointer-event hit-zone (issue #667)', () => {
  test('outer overlay View has pointerEvents="box-none"', () => {
    const { UNSAFE_root } = render(<TabBar {...fakeNavigationProps} />);
    const outerView = UNSAFE_root.findAll(
      (node) => node.type === 'View' && node.props.pointerEvents === 'box-none',
    );
    expect(outerView.length).toBeGreaterThanOrEqual(1);
  });

  test('BlurView wrapper has pointerEvents="box-none" so taps fall through transparent pill areas', () => {
    const { UNSAFE_root } = render(<TabBar {...fakeNavigationProps} />);
    const allBoxNone = UNSAFE_root.findAll(
      (node: any) => node.props && node.props.pointerEvents === 'box-none',
    );
    // Without the fix the count is 2 (outer overlay + RNTL container).
    // After the fix the BlurView wrapper also carries box-none → count is 3+.
    expect(allBoxNone.length).toBeGreaterThanOrEqual(3);
  });
});
