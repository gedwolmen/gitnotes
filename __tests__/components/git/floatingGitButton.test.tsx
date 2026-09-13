/**
 * Integration test for FloatingGitButton — end-to-end with Reanimated clock
 * control and GestureHandler mock.
 */
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import React from 'react';

declare const MockReanimated: {
  __advanceBy: (ms: number) => void;
  __resetTime: () => void;
};

const { __advanceBy, __resetTime } = MockReanimated;

jest.mock('@/components/git/useFloatingGitButtonPanGesture', () => ({
  useFloatingGitButtonPanGesture: () => ({
    panGesture: {},
    dragActive: { value: false },
    translateX: { value: 0 },
    translateY: { value: 0 },
  }),
}));

jest.mock('@/components/git/useFloatingGitButtonPosition', () => ({
  useFloatingGitButtonPosition: () => ({
    translateX: { value: 0 },
    translateY: { value: 0 },
    dragActive: { value: false },
    geometry: { x: 0, y: 0, width: 56, height: 56 },
  }),
}));

jest.mock('@/components/floatingButtonLayout', () => ({
  useFloatingButtonCollision: () => undefined,
}));

jest.mock('@/components/git/GitButtonRing', () => {
  const View = require('react-native').View;
  return {
    GitButtonRing: function MockGitButtonRing() {
      return <View testID="gitbutton.ring" />;
    },
  };
});

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: { surface: '#fff', textSecondary: '#999', error: '#f00', success: '#0f0', primary: '#00f', background: '#fff', foreground: '#000' } }),
  useTokens: () => ({ colors: { surface: '#fff', textSecondary: '#999', error: '#f00', success: '#0f0', primary: '#00f', background: '#fff', foreground: '#000' }, radii: {} }),
}));

describe('FloatingGitButton — integration', () => {
  beforeEach(() => { __resetTime(); });

  function renderButton(overrides: {
    aggregatedState?: object;
    onQuickTap?: () => void;
    onReleaseSegment?: (s: 'stage' | 'commit' | 'push') => void;
    disabled?: boolean;
  } = {}) {
    const { default: FloatingGitButton } = require('@/components/git/FloatingGitButton');
    return render(<FloatingGitButton {...overrides} />);
  }

  it('renders in disabled state when no pending work', () => {
    const { getByTestId } = renderButton({ aggregatedState: undefined });
    expect(getByTestId('gitbutton.root')).toBeTruthy();
    expect(getByTestId('gitbutton.surface')).toBeTruthy();
  });

  it('shows badge when uncommitted changes exist', () => {
    const { getByTestId } = renderButton({
      aggregatedState: {
        perRepo: new Map(),
        totalUncommitted: 3,
        totalStaged: 0,
        totalAhead: 0,
        anyConflicts: false,
        anyBusy: false,
        latestChangedRepoId: null,
        mode: 'clean',
        refresh: async () => undefined,
      },
    });
    expect(getByTestId('gitbutton.badge')).toBeTruthy();
  });

  it('onQuickTap fires on short tap (< 1/3 hold threshold)', async () => {
    const onQuickTap = jest.fn();
    const { getByTestId } = renderButton({ onQuickTap });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    // Advance just 200ms — well below 1/3 threshold (1000ms)
    act(() => { __advanceBy(200); });
    fireEvent(pressable, 'pressOut');

    await waitFor(() => { expect(onQuickTap).toHaveBeenCalledTimes(1); });
  });

  it('onQuickTap does NOT fire when hold reached 1/3 threshold', async () => {
    const onQuickTap = jest.fn();
    const { getByTestId } = renderButton({ onQuickTap });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    // Advance to just over 1/3 threshold
    act(() => { __advanceBy(1100); });
    fireEvent(pressable, 'pressOut');

    await waitFor(() => { expect(onQuickTap).not.toHaveBeenCalled(); });
  });

  it('onReleaseSegment fires stage on release after ≥1000ms', async () => {
    const onReleaseSegment = jest.fn();
    const { getByTestId } = renderButton({ onReleaseSegment });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    act(() => { __advanceBy(1500); });
    fireEvent(pressable, 'pressOut');

    await waitFor(() => {
      expect(onReleaseSegment).toHaveBeenCalledWith('stage');
    });
  });

  it('onReleaseSegment fires commit on release after ≥2000ms', async () => {
    const onReleaseSegment = jest.fn();
    const { getByTestId } = renderButton({ onReleaseSegment });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    act(() => { __advanceBy(2500); });
    fireEvent(pressable, 'pressOut');

    await waitFor(() => {
      expect(onReleaseSegment).toHaveBeenCalledWith('commit');
    });
  });

  it('onReleaseSegment fires push when hold completes (≥3000ms)', async () => {
    const onReleaseSegment = jest.fn();
    const { getByTestId } = renderButton({ onReleaseSegment });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    act(() => { __advanceBy(3000); });
    fireEvent(pressable, 'pressOut');

    await waitFor(() => {
      expect(onReleaseSegment).toHaveBeenCalledWith('push');
    });
  });

  it('disabled button does not respond to interactions', async () => {
    const onQuickTap = jest.fn();
    const onReleaseSegment = jest.fn();
    const { getByTestId } = renderButton({ onQuickTap, onReleaseSegment, disabled: true });

    const pressable = getByTestId('gitbutton.press');
    fireEvent(pressable, 'pressIn');
    act(() => { __advanceBy(500); });
    fireEvent(pressable, 'pressOut');

    expect(onQuickTap).not.toHaveBeenCalled();
    expect(onReleaseSegment).not.toHaveBeenCalled();
  });
});
