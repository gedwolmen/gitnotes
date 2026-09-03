import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const mockOnQuickTap = jest.fn();
const mockOnStageAll = jest.fn();
const mockOnCommitAll = jest.fn();
const mockOnPushAll = jest.fn();
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
    withTiming: (v: any, cb: any) => {
      if (typeof cb === 'function') cb({ finished: true });
      return v;
    },
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

jest.mock('@/components/git/ConflictRouteBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/GitErrorBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/UnpushedCommitsModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/git/HoldToPushRing', () => {
  const View = require('react-native').View;
  return { __esModule: true, default: ({ visible, testID }: any) => visible ? <View testID={testID} /> : null };
});

import FloatingGitButton from '@/components/git/FloatingGitButton';

function renderButton(overrides: any = {}) {
  return render(
    <FloatingGitButton
      aggregatedState={overrides.aggregatedState ?? { mode: 'clean', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: null, refresh: jest.fn() }}
      onQuickTap={mockOnQuickTap}
      onStageAll={mockOnStageAll}
      onCommitAll={mockOnCommitAll}
      onPushAll={mockOnPushAll}
    />,
  );
}

function holdFor(btn: any, ms: number) {
  fireEvent(btn, 'pressIn');
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

function releaseAfter(btn: any, totalMs: number) {
  holdFor(btn, totalMs);
  fireEvent(btn, 'pressOut');
  act(() => {
    jest.advanceTimersByTime(0);
  });
  fireEvent.press(btn);
}

describe('FloatingGitButton — 3-phase hold + color states', () => {
  beforeEach(() => {
    mockOnQuickTap.mockClear();
    mockOnStageAll.mockClear();
    mockOnCommitAll.mockClear();
    mockOnPushAll.mockClear();
  });

  it('renders same size as AI button (56pt diameter)', () => {
    const { getByTestId } = renderButton();
    const btn = getByTestId('gitbutton.surface');
    const flat = btn.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const sized = styleArr.find((s: any) => s && (s.width === 56 || s.height === 56));
    expect(sized).toBeDefined();
    expect(sized.width).toBe(56);
    expect(sized.height).toBe(56);
  });

  it('uses a recognizable git icon (not cloud-upload / sparkles)', () => {
    const { getByTestId } = renderButton();
    const root = getByTestId('gitbutton.surface');
    expect(root.findAllByProps({ name: 'sparkles' })).toHaveLength(0);
    expect(root.findAllByProps({ name: 'cloud-upload' })).toHaveLength(0);
  });

  it('renders the hold progress ring while a hold is in progress', () => {
    jest.useFakeTimers();
    const { getByTestId, queryByTestId } = renderButton();
    expect(queryByTestId('gitbutton.ring')).toBeNull();
    const btn = getByTestId('gitbutton.press');
    fireEvent(btn, 'pressIn');
    act(() => {
      jest.advanceTimersByTime(50);
    });
    expect(getByTestId('gitbutton.ring')).toBeTruthy();
    fireEvent(btn, 'pressOut');
    jest.useRealTimers();
  });

  it('short tap (< 1/3 of full hold) calls onQuickTap only', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton();
    const btn = getByTestId('gitbutton.press');
    holdFor(btn, 50);
    fireEvent(btn, 'pressOut');
    act(() => { jest.advanceTimersByTime(0); });
    fireEvent.press(btn);
    expect(mockOnQuickTap).toHaveBeenCalledTimes(1);
    expect(mockOnStageAll).not.toHaveBeenCalled();
    expect(mockOnCommitAll).not.toHaveBeenCalled();
    expect(mockOnPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('hold to 1/3 (~300ms) fires onStageAll only', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const btn = getByTestId('gitbutton.press');
    holdFor(btn, 310);
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnCommitAll).not.toHaveBeenCalled();
    expect(mockOnPushAll).not.toHaveBeenCalled();
    expect(mockOnQuickTap).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('hold to 2/3 (~600ms) fires onStageAll + onCommitAll (not onPushAll)', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const btn = getByTestId('gitbutton.press');
    holdFor(btn, 610);
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnCommitAll).toHaveBeenCalledTimes(1);
    expect(mockOnPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('hold to 3/3 (~900ms) fires all three: onStageAll + onCommitAll + onPushAll', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const btn = getByTestId('gitbutton.press');
    holdFor(btn, 910);
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnCommitAll).toHaveBeenCalledTimes(1);
    expect(mockOnPushAll).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('releasing between 1/3 and 2/3 fires onStageAll only', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const btn = getByTestId('gitbutton.press');
    releaseAfter(btn, 450);
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnCommitAll).not.toHaveBeenCalled();
    expect(mockOnPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('releasing between 2/3 and 3/3 fires onStageAll + onCommitAll only', () => {
    jest.useFakeTimers();
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 2, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const btn = getByTestId('gitbutton.press');
    releaseAfter(btn, 750);
    expect(mockOnStageAll).toHaveBeenCalledTimes(1);
    expect(mockOnCommitAll).toHaveBeenCalledTimes(1);
    expect(mockOnPushAll).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('clean mode renders the button with a muted (gray) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'clean', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: null, refresh: jest.fn() } });
    const surface = getByTestId('gitbutton.surface');
    const flat = surface.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const bg = styleArr.find((s: any) => s && s.backgroundColor);
    expect(bg?.backgroundColor).toBe('#f4f4f4');
  });

  it('conflicts mode renders the button with a red (error) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'conflicts', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 0, anyConflicts: true, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const surface = getByTestId('gitbutton.surface');
    const flat = surface.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const bg = styleArr.find((s: any) => s && s.backgroundColor);
    expect(bg?.backgroundColor).toBe('#dc2626');
  });

  it('changes mode renders the button with a green (success) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'changes', perRepo: new Map(), totalUncommitted: 3, totalStaged: 0, totalAhead: 0, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const surface = getByTestId('gitbutton.surface');
    const flat = surface.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const bg = styleArr.find((s: any) => s && s.backgroundColor);
    expect(bg?.backgroundColor).toBe('#10b981');
  });

  it('push mode renders the button with a blue (primary) background', () => {
    const { getByTestId } = renderButton({ aggregatedState: { mode: 'push', perRepo: new Map(), totalUncommitted: 0, totalStaged: 0, totalAhead: 2, anyConflicts: false, anyBusy: false, latestChangedRepoId: 'r1', refresh: jest.fn() } });
    const surface = getByTestId('gitbutton.surface');
    const flat = surface.props.style;
    const styleArr = Array.isArray(flat) ? flat : [flat];
    const bg = styleArr.find((s: any) => s && s.backgroundColor);
    expect(bg?.backgroundColor).toBe('#2563eb');
  });
});