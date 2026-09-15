/**
 * Regression test: FloatingAIButton pan/hold arbitration.
 *
 * RNGH semantics:
 *   - onBegin  = handler started receiving touches; not yet active (movement < minDistance)
 *   - onStart  = gesture recognized; movement has passed minDistance threshold
 *
 * Correct behavior:
 *   - A stationary long-press (no drag) must NOT suppress the hold → hub opens.
 *   - A drag gesture (movement ≥ minDistance) must cancel the hold → hub stays closed.
 *
 * This test verifies the hook enforces that contract:
 *   onBegin  → cancelAffordances NOT called, setPanBeganDuringPress NOT called
 *   onStart  → cancelAffordances called, setPanBeganDuringPress(true) called
 *
 * The bug: these calls were placed in onBegin, so even a stationary press cancelled
 * the hold before any drag movement occurred.
 */
import { renderHook } from '@testing-library/react-native';

declare const MockReanimated: {
  __advanceBy: (ms: number) => void;
  __resetTime: () => void;
};

const { __resetTime } = MockReanimated;

// Spy/action tracking
let cancelAffordancesCalls: number = 0;
let setPanBeganDuringPressCalls: Array<boolean> = [];

// Mock action object matching FloatingAIButtonPanActions interface
const mockActions = {
  closeMenu: jest.fn(),
  setHorizontalDirection: jest.fn(),
  setVerticalDirection: jest.fn(),
  cancelAffordances: jest.fn(() => { cancelAffordancesCalls++; }),
  setPanBeganDuringPress: jest.fn((began: boolean) => { setPanBeganDuringPressCalls.push(began); }),
};

// Captured gesture callbacks from the hook under test
let capturedOnBegin: (() => void) | null = null;
let capturedOnStart: (() => void) | null = null;
let capturedOnFinalize: (() => void) | null = null;

function requireCapturedCallback(callback: (() => void) | null): () => void {
  if (callback === null) {
    throw new Error('Expected gesture callback to be registered');
  }

  return callback;
}

// Chainable gesture mock — shared object so `return mockGesture` works from every method
const mockGesture = {
  minDistance: jest.fn().mockReturnThis(),
  onBegin: jest.fn((cb: () => void) => {
    capturedOnBegin = cb;
    return mockGesture;
  }),
  onStart: jest.fn((cb: () => void) => {
    capturedOnStart = cb;
    return mockGesture;
  }),
  onUpdate: jest.fn().mockReturnThis(),
  onEnd: jest.fn().mockReturnThis(),
  onFinalize: jest.fn((cb: () => void) => {
    capturedOnFinalize = cb;
    return mockGesture;
  }),
};

jest.mock('react-native-reanimated', () => ({
  runOnJS: (fn: (...args: unknown[]) => void) => fn,
  useSharedValue: () => ({ value: 0 }),
  withSpring: (v: number) => v,
}));

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => mockGesture,
  },
}));

jest.mock('@/components/floatingButtonLayout', () => ({
  getButtonRect: () => null,
  publishButtonRect: jest.fn(),
  subscribeButtonRects: () => jest.fn(() => undefined),
  resolveNonOverlappingWithRect: (pos: { x: number; y: number }) => pos,
}));

jest.mock('@/components/ai/useFloatingAIButtonPosition', () => ({
  useFloatingAIButtonPosition: () => ({
    translateX: { value: 0 },
    translateY: { value: 0 },
    savedTranslateX: { value: 0 },
    savedTranslateY: { value: 0 },
    geometry: { x: 0, y: 0, width: 400, height: 800 },
    latestGeometry: { value: { x: 0, y: 0, width: 400, height: 800 } },
    dragActive: { value: false },
    markPositionInteractionStarted: jest.fn(),
    savePosition: jest.fn(),
  }),
}));

describe('FloatingAIButton pan gesture — onBegin vs onStart arbitration', () => {
  beforeEach(() => {
    __resetTime();
    jest.clearAllMocks();
    cancelAffordancesCalls = 0;
    setPanBeganDuringPressCalls = [];
    capturedOnBegin = null;
    capturedOnStart = null;
    capturedOnFinalize = null;
  });

  it('onBegin must NOT call cancelAffordances — stationary press must not suppress hold', () => {
    renderHook(() =>
      require('@/components/ai/useFloatingAIButtonPanGesture').useFloatingAIButtonPanGesture(
        require('@/components/ai/useFloatingAIButtonPosition').useFloatingAIButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnBegin).not.toBeNull();

    requireCapturedCallback(capturedOnBegin)();

    expect(cancelAffordancesCalls).toBe(0);
    expect(setPanBeganDuringPressCalls).toEqual([]);
  });

  it('onStart MUST call cancelAffordances and setPanBeganDuringPress(true) — actual drag suppresses hold', () => {
    renderHook(() =>
      require('@/components/ai/useFloatingAIButtonPanGesture').useFloatingAIButtonPanGesture(
        require('@/components/ai/useFloatingAIButtonPosition').useFloatingAIButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnStart).not.toBeNull();

    requireCapturedCallback(capturedOnStart)();

    expect(cancelAffordancesCalls).toBe(1);
    expect(setPanBeganDuringPressCalls).toEqual([true]);
  });

  it('onFinalize MUST call setPanBeganDuringPress(false) — resets suppression flag', () => {
    renderHook(() =>
      require('@/components/ai/useFloatingAIButtonPanGesture').useFloatingAIButtonPanGesture(
        require('@/components/ai/useFloatingAIButtonPosition').useFloatingAIButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnFinalize).not.toBeNull();

    requireCapturedCallback(capturedOnFinalize)();

    expect(setPanBeganDuringPressCalls).toEqual([false]);
  });

  it('closeMenu is called on onStart (not onBegin) — drag dismisses hub', () => {
    renderHook(() =>
      require('@/components/ai/useFloatingAIButtonPanGesture').useFloatingAIButtonPanGesture(
        require('@/components/ai/useFloatingAIButtonPosition').useFloatingAIButtonPosition(),
        mockActions,
      )
    );

    mockActions.closeMenu.mockClear();

    requireCapturedCallback(capturedOnBegin)();
    expect(mockActions.closeMenu).not.toHaveBeenCalled();

    requireCapturedCallback(capturedOnStart)();
    expect(mockActions.closeMenu).toHaveBeenCalledTimes(1);
  });
});
