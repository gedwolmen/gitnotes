import { render, screen } from '@testing-library/react-native';
import { View, ActivityIndicator } from 'react-native';

import { AppLoadingView } from '../../src/components/ui/AppLoadingView';

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  // Default to a non-zero top so the test fails if safe-area handling is removed
  let mockInsets = { top: 50, bottom: 0, left: 0, right: 0 };

  const MockSafeAreaContext = React.createContext({ insets: mockInsets });

  return {
    SafeAreaProvider: MockSafeAreaContext.Provider,
    SafeAreaView: ({ children, style }: React.PropsWithChildren<{ style?: unknown[] }>) =>
      React.createElement('View', { style }, children),
    useSafeAreaInsets: () => mockInsets,
    SafeAreaConsumer: MockSafeAreaContext.Consumer,
    SafeAreaContext: MockSafeAreaContext,
    // Allow tests to override the insets
    __setMockInsets: (insets: typeof mockInsets) => {
      mockInsets = insets;
    },
  };
});

jest.mock('react-native', () => {
  const React = require('react');
  const RNView = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
    React.createElement('View', props, children);
  RNView.displayName = 'View';

  const RNActivityIndicator = ({ size, color, ...props }: { size?: string; color?: string; [k: string]: unknown }) =>
    React.createElement('ActivityIndicator', { size, color, ...props });
  RNActivityIndicator.displayName = 'ActivityIndicator';

  return {
    __esModule: true,
    View: RNView,
    ActivityIndicator: RNActivityIndicator,
    StyleSheet: { create: (s: Record<string, unknown>) => s },
    useColorScheme: () => 'light',
  };
});

describe('AppLoadingView', () => {
  it('renders ActivityIndicator', () => {
    render(<AppLoadingView />);
    const indicators = screen.UNSAFE_getAllByType(ActivityIndicator);
    expect(indicators.length).toBeGreaterThan(0);
  });

  it('container has accessibilityLabel="Loading GitNotes"', () => {
    render(<AppLoadingView />);
    const views = screen.UNSAFE_getAllByType(View);
    const withLabel = views.filter(
      (v) => v.props?.accessibilityLabel === 'Loading GitNotes',
    );
    expect(withLabel.length).toBeGreaterThan(0);
  });

  it('container has accessibilityRole="progressbar"', () => {
    render(<AppLoadingView />);
    const views = screen.UNSAFE_getAllByType(View);
    const withRole = views.filter(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    expect(withRole.length).toBeGreaterThan(0);
  });

  it('dark theme: background is #0E0E0E', () => {
    render(<AppLoadingView colorScheme="dark" />);
    const views = screen.UNSAFE_getAllByType(View);
    const container = views.find(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    const bg = container?.props?.style?.find((s) => s?.backgroundColor);
    expect(bg?.backgroundColor).toBe('#0E0E0E');
  });

  it('light theme: background is #ffffff', () => {
    render(<AppLoadingView colorScheme="light" />);
    const views = screen.UNSAFE_getAllByType(View);
    const container = views.find(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    const bg = container?.props?.style?.find((s) => s?.backgroundColor);
    expect(bg?.backgroundColor).toBe('#ffffff');
  });

  it('dark theme: ActivityIndicator color is #ffffff', () => {
    render(<AppLoadingView colorScheme="dark" />);
    const indicators = screen.UNSAFE_getAllByType(ActivityIndicator);
    expect(indicators[0]?.props?.color).toBe('#ffffff');
  });

  it('light theme: ActivityIndicator color is #007AFF', () => {
    render(<AppLoadingView colorScheme="light" />);
    const indicators = screen.UNSAFE_getAllByType(ActivityIndicator);
    expect(indicators[0]?.props?.color).toBe('#007AFF');
  });

  it('centers the spinner while respecting the top safe-area inset', () => {
    render(<AppLoadingView />);
    const views = screen.UNSAFE_getAllByType(View);
    const container = views.find(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    const layoutStyle = container?.props?.style?.find(
      (s) => s?.justifyContent !== undefined || s?.alignItems !== undefined,
    );
    expect(layoutStyle?.justifyContent).toBe('center');
    expect(layoutStyle?.alignItems).toBe('center');
  });

  it('applies top safe-area inset as paddingTop when insets.top > 0 — regression for spinner under notch', () => {
    // Override mock insets to a known non-zero top value
    const safeAreaContext = require('react-native-safe-area-context');
    safeAreaContext.__setMockInsets({ top: 50, bottom: 0, left: 0, right: 0 });

    render(<AppLoadingView />);
    const views = screen.UNSAFE_getAllByType(View);
    const container = views.find(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    // paddingTop is in the style array after backgroundColor
    const paddingTopStyle = container?.props?.style?.find((s) => s?.paddingTop !== undefined);
    expect(paddingTopStyle?.paddingTop).toBe(50);
  });

  it('zero top inset produces zero paddingTop', () => {
    const safeAreaContext = require('react-native-safe-area-context');
    safeAreaContext.__setMockInsets({ top: 0, bottom: 0, left: 0, right: 0 });

    render(<AppLoadingView colorScheme="light" />);
    const views = screen.UNSAFE_getAllByType(View);
    const container = views.find(
      (v) => v.props?.accessibilityRole === 'progressbar',
    );
    const paddingTopStyle = container?.props?.style?.find((s) => s?.paddingTop !== undefined);
    expect(paddingTopStyle?.paddingTop).toBe(0);
  });
});
