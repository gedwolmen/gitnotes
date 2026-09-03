import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

const mockOnQuickTap = jest.fn();

jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return { GestureDetector: ({ children }: any) => <View>{children}</View> };
});

jest.mock('@expo/vector-icons', () => {
  const View = require('react-native').View;
  return {
    Ionicons: ({ name, testID }: any) => <View testID={testID} name={name} />,
  };
});

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: { View },
    Easing: { linear: (x: number) => x, out: (e: any) => e },
    runOnJS: (fn: any) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (v: any) => ({ value: v }),
    withSpring: (v: any) => v,
    withTiming: (v: any, cb: any) => {
      if (typeof cb === 'function') cb({ finished: true });
      return v;
    },
  };
});

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (s: any) => unknown) =>
    selector({ repositories: [{ id: 'r1', name: 'r1', path: 'owner/r1' }], isLoading: false }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', surfaceSecondary: '#eaeaea', elevated: '#fff',
      primary: '#2563eb', text: '#111', textSecondary: '#666', border: '#ddd',
      error: '#dc2626', accent: '#8b5cf6', success: '#10b981', warning: '#f59e0b',
    },
    isDark: false,
    style: 'flat',
  }),
  useTokens: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', surfaceSecondary: '#eaeaea', elevated: '#fff',
      primary: '#2563eb', text: '#111', textSecondary: '#666', border: '#ddd',
      error: '#dc2626', accent: '#8b5cf6', success: '#10b981', warning: '#f59e0b',
    },
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24 },
    radii: { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 },
  }),
}));

jest.mock('@/components/floatingButtonLayout', () => ({
  useFloatingButtonCollision: jest.fn(),
  publishButtonRect: jest.fn(),
  resolveNonOverlapping: jest.fn(),
  resolveNonOverlappingWithRect: jest.fn(),
  subscribeButtonRects: () => () => undefined,
  getButtonRect: () => null,
}));

jest.mock('@/components/git/useFloatingGitButtonPosition', () => ({
  useFloatingGitButtonPosition: () => ({
    geometry: { viewportWidth: 400, viewportHeight: 800, leftClearance: 0, rightClearance: 0, topBound: 0, tabBarHeight: 84, minimumBottomClearance: 100 },
    translateX: { value: 0 },
    translateY: { value: 0 },
    savedTranslateX: { value: 0 },
    savedTranslateY: { value: 0 },
    latestGeometry: { value: { viewportWidth: 400, viewportHeight: 800, leftClearance: 0, rightClearance: 0, topBound: 0, tabBarHeight: 84, minimumBottomClearance: 100 } },
    dragActive: { value: false },
    markPositionInteractionStarted: jest.fn(),
    savePosition: jest.fn(),
  }),
}));

jest.mock('@/components/git/useFloatingGitButtonPanGesture', () => ({
  useFloatingGitButtonPanGesture: () => ({}),
}));

jest.mock('@/components/git/useFloatingGitButtonAffordances', () => ({
  useFloatingGitButtonAffordances: () => ({
    entranceProgress: { value: 1 },
    pressProgress: { value: 0 },
    holdProgress: { value: 0 },
    handlePressIn: jest.fn(),
    handlePressOut: jest.fn(),
    handleHoldComplete: jest.fn(),
    cancelAffordances: jest.fn(),
  }),
  PRESS_SCALE_FACTOR: 0.08,
}));

jest.mock('@/components/git/GitButtonHalo', () => {
  const View = require('react-native').View;
  return {
    __esModule: true,
    default: ({ active, color, testID }: any) =>
      active ? <View testID={testID} color={color} /> : null,
  };
});

import FloatingGitButton from '@/components/git/FloatingGitButton';

function aggregated(overrides: Partial<{ totalUncommitted: number; totalStaged: number; totalAhead: number; anyConflicts: boolean; mode: string }> = {}) {
  return {
    mode: overrides.mode ?? 'clean',
    perRepo: new Map(),
    totalUncommitted: overrides.totalUncommitted ?? 0,
    totalStaged: overrides.totalStaged ?? 0,
    totalAhead: overrides.totalAhead ?? 0,
    anyConflicts: overrides.anyConflicts ?? false,
    anyBusy: false,
    latestChangedRepoId: 'r1',
    refresh: jest.fn(),
  };
}

function renderButton(overrides: any = {}) {
  return render(
    <FloatingGitButton
      aggregatedState={overrides.aggregatedState ?? aggregated({})}
      onQuickTap={overrides.onQuickTap ?? mockOnQuickTap}
      disabled={overrides.disabled ?? false}
      currentRouteName={overrides.currentRouteName}
    />,
  );
}

function surfaceBackground(getByTestId: any): string | undefined {
  const surface = getByTestId('gitbutton.surface');
  const flat = surface.props.style;
  const styleArr = Array.isArray(flat) ? flat : [flat];
  return styleArr.find((s: any) => s && s.backgroundColor)?.backgroundColor;
}

