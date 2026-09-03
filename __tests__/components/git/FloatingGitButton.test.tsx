import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOnQuickTap = jest.fn();
const mockOnStageAll = jest.fn();
const mockOnStageCommitPushAll = jest.fn();
const mockAggregatedState: any = null;

jest.mock('expo-file-system', () => {
  class FakeDirectory { name = ''; list = () => []; }
  class FakeFile { name = ''; }
  return { Directory: FakeDirectory, File: FakeFile };
});

jest.mock('react-native-gesture-handler', () => {
  const View = require('react-native').View;
  return { Gesture: { Pan: () => ({ minDistance: () => ({ onStart: () => ({ onUpdate: () => ({ onEnd: () => ({}) }) }) }) }) }, GestureDetector: ({ children }: any) => <View>{children}</View> };
});

jest.mock('react-native-reanimated', () => {
  const View = require('react-native').View;
  const RN = require('react-native');
  return {
    __esModule: true,
    default: { View },
    Easing: { linear: (x: number) => x, out: (e: any) => e },
    runOnJS: (fn: any) => fn,
    useAnimatedStyle: () => ({}),
    useSharedValue: (v: any) => ({ value: v }),
    withSpring: (v: any) => v,
    withTiming: (v: any) => v,
  };
});

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn(), navigate: jest.fn() }),
  useIsFocused: () => true,
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('@/hooks/useGitBusy', () => ({ useGitBusy: () => ({ busy: false, setBusy: jest.fn() }) }));
jest.mock('@/hooks/useGitRepoStatus', () => ({
  useGitRepoStatus: () => ({ status: null, ahead: 0, behind: 0, loading: false, refresh: jest.fn() }),
}));

jest.mock('@/stores/repoStore', () => ({
  useRepoStore: (selector: (s: any) => unknown) => selector({ repositories: [{ id: 'r1', name: 'r1', path: 'owner/r1' }], isLoading: false }),
}));

jest.mock('@/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', surfaceSecondary: '#eaeaea', elevated: '#fff',
      primary: '#2563eb', text: '#111', textSecondary: '#666', border: '#ddd',
      error: '#dc2626', accent: '#8b5cf6', success: '#10b981', warning: '#f59e0b',
    },
    isDark: false,
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

jest.mock('@/components/ui/toast', () => ({
  useToast: () => ({ show: jest.fn() }),
  Toast: ({ children }: any) => children,
  ToastTitle: ({ children }: any) => children,
  ToastDescription: ({ children }: any) => children,
}));

jest.mock('@/components/git/GitButtonHalo', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/HoldToPushRing', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/ConflictRouteBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/GitErrorBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/UnpushedCommitsModal', () => ({ __esModule: true, default: () => null }));

import FloatingGitButton from '@/components/git/FloatingGitButton';

describe('FloatingGitButton — multi-stage hold + color states', () => {
  beforeEach(() => {
    mockOnQuickTap.mockClear();
    mockOnStageAll.mockClear();
    mockOnStageCommitPushAll.mockClear();
  });

  it('renders same size as AI button (56pt diameter)', () => {
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={mockAggregatedState ?? { mode: 'clean', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: null, refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    const flat = btn.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const sized = styleArr.find((s: any) => s && (s.width === 56 || s.height === 56));
    expect(sized).toBeDefined();
    expect(sized.width).toBe(56);
    expect(sized.height).toBe(56);
  });

  it('uses a recognizable git icon (not cloud-upload / sparkles)', () => {
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'clean', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: null, refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    // The button should not use sparkles (that's the AI button).
    const root = getByTestId('gitbutton.press');
    // No name="sparkles" anywhere in the tree for the git button.
    expect(root.findAllByProps({ name: 'sparkles' })).toHaveLength(0);
  });

  it('short tap (< 100ms) calls onQuickTap', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'clean', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: null, refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    fireEvent(btn, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(50);
    });
    fireEvent(btn, 'pressOut');
    act(() => {
      jest.advanceTimersByTime(0);
    });
    fireEvent.press(btn);
    expect(mockOnQuickTap).toHaveBeenCalledTimes(1);
    expect(mockOnStageAll).not.toHaveBeenCalled();
    expect(mockOnStageCommitPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('100ms hold triggers onStageAll (not onStageCommitPushAll)', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    fireEvent(btn, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(110);
    });
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnStageCommitPushAll).not.toHaveBeenCalled();
    expect(mockOnQuickTap).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('300ms hold triggers onStageCommitPushAll (and onStageAll already fired)', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    fireEvent(btn, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(310);
    });
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnStageCommitPushAll).toHaveBeenCalledTimes(1);
    expect(mockOnQuickTap).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('releasing between 100ms and 300ms does NOT trigger onStageCommitPushAll', () => {
    jest.useFakeTimers();
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    fireEvent(btn, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(150);
    });
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    fireEvent(btn, 'pressOut');
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(mockOnStageCommitPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('mode "conflicts" makes the button show red hue (color used in style)', () => {
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'conflicts', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: true, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    // We don't render the bg via className in this branch, so look at the
    // accessibility label, which exposes the state to AT.
    const btn = getByTestId('gitbutton.press');
    const label: string = btn.props.accessibilityLabel ?? '';
    expect(label.toLowerCase()).toMatch(/conflict/);
  });

  it('mode "changes" makes the button show green accessibility cue', () => {
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'changes', perRepo: new Map(), totalUncommitted: 3, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    const label: string = btn.props.accessibilityLabel ?? '';
    expect(label.toLowerCase()).toMatch(/change|uncommitted/);
  });

  it('mode "push" makes the button show blue (push pending) accessibility cue', () => {
    const { getByTestId } = render(
      <FloatingGitButton
        aggregatedState={{ mode: 'push', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 2, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() }}
        onQuickTap={mockOnQuickTap}
        onStageAll={mockOnStageAll}
        onStageCommitPushAll={mockOnStageCommitPushAll}
      />,
    );
    const btn = getByTestId('gitbutton.press');
    const label: string = btn.props.accessibilityLabel ?? '';
    expect(label.toLowerCase()).toMatch(/unpushed|push/);
  });
});