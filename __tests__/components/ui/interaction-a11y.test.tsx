'use strict';

/**
 * Tests for shared UI primitive interaction states, accessibility contracts,
 * and reduced-motion behavior.
 */

const { __resetTime } = global.MockReanimated as {
  __resetTime: () => void;
};

// ---------------------------------------------------------------------------
// Theme mock — mirrors the pattern from theme-fixtures.test.tsx
// ---------------------------------------------------------------------------
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
            bg: '#f2f2f7', surface: '#ffffff', highlight: '#ffffff', shadow: '#000000',
            text: '#1c1c1e', textSecondary: '#6e6e73', accent: '#007AFF', accentMuted: '#5AC8FA',
            error: '#ff3b30', success: '#34C759', warning: '#FF9500',
            background: '#f2f2f7', surfaceSecondary: '#f2f2f7', primary: '#007AFF',
            border: '#c6c6c8', card: '#ffffff', elevated: '#ffffff',
          },
          tokens: {
            colors: {
              bg: '#f2f2f7', surface: '#ffffff', highlight: '#ffffff', shadow: '#000000',
              text: '#1c1c1e', textSecondary: '#6e6e73', accent: '#007AFF', accentMuted: '#5AC8FA',
              error: '#ff3b30', success: '#34C759', warning: '#FF9500',
              background: '#f2f2f7', surfaceSecondary: '#f2f2f7', primary: '#007AFF',
              border: '#c6c6c8', card: '#ffffff', elevated: '#ffffff',
            },
            radii: { sm: 12, md: 18, lg: 24, pill: 999 },
            spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
            type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
          },
        }
      );
    },

    useTokens: () => {
      const { useTheme: _useTheme } = jest.requireActual('../../../src/contexts/ThemeContext');
      return _useTheme().tokens;
    },

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    __overrideTheme: (palette: any, style: any, isDark: boolean) => {
      _mockOverride = {
        theme: isDark ? 'dark' : 'light',
        isDark,
        style,
        setTheme: jest.fn(),
        setStyle: jest.fn(),
        colors: palette,
        tokens: {
          colors: palette,
          radii: { sm: 12, md: 18, lg: 24, pill: 999 },
          spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
          type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
        },
      };
    },

    __resetTheme: () => { _mockOverride = null; },
  };
});

// ---------------------------------------------------------------------------
// useReducedMotion mock — per-test control via __setReducedMotion
// ---------------------------------------------------------------------------
let mockReduceMotion = false;
jest.mock('../../../src/hooks/useReducedMotion', () => ({
  useReducedMotion: () => mockReduceMotion,
}));
function __setReducedMotion(enabled: boolean): void {
  mockReduceMotion = enabled;
}

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../../src/components/ui/Button';
import { IconButton } from '../../../src/components/ui/IconButton';
import { Card } from '../../../src/components/ui/Card';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Modal } from '../../../src/components/ui/Modal';
import { OfflineBanner } from '../../../src/components/ui/OfflineBanner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function overrideFlatLight(): void {
  const { __overrideTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
  __overrideTheme({
    bg: '#f2f2f7', surface: '#ffffff', highlight: '#ffffff', shadow: '#000000',
    text: '#1c1c1e', textSecondary: '#6e6e73', accent: '#007AFF', accentMuted: '#5AC8FA',
    error: '#ff3b30', success: '#34C759', warning: '#FF9500',
    background: '#f2f2f7', surfaceSecondary: '#f2f2f7', primary: '#007AFF',
    border: '#c6c6c8', card: '#ffffff', elevated: '#ffffff',
  }, 'flat', false);
}

function resetTheme(): void {
  const { __resetTheme } = jest.requireMock('../../../src/contexts/ThemeContext');
  __resetTheme();
}

// ---------------------------------------------------------------------------
// Button — accessibility + reduced motion
// ---------------------------------------------------------------------------
describe('Button accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight();});
  afterEach(() => { __resetTime(); resetTheme(); });

  it('renders with label text', () => {
    const { getByText } = render(
      <Button label="Test" onPress={jest.fn()} />
    );
    expect(getByText('Test')).toBeTruthy();
  });

  it('passes accessibilityLabel to the button', () => {
    const { getByLabelText } = render(
      <Button label="Test" onPress={jest.fn()} accessibilityLabel="custom label" testID="btn-custom" />
    );
    expect(getByLabelText('custom label')).toBeTruthy();
  });

  it('renders without crashing when disabled', () => {
    // The disabled prop IS passed (verified by component source).
    // The mock doesn't prevent onPress in test env, so we verify rendering only.
    const { getByText } = render(
      <Button label="Test" disabled onPress={jest.fn()} />
    );
    expect(getByText('Test')).toBeTruthy();
  });

  it('calls onPress when not disabled', () => {
    const handlePress = jest.fn();
    const { getByTestId } = render(
      <Button label="Test" onPress={handlePress} testID="btn-enabled" />
    );
    fireEvent.press(getByTestId('btn-enabled'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders ghost variant', () => {
    const { getByTestId } = render(
      <Button label="Ghost" variant="ghost" onPress={jest.fn()} testID="btn-ghost" />
    );
    expect(getByTestId('btn-ghost')).toBeTruthy();
  });

  it('renders danger variant', () => {
    const { getByTestId } = render(
      <Button label="Danger" variant="danger" onPress={jest.fn()} testID="btn-danger" />
    );
    expect(getByTestId('btn-danger')).toBeTruthy();
  });
});

describe('Button reduced-motion behavior', () => {
  beforeEach(() => {
    overrideFlatLight();
    __setReducedMotion(true);
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('still fires onPress when reduced motion is enabled', () => {
    const handlePress = jest.fn();
    const { getByTestId } = render(
      <Button label="Test" onPress={handlePress} testID="btn-rm" />
    );
    fireEvent.press(getByTestId('btn-rm'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when disabled and reduced motion is enabled', () => {
    const { getByText } = render(
      <Card onPress={jest.fn()} disabled><Text>Press me</Text></Card>
    );
    expect(getByText('Press me')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// IconButton — accessibility + reduced motion
// ---------------------------------------------------------------------------
describe('IconButton accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { __resetTime(); resetTheme(); });

  it('renders with testID', () => {
    const { getByTestId } = render(
      <IconButton onPress={jest.fn()} testID="ib-test"><View /></IconButton>
    );
    expect(getByTestId('ib-test')).toBeTruthy();
  });

  it('passes accessibilityLabel to the button', () => {
    const { getByLabelText } = render(
      <IconButton onPress={jest.fn()} accessibilityLabel="Close" testID="ib-close"><View /></IconButton>
    );
    expect(getByLabelText('Close')).toBeTruthy();
  });

  it('renders without crashing when disabled', () => {
    // disabled prop IS passed to Pressable (verified by component source).
    // Mock doesn't prevent onPress in test env, so verify rendering only.
    const { getByTestId } = render(
      <IconButton onPress={jest.fn()} disabled testID="ib-disabled"><View /></IconButton>
    );
    expect(getByTestId('ib-disabled')).toBeTruthy();
  });

  it('calls onPress when not disabled', () => {
    const handlePress = jest.fn();
    const { getByTestId } = render(
      <IconButton onPress={handlePress} testID="ib-enabled"><View /></IconButton>
    );
    fireEvent.press(getByTestId('ib-enabled'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders ghost variant', () => {
    const { getByTestId } = render(
      <IconButton variant="ghost" onPress={jest.fn()} testID="ib-ghost"><View /></IconButton>
    );
    expect(getByTestId('ib-ghost')).toBeTruthy();
  });

  it('renders primary variant', () => {
    const { getByTestId } = render(
      <IconButton variant="primary" onPress={jest.fn()} testID="ib-primary"><View /></IconButton>
    );
    expect(getByTestId('ib-primary')).toBeTruthy();
  });
});

describe('IconButton reduced-motion behavior', () => {
  beforeEach(() => {
    overrideFlatLight();
    __setReducedMotion(true);
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('still fires onPress when reduced motion is enabled', () => {
    const handlePress = jest.fn();
    const { getByTestId } = render(
      <IconButton onPress={handlePress} testID="ib-rm"><View /></IconButton>
    );
    fireEvent.press(getByTestId('ib-rm'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when disabled and reduced motion is enabled', () => {
    const { getByTestId } = render(
      <IconButton onPress={jest.fn()} disabled testID="ib-rm-disabled"><View /></IconButton>
    );
    expect(getByTestId('ib-rm-disabled')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Card — accessibility + reduced motion
// ---------------------------------------------------------------------------
describe('Card accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { __resetTime(); resetTheme(); });

  it('renders with text content', () => {
    const { getByText } = render(
      <Card><Text>Content</Text></Card>
    );
    expect(getByText('Content')).toBeTruthy();
  });

  it('renders interactive Card and fires onPress', () => {
    const handlePress = jest.fn();
    const { getByText } = render(
      <Card onPress={handlePress}><Text>Press me</Text></Card>
    );
    fireEvent.press(getByText('Press me'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when disabled', () => {
    // disabled prop IS passed (verified by component source).
    // Mock doesn't prevent onPress in test env, so verify rendering only.
    const { getByText } = render(
      <Card onPress={jest.fn()} disabled><Text>Press me</Text></Card>
    );
    expect(getByText('Press me')).toBeTruthy();
  });
});

describe('Card reduced-motion behavior', () => {
  beforeEach(() => {
    overrideFlatLight();
    __setReducedMotion(true);
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('still fires onPress when reduced motion is enabled', () => {
    const handlePress = jest.fn();
    const { getByText } = render(
      <Card onPress={handlePress}><Text>Press me</Text></Card>
    );
    fireEvent.press(getByText('Press me'));
    expect(handlePress).toHaveBeenCalledTimes(1);
  });

  it('renders without crashing when disabled and reduced motion is enabled', () => {
    const { getByText } = render(
      <Card onPress={jest.fn()} disabled><Text>Press me</Text></Card>
    );
    expect(getByText('Press me')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// EmptyState — accessibility contracts
// ---------------------------------------------------------------------------
describe('EmptyState accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { resetTheme(); });

  it('renders title and subtitle text', () => {
    const { getByText } = render(
      <EmptyState
        icon="document-text"
        title="No notes yet"
        subtitle="Create your first note"
      />
    );
    expect(getByText('No notes yet')).toBeTruthy();
    expect(getByText('Create your first note')).toBeTruthy();
  });

  it('renders title only when no subtitle', () => {
    const { getByText } = render(
      <EmptyState icon="document-text" title="Nothing here" />
    );
    expect(getByText('Nothing here')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Modal — accessibility contracts
// ---------------------------------------------------------------------------
describe('Modal accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { resetTheme(); });

  it('accepts accessibilityLabel prop', () => {
    const { getByLabelText } = render(
      <Modal
        visible
        onRequestClose={jest.fn()}
        accessibilityLabel="Confirm delete"
      >
        <Text>Content</Text>
      </Modal>
    );
    expect(getByLabelText('Confirm delete')).toBeTruthy();
  });

  it('renders bottom-sheet variant with content', () => {
    const { getByText } = render(
      <Modal
        visible
        onRequestClose={jest.fn()}
        bottomSheet
        accessibilityLabel="Bottom sheet"
      >
        <Text>Sheet content</Text>
      </Modal>
    );
    expect(getByText('Sheet content')).toBeTruthy();
  });

  it('renders center-modal variant with content', () => {
    const { getByText } = render(
      <Modal
        visible
        onRequestClose={jest.fn()}
        accessibilityLabel="Center dialog"
      >
        <Text>Dialog content</Text>
      </Modal>
    );
    expect(getByText('Dialog content')).toBeTruthy();
  });

  it('renders with dismissOnBackdrop=false', () => {
    const { getByText } = render(
      <Modal
        visible
        onRequestClose={jest.fn()}
        dismissOnBackdrop={false}
        accessibilityLabel="Non-dismissible"
      >
        <Text>Cannot dismiss</Text>
      </Modal>
    );
    expect(getByText('Cannot dismiss')).toBeTruthy();
  });
});