describe('FloatingGitButton — informational button (issue #1330)', () => {
  beforeEach(() => {
    mockOnQuickTap.mockClear();
  });

  it('renders the surface with the 56pt size', () => {
    const { getByTestId } = renderButton();
    const surface = getByTestId('gitbutton.surface');
    const flat = surface.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const sized = styleArr.find((s: any) => s && (s.width === 56 || s.height === 56));
    expect(sized).toBeDefined();
    expect(sized.width).toBe(56);
    expect(sized.height).toBe(56);
  });

  it('renders the git-pull-request-outline icon by default', () => {
    const { getByTestId } = renderButton();
    const icon = getByTestId('gitbutton.icon');
    expect(icon.props.name).toBe('git-pull-request-outline');
  });

  it('uses the warning-outline icon in conflicts mode', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'conflicts', anyConflicts: true }) });
    const icon = getByTestId('gitbutton.icon');
    expect(icon.props.name).toBe('warning-outline');
  });

  it('fires onQuickTap on tap when enabled', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'changes', totalUncommitted: 2 }) });
    fireEvent.press(getByTestId('gitbutton.press'));
    expect(mockOnQuickTap).toHaveBeenCalledTimes(1);
  });

  it('does not fire onQuickTap when disabled', () => {
    const { getByTestId } = renderButton({ disabled: true });
    fireEvent.press(getByTestId('gitbutton.press'));
    expect(mockOnQuickTap).not.toHaveBeenCalled();
  });

  it('marks the pressable disabled when nothing is pending', () => {
    const { getByTestId } = renderButton({ disabled: true });
    expect(getByTestId('gitbutton.press').props.accessibilityState.disabled).toBe(true);
  });

  it('disabled state renders a grayed-out surface with reduced opacity', () => {
    const { getByTestId } = renderButton({ disabled: true });
    expect(surfaceBackground(getByTestId)).toBe('#f4f4f4');
    const frame = getByTestId('gitbutton.frame');
    const flat = frame.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    expect(styleArr.find((s: any) => s && s.opacity)?.opacity).toBe(0.5);
  });

  it('enabled state renders the frame at full opacity', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'changes', totalUncommitted: 1 }) });
    const frame = getByTestId('gitbutton.frame');
    const flat = frame.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    expect(styleArr.some((s: any) => s && s.opacity !== undefined)).toBe(false);
  });

  it('conflicts mode renders the button with a red (error) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'conflicts', anyConflicts: true }) });
    expect(surfaceBackground(getByTestId)).toBe('#dc2626');
  });

  it('changes mode renders the button with a green (success) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'changes', totalUncommitted: 3 }) });
    expect(surfaceBackground(getByTestId)).toBe('#10b981');
  });

  it('push mode renders the button with a blue (primary) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: aggregated({ mode: 'push', totalAhead: 2 }) });
    expect(surfaceBackground(getByTestId)).toBe('#2563eb');
  });

  it('hides the button on full-screen modal routes', () => {
    const { toJSON } = renderButton({ currentRouteName: 'NoteEditor' });
    expect(toJSON()).toBeNull();
  });

  it('hides the button when no repos are added', () => {
    const repoStoreMock = require('@/stores/repoStore') as { useRepoStore: any };
    const originalMock = repoStoreMock.useRepoStore;
    repoStoreMock.useRepoStore = (selector: any) => selector({ repositories: [], isLoading: false });
    try {
      const { toJSON } = renderButton();
      expect(toJSON()).toBeNull();
    } finally {
      repoStoreMock.useRepoStore = originalMock;
    }
  });
});

describe('FloatingGitButton — status hue ring', () => {
  beforeEach(() => {
    mockOnQuickTap.mockClear();
  });

  it('clean state renders no hue ring', () => {
    const { queryByTestId } = renderButton({ aggregatedState: aggregated({}) });
    expect(queryByTestId('gitbutton.halo')).toBeNull();
  });

  it('disabled state renders no hue ring even with a stale aggregate', () => {
    const { queryByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'changes', totalUncommitted: 1 }),
      disabled: true,
    });
    expect(queryByTestId('gitbutton.halo')).toBeNull();
  });

  it('uncommitted changes render a green ring', () => {
    const { getByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'changes', totalUncommitted: 3 }),
    });
    expect(getByTestId('gitbutton.halo').props.color).toBe('#10b981');
  });

  it('staged-only changes render a green ring', () => {
    const { getByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'changes', totalStaged: 2 }),
    });
    expect(getByTestId('gitbutton.halo').props.color).toBe('#10b981');
  });

  it('ahead commits render a blue ring', () => {
    const { getByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'push', totalAhead: 2 }),
    });
    expect(getByTestId('gitbutton.halo').props.color).toBe('#2563eb');
  });

  it('blue outranks green when ahead and uncommitted both apply', () => {
    const { getByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'push', totalUncommitted: 3, totalAhead: 2 }),
    });
    expect(getByTestId('gitbutton.halo').props.color).toBe('#2563eb');
  });

  it('red outranks blue and green when conflicts apply', () => {
    const { getByTestId } = renderButton({
      aggregatedState: aggregated({ mode: 'conflicts', totalUncommitted: 3, totalAhead: 2, anyConflicts: true }),
    });
    expect(getByTestId('gitbutton.halo').props.color).toBe('#dc2626');
  });
});
