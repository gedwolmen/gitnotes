import { render, screen } from '@testing-library/react-native';
import { View, ActivityIndicator } from 'react-native';

import { AppLoadingView } from '../../src/components/ui/AppLoadingView';

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

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
});
