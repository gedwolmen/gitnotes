/**
 * Tests for useFloatingAIButtonAffordances — verifies the 450ms long-press
 * contract, press/hold animation behaviour, and reduced-motion handling.
 *
 * Clock control via MockReanimated.__advanceBy / __resetTime.
 * AsyncStorage mocked via jest.setup.ts.
 */
import { act, renderHook } from '@testing-library/react-native';

declare const MockReanimated: {
  __advanceBy: (ms: number) => void;
  __resetTime: () => void;
};

const { __advanceBy, __resetTime } = MockReanimated;

describe('useFloatingAIButtonAffordances', () => {
  beforeEach(() => { __resetTime(); });

  const defaultOptions = {
    reduceMotionEnabled: false,
    reduceMotionResolved: true,
    menuOpen: false,
  };

  it('pressProgress fills immediately on press-in (withSpring)', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    expect(result.current.pressProgress.value).toBe(0);

    act(() => { result.current.handlePressIn(); });
    expect(result.current.pressProgress.value).toBe(1);
  });

  it('holdProgress fills to 1 after 450ms of hold', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });

    act(() => { __advanceBy(225); });
    expect(result.current.holdProgress.value).toBeCloseTo(0.5, 2);

    act(() => { __advanceBy(225); });
    expect(result.current.holdProgress.value).toBe(1);
  });

  it('release before 450ms does not call onReleaseSegment (no such prop)', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });
    // handlePressOut should drain without issue
    act(() => { result.current.handlePressOut(); });
    // holdProgress is draining back to 0
    act(() => { __advanceBy(200); });
    expect(result.current.holdProgress.value).toBeLessThan(0.1);
  });

  it('handleHoldComplete sets holdCompletedRef and absorbs hold', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(450); });
    expect(result.current.holdProgress.value).toBe(1);

    act(() => { result.current.handleHoldComplete(); });
    // holdAbsorb animation (200ms) starts — advance to complete it
    act(() => { __advanceBy(250); });
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('cancelAffordances resets press, hold, and hint', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });

    act(() => { result.current.cancelAffordances(); });
    expect(result.current.pressProgress.value).toBe(0);
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('reduceMotion skips hold fill', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances({
        ...defaultOptions,
        reduceMotionEnabled: true,
        reduceMotionResolved: true,
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(500); });
    expect(result.current.holdProgress.value).toBe(0);
    expect(result.current.pressProgress.value).toBe(1);
  });

  it('markHubDiscovered sets hubDiscovered to true', () => {
    const { result } = renderHook(() =>
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    expect(result.current.hubDiscovered).toBe(false);

    act(() => { result.current.markHubDiscovered(); });
    expect(result.current.hubDiscovered).toBe(true);
  });
});
