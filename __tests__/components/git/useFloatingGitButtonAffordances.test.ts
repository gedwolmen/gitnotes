/**
 * Tests for useFloatingGitButtonAffordances — verifies the 3000ms hold-fill
 * contract, stage/commit/push threshold segmentation, and reduced-motion
 * behaviour.
 *
 * Clock control via MockReanimated.__advanceBy / __resetTime.
 */
import { act, renderHook } from '@testing-library/react-native';

declare const MockReanimated: {
  __advanceBy: (ms: number) => void;
  __resetTime: () => void;
};

const { __advanceBy, __resetTime } = MockReanimated;

describe('useFloatingGitButtonAffordances', () => {
  beforeEach(() => { __resetTime(); });

  const defaultOptions = {
    reduceMotionEnabled: false,
    reduceMotionResolved: true,
    menuOpen: false,
    onReleaseSegment: undefined as ((s: 'stage' | 'commit' | 'push') => void) | undefined,
  };

  it('pressProgress fills immediately on press-in (withSpring)', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances(defaultOptions)
    );

    expect(result.current.pressProgress.value).toBe(0);

    act(() => { result.current.handlePressIn(); });
    // withSpring resolves synchronously in the mock
    expect(result.current.pressProgress.value).toBe(1);
  });

  it('holdProgress advances proportionally over 3000ms', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });

    act(() => { __advanceBy(1000); });
    expect(result.current.holdProgress.value).toBeCloseTo(1 / 3, 2);  // ≥1000ms → stage

    act(() => { __advanceBy(1000); });
    expect(result.current.holdProgress.value).toBeCloseTo(2 / 3, 2);  // ≥2000ms → commit

    act(() => { __advanceBy(1000); });
    expect(result.current.holdProgress.value).toBe(1);               // ≥3000ms → push
  });

  it('releases early before 3000ms with no segment callback', () => {
    let emitted: string | undefined;
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        onReleaseSegment: (s) => { emitted = s; },
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(500); });  // 500ms — below stage threshold
    act(() => { result.current.handlePressOut(); });

    expect(result.current.holdProgress.value).toBeLessThan(1 / 3);
    expect(emitted).toBeUndefined();
  });

  it('releases at stage threshold (≥1000ms) → stage segment', () => {
    let emitted: string | undefined;
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        onReleaseSegment: (s) => { emitted = s; },
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(1100); });  // just over 1000ms threshold
    // Verify value BEFORE handlePressOut (which starts drain animation)
    expect(result.current.holdProgress.value).toBeCloseTo(0.367, 2);  // 1100/3000
    act(() => { result.current.handlePressOut(); });
    expect(emitted).toBe('stage');
  });

  it('releases at commit threshold (≥2000ms) → commit segment', () => {
    let emitted: string | undefined;
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        onReleaseSegment: (s) => { emitted = s; },
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(2100); });  // just over 2000ms threshold
    // Verify value BEFORE handlePressOut (which starts drain animation)
    expect(result.current.holdProgress.value).toBeCloseTo(0.7, 2);  // 2100/3000
    act(() => { result.current.handlePressOut(); });
    expect(emitted).toBe('commit');
  });

  it('releases at push threshold (≥3000ms) → push segment', () => {
    let emitted: string | undefined;
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        onReleaseSegment: (s) => { emitted = s; },
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(3000); });
    // Verify value BEFORE handlePressOut (which starts drain animation)
    expect(result.current.holdProgress.value).toBe(1);
    act(() => { result.current.handlePressOut(); });
    expect(emitted).toBe('push');
  });

  it('handleHoldComplete triggers push segment', () => {
    let emitted: string | undefined;
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        onReleaseSegment: (s) => { emitted = s; },
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(3000); });
    act(() => { result.current.handleHoldComplete(); });

    expect(emitted).toBe('push');
  });

  it('cancelAffordances resets holdProgress and pressProgress', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(1500); });
    expect(result.current.holdProgress.value).toBeCloseTo(0.5, 1);

    act(() => { result.current.cancelAffordances(); });
    expect(result.current.holdProgress.value).toBe(0);
    expect(result.current.pressProgress.value).toBe(0);
  });

  it('reduceMotion skips hold fill', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances({
        ...defaultOptions,
        reduceMotionEnabled: true,
        reduceMotionResolved: true,
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(3000); });
    // Hold should NOT have started an animation
    expect(result.current.holdProgress.value).toBe(0);
    // Press still works
    expect(result.current.pressProgress.value).toBe(1);
  });

  it('press out during stage then press in again restarts hold', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/git/useFloatingGitButtonAffordances').useFloatingGitButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(500); });
    expect(result.current.holdProgress.value).toBeCloseTo(1 / 6, 2);

    act(() => { result.current.handlePressOut(); });

    act(() => { result.current.handlePressIn(); });
    // Hold restarts from 0
    expect(result.current.holdProgress.value).toBeLessThan(0.1);
  });
});
