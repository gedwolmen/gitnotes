import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeTile } from '../../../src/components/home/HomeTile';

jest.mock('../../../src/contexts/ThemeContext', () => {
  const React = require('react');
  const { createContext, useContext } = React;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let _mockOverride: any = null;

  const DefaultContext = createContext<Record<string, unknown>>(null as unknown as Record<string, unknown>);

  return {
    ThemeProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(DefaultContext.Provider, { value: _mockOverride }, children),

    useTheme: () => {
      const ctx = useContext(DefaultContext);
      return (
        ctx ?? {
          theme: 'light',
          isDark: false,
          style: 'flat',
          setTheme: jest.fn(),
          setStyle: jest.fn(),
          colors: {
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
          },
          tokens: {
            colors: {
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
            },
            radii: { sm: 12, md: 18, lg: 24, pill: 999 },
            spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
            type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
          },
        }
      );
    },

    useTokens: () => ({
      colors: {
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
      },
      radii: { sm: 12, md: 18, lg: 24, pill: 999 },
      spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
      type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    }),

    __resetTheme: () => { _mockOverride = null; },
    __overrideTheme: (v: Record<string, unknown>) => { _mockOverride = v; },
  };
});

const renderWithTheme = (ui: React.ReactElement) => {
  return render(ui);
};

describe('HomeTile', () => {
  const defaultProps = {
    variant: 'primary' as const,
    icon: 'document-text' as const,
    title: 'Test Title',
    subtitle: 'Test subtitle',
    onPress: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders title and subtitle', () => {
    const { getByText } = renderWithTheme(<HomeTile {...defaultProps} />);
    expect(getByText('Test Title')).toBeTruthy();
    expect(getByText('Test subtitle')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} onPress={onPress} testID="test-tile" />,
    );
    fireEvent.press(getByTestId('test-tile'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress when long-pressed', () => {
    const onLongPress = jest.fn();
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} onLongPress={onLongPress} testID="test-tile" />,
    );
    fireEvent(getByTestId('test-tile'), 'longPress');
    expect(onLongPress).toHaveBeenCalledTimes(1);
  });

  it('renders secondary variant with surface background', () => {
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} variant="secondary" testID="secondary-tile" />,
    );
    expect(getByTestId('secondary-tile')).toBeTruthy();
  });

  it('renders accent variant', () => {
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} variant="accent" testID="accent-tile" />,
    );
    expect(getByTestId('accent-tile')).toBeTruthy();
  });

  it('renders with titleNode override', () => {
    const { getByText } = renderWithTheme(
      <HomeTile
        {...defaultProps}
        titleNode={null}
        title="Fallback Title"
      />,
    );
    expect(getByText('Fallback Title')).toBeTruthy();
  });

  it('renders with subtitleNode override', () => {
    const { getByText } = renderWithTheme(
      <HomeTile
        {...defaultProps}
        subtitleNode={null}
        subtitle="Fallback Subtitle"
      />,
    );
    expect(getByText('Fallback Subtitle')).toBeTruthy();
  });

  it('shows tablet decoration when showTabletDecoration is true', () => {
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} showTabletDecoration={true} testID="deco-tile" />,
    );
    expect(getByTestId('deco-tile')).toBeTruthy();
  });

  it('accepts height override', () => {
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} height={200} testID="height-tile" />,
    );
    expect(getByTestId('height-tile')).toBeTruthy();
  });

  it('accepts contentPosition space-between', () => {
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} contentPosition="space-between" testID="space-between-tile" />,
    );
    expect(getByTestId('space-between-tile')).toBeTruthy();
  });

  it('renders with disabled prop set', () => {
    const onPress = jest.fn();
    const { getByTestId } = renderWithTheme(
      <HomeTile {...defaultProps} disabled={true} onPress={onPress} testID="disabled-tile" />,
    );
    expect(getByTestId('disabled-tile')).toBeTruthy();
  });
});
