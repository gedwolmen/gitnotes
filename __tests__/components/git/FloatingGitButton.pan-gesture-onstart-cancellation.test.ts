import { renderHook } from '@testing-library/react-native';

declare const MockReanimated: {
  __advanceBy: (ms: number) => void;
  __resetTime: () => void;
};

const { __resetTime } = MockReanimated;

let cancelAffordancesCalls: number = 0;
let setPanBeganCalls: Array<boolean> = [];

const mockActions = {
  closeMenu: jest.fn(),
  setHorizontalDirection: jest.fn(),
  setVerticalDirection: jest.fn(),
  cancelAffordances: jest.fn(() => { cancelAffordancesCalls++; }),
  setPanBegan: jest.fn((began: boolean) => { setPanBeganCalls.push(began); }),
};

let capturedOnBegin: (() => void) | null = null;
let capturedOnStart: (() => void) | null = null;
let capturedOnFinalize: (() => void) | null = null;

function requireCapturedCallback(callback: (() => void) | null): () => void {
  if (callback === null) {
    throw new Error('Expected gesture callback to be registered');
  }
  return callback;
}

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

jest.mock('@/components/git/useFloatingGitButtonPosition', () => ({
  useFloatingGitButtonPosition: () => ({
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

describe('FloatingGitButton pan gesture — setPanBegan worklet-safety regression', () => {
  beforeEach(() => {
    __resetTime();
    jest.clearAllMocks();
    cancelAffordancesCalls = 0;
    setPanBeganCalls = [];
    capturedOnBegin = null;
    capturedOnStart = null;
    capturedOnFinalize = null;
  });

  it('onStart MUST call setPanBegan(true) via runOnJS — suppresses tap during drag', () => {
    renderHook(() =>
      require('@/components/git/useFloatingGitButtonPanGesture').useFloatingGitButtonPanGesture(
        require('@/components/git/useFloatingGitButtonPosition').useFloatingGitButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnStart).not.toBeNull();

    requireCapturedCallback(capturedOnStart)();

    expect(cancelAffordancesCalls).toBe(1);
    expect(setPanBeganCalls).toEqual([true]);
  });

  it('onFinalize MUST call setPanBegan(false) via runOnJS — resets suppression flag', () => {
    renderHook(() =>
      require('@/components/git/useFloatingGitButtonPanGesture').useFloatingGitButtonPanGesture(
        require('@/components/git/useFloatingGitButtonPosition').useFloatingGitButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnFinalize).not.toBeNull();

    requireCapturedCallback(capturedOnFinalize)();

    expect(setPanBeganCalls).toEqual([false]);
  });

  it('onStart then onFinalize produces [true, false] sequence', () => {
    renderHook(() =>
      require('@/components/git/useFloatingGitButtonPanGesture').useFloatingGitButtonPanGesture(
        require('@/components/git/useFloatingGitButtonPosition').useFloatingGitButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnStart).not.toBeNull();
    expect(capturedOnFinalize).not.toBeNull();

    requireCapturedCallback(capturedOnStart)();
    requireCapturedCallback(capturedOnFinalize)();

    expect(setPanBeganCalls).toEqual([true, false]);
  });

  it('onBegin does NOT call setPanBegan — stationary press must not suppress tap', () => {
    renderHook(() =>
      require('@/components/git/useFloatingGitButtonPanGesture').useFloatingGitButtonPanGesture(
        require('@/components/git/useFloatingGitButtonPosition').useFloatingGitButtonPosition(),
        mockActions,
      )
    );

    expect(capturedOnBegin).not.toBeNull();

    requireCapturedCallback(capturedOnBegin)();

    expect(setPanBeganCalls).toEqual([]);
  });
});
