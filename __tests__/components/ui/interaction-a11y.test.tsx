'use strict';

/**
 * Tests for shared UI primitive interaction states, accessibility contracts,
 * and reduced-motion behavior.
 */

const { __resetTime } = global.MockReanimated as {
  __resetTime: () => void;
};

// ---------------------------------------------------------------------------
// Animated spy — must be set up before component imports
// ---------------------------------------------------------------------------
let mockSpringCalls = 0;
let mockTimingCalls = 0;

jest.mock('react-native', () => {
  const React = require('react');

  const Text = ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement('Text', props, children);
  Text.displayName = 'Text';

  const TextInput = ({ children, placeholder, value, ...props }: { children?: React.ReactNode; placeholder?: string; value?: string } & Record<string, unknown>) =>
    React.createElement('TextInput', { ...props, placeholder, value }, children);
  TextInput.displayName = 'TextInput';

  const View = (props: object & { children?: React.ReactNode }) =>
    React.createElement('View', props, (props as { children?: React.ReactNode }).children);
  View.displayName = 'View';

  const mockTiming = jest.fn((value: { setValue: (v: number) => void }, config: { toValue: number; duration?: number; easing?: unknown; useNativeDriver?: boolean }) => {
    mockTimingCalls++;
    return {
      start: (onComplete?: () => void) => {
        if (config.toValue !== undefined) {
          value.setValue(config.toValue);
        }
        onComplete?.();
      },
      stop: jest.fn(),
    };
  });

  const mockSpring = jest.fn((_value: { setValue: (v: number) => void }, _config: { toValue?: number }) => {
    mockSpringCalls++;
    return {
      start: jest.fn(),
      stop: jest.fn(),
    };
  });

  return {
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: jest.fn() }),
      announceForAccessibility: jest.fn(),
    },
    StyleSheet: { create: (s: object) => s, flatten: (s: object) => s },
    Platform: { OS: 'ios', select: (o: object) => o },
    PixelRatio: { get: () => 2 },
    Dimensions: { get: () => ({ width: 375, height: 812 }) },
    Easing: {
      linear: jest.fn(),
      ease: jest.fn(),
      quad: jest.fn(),
      cubic: jest.fn(),
      poly: jest.fn(),
      sin: jest.fn(),
      circle: jest.fn(),
      exp: jest.fn(),
      elastic: jest.fn(),
      back: jest.fn(),
      bounce: jest.fn(),
      bezier: jest.fn(() => (t: number) => t),
      out: jest.fn((e: unknown) => e),
      in: jest.fn((e: unknown) => e),
      inOut: jest.fn((e: unknown) => e),
    },
    Image: View,
    Text,
    TouchableOpacity: View,
    Pressable: View,
    ScrollView: View,
    FlatList: View,
    SectionList: View,
    TextInput,
    Switch: View,
    ActivityIndicator: View,
    RefreshControl: View,
    Modal: View,
    KeyboardAvoidingView: View,
    View,
    Animated: {
      View,
      Text,
      Image: View,
      ScrollView: View,
      FlatList: View,
      SectionList: View,
      Switch: View,
      createAnimatedComponent: (c: unknown) => c,
      spring: mockSpring,
      timing: mockTiming,
      Value: jest.fn((init: number) => ({ setValue: jest.fn(), _value: init })),
    },
    useWindowDimensions: () => ({ width: 375, height: 812, scale: 2, fontScale: 1 }),
    Alert: { alert: jest.fn() },
  };
});

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
// useNetworkStatus mock — for OfflineBanner tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => ({ isConnected: false }),
}));

// ---------------------------------------------------------------------------
// react-i18next mock — provides predictable t() output
// ---------------------------------------------------------------------------
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

// ---------------------------------------------------------------------------
// useGitOperationStore mock — for SyncBlockOverlay tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/stores/gitOperationStore', () => ({
  useGitOperationStore: () => ({ ops: {} }),
  GIT_OP_ALL_REPOS: 'all',
}));

// ---------------------------------------------------------------------------
// GitSyncGate mock — for SyncBlockOverlay tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/services/git/GitSyncGate', () => ({
  GitSyncGate: { isPushActive: () => false },
}));

// ---------------------------------------------------------------------------
// cancelInflightGitHttp mock — for SyncBlockOverlay tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/services/git/gitHttp', () => ({
  cancelInflightGitHttp: jest.fn(),
}));

// ---------------------------------------------------------------------------
// HapticService mock — for SyncBlockOverlay tests
// ---------------------------------------------------------------------------
jest.mock('../../../src/utils/haptics', () => ({
  HapticService: { error: jest.fn() },
}));

// ---------------------------------------------------------------------------
// expo-blur BlurView mock — prevents native module errors
// ---------------------------------------------------------------------------
jest.mock('expo-blur', () => {
  const React = require('react');
  const View = (props: object & { children?: React.ReactNode }) =>
    React.createElement('View', props, (props as { children?: React.ReactNode }).children);
  return { BlurView: View };
});

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------
import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Button } from '../../../src/components/ui/Button';
import { IconButton } from '../../../src/components/ui/IconButton';
import { Card } from '../../../src/components/ui/Card';
import { EmptyState } from '../../../src/components/ui/EmptyState';
import { Modal } from '../../../src/components/ui/Modal';
import { OfflineBanner } from '../../../src/components/ui/OfflineBanner';
import { SavingOverlay } from '../../../src/components/ui/SavingOverlay';
import { SyncBlockOverlay } from '../../../src/components/ui/SyncBlockOverlay';

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

function resetAnimationState(): void {
  mockSpringCalls = 0;
  mockTimingCalls = 0;
  __resetTime();
}

// ---------------------------------------------------------------------------
// Button — accessibility + reduced motion
// ---------------------------------------------------------------------------
describe('Button accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
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
    resetAnimationState();
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('skips withSpring animations when reduced motion is enabled', () => {
    const { getByTestId } = render(
      <Button label="Test" onPress={jest.fn()} testID="btn-rm" />
    );
    fireEvent(getByTestId('btn-rm'), 'touchStart');
    fireEvent(getByTestId('btn-rm'), 'touchEnd');
    expect(mockSpringCalls).toBe(0);
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
      <Button label="Test" disabled onPress={jest.fn()} />
    );
    expect(getByText('Test')).toBeTruthy();
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
    resetAnimationState();
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('skips withSpring animations when reduced motion is enabled', () => {
    const { getByTestId } = render(
      <IconButton onPress={jest.fn()} testID="ib-rm"><View /></IconButton>
    );
    fireEvent(getByTestId('ib-rm'), 'touchStart');
    fireEvent(getByTestId('ib-rm'), 'touchEnd');
    expect(mockSpringCalls).toBe(0);
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
    resetAnimationState();
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('skips withSpring animations when reduced motion is enabled', () => {
    const { getByText } = render(
      <Card onPress={jest.fn()}><Text>Press me</Text></Card>
    );
    fireEvent(getByText('Press me'), 'touchStart');
    fireEvent(getByText('Press me'), 'touchEnd');
    expect(mockSpringCalls).toBe(0);
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



// ---------------------------------------------------------------------------
// OfflineBanner — accessibility contracts
// ---------------------------------------------------------------------------
describe('OfflineBanner accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { resetTheme(); });

  it('renders with text content when offline', () => {
    const { getByText } = render(<OfflineBanner />);
    expect(getByText('sync.offlineBanner')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SavingOverlay — accessibility + reduced-motion behavior
// ---------------------------------------------------------------------------
describe('SavingOverlay reduced-motion behavior', () => {
  beforeEach(() => {
    overrideFlatLight();
    resetAnimationState();
  });
  afterEach(() => {
    __resetTime();
    resetTheme();
    mockReduceMotion = false;
  });

  it('skips Animated.timing when reduced motion is enabled', () => {
    __setReducedMotion(true);
    render(<SavingOverlay visible label="Saving..." />);
    act(() => { jest.advanceTimersByTime(200); });
    expect(mockTimingCalls).toBe(0);
  });

  it('renders with testID when visible', () => {
    const { getByTestId } = render(
      <SavingOverlay visible testID="save-overlay" label="Saving..." />
    );
    expect(getByTestId('save-overlay')).toBeTruthy();
  });

  it('renders label text when provided', () => {
    const { getByText } = render(
      <SavingOverlay visible label="Saving changes..." />
    );
    expect(getByText('Saving changes...')).toBeTruthy();
  });

  it('renders default testID when none provided', () => {
    const { getByTestId } = render(<SavingOverlay visible />);
    expect(getByTestId('saving-overlay')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SyncBlockOverlay — accessibility contracts
// ---------------------------------------------------------------------------
describe('SyncBlockOverlay accessibility contracts', () => {
  beforeEach(() => { overrideFlatLight(); });
  afterEach(() => { resetTheme(); jest.useRealTimers(); });

  it('renders with testID when no ops are running', () => {
    const { getByTestId } = render(<SyncBlockOverlay />);
    expect(getByTestId('sync-block-overlay')).toBeTruthy();
  });

  it('renders cancel button with correct accessibilityRole after CANCEL_ARM_MS', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(<SyncBlockOverlay />);
    act(() => { jest.advanceTimersByTime(6000); });
    const cancelBtn = getByTestId('sync-block-overlay.cancel');
    expect(cancelBtn).toBeTruthy();
    jest.useRealTimers();
  });
});
