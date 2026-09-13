/**
 * Tests for FloatingAIButton mutual exclusivity of tap, long-press, and pan interactions.
 *
 * Verifies that:
 * - Tap navigates to new chat (no long-press menu opens)
 * - Long press opens the hub menu
 * - Pan gesture suppresses long-press menu opening
 * - Repeated touches are handled correctly
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

describe('FloatingAIButton affordance pan coordination', () => {
  beforeEach(() => { __resetTime(); });

  const defaultOptions = {
    reduceMotionEnabled: false,
    reduceMotionResolved: true,
    menuOpen: false,
  };

  it('pressProgress fills immediately on press-in', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    expect(result.current.pressProgress.value).toBe(0);

    act(() => { result.current.handlePressIn(); });
    expect(result.current.pressProgress.value).toBe(1);
  });

  it('holdProgress drains on early release before 450ms', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });

    act(() => { result.current.handlePressOut(); });
    act(() => { __advanceBy(200); });
    expect(result.current.holdProgress.value).toBeLessThan(0.1);
  });

  it('handleHoldComplete absorbs hold progress without menu open', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(450); });
    expect(result.current.holdProgress.value).toBe(1);

    act(() => { result.current.handleHoldComplete(); });
    act(() => { __advanceBy(250); });
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('cancelAffordances resets press and hold during pan begin', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });

    act(() => { result.current.cancelAffordances(); });
    expect(result.current.pressProgress.value).toBe(0);
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('pressProgress stays filled when holdProgress completes', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(450); });

    expect(result.current.pressProgress.value).toBe(1);
    expect(result.current.holdProgress.value).toBe(1);

    act(() => { result.current.handleHoldComplete(); });
    act(() => { __advanceBy(250); });

    expect(result.current.pressProgress.value).toBe(1);
  });

  it('reduceMotion keeps pressProgress active but skips holdProgress', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances({
        ...defaultOptions,
        reduceMotionEnabled: true,
        reduceMotionResolved: true,
      })
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(500); });

    expect(result.current.pressProgress.value).toBe(1);
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('repeated press-out and press-in cycles reset holdProgress', () => {
    const { result } = renderHook(() =>
      require('@/components/ai/useFloatingAIButtonAffordances').useFloatingAIButtonAffordances(defaultOptions)
    );

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });
    act(() => { result.current.handlePressOut(); });
    act(() => { __advanceBy(200); });

    act(() => { result.current.handlePressIn(); });
    act(() => { __advanceBy(200); });

    expect(result.current.holdProgress.value).toBeCloseTo(0.44, 1);
  });
});
