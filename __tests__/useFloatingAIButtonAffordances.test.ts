import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockSharedValues: Array<{ value: unknown }> = [];
const mockSpringCalls: Array<readonly [unknown, unknown]> = [];
const mockTimingCalls: Array<readonly [unknown, unknown]> = [];
const mockDelayCalls: Array<readonly [unknown, unknown]> = [];
const mockSequenceCalls: Array<readonly unknown[]> = [];
const mockRepeatCalls: Array<readonly [unknown, unknown, unknown]> = [];
const mockCancelled: Array<{ value: unknown }> = [];

jest.mock('react-native-reanimated', () => {
  const MockView = require('react-native').View;

  return {
    __esModule: true,
    default: { View: MockView },
    useSharedValue: (initial: unknown) => {
      const React: typeof import('react') = require('react');
      const sharedValueRef = React.useRef<{ value: unknown } | null>(null);
      if (sharedValueRef.current === null) {
        sharedValueRef.current = { value: initial };
        mockSharedValues.push(sharedValueRef.current);
      }
      return sharedValueRef.current;
    },
    useAnimatedStyle: (callback: () => Record<string, unknown>) => callback(),
    withSpring: (value: unknown, config: unknown) => {
      mockSpringCalls.push([value, config]);
      return value;
    },
    withTiming: (value: unknown, config: unknown) => {
      mockTimingCalls.push([value, config]);
      return value;
    },
    withDelay: (delay: unknown, animation: unknown) => {
      mockDelayCalls.push([delay, animation]);
      return animation;
    },
    withSequence: (...animations: unknown[]) => {
      mockSequenceCalls.push(animations);
      return animations[animations.length - 1];
    },
    withRepeat: (animation: unknown, repetitions: unknown, reversed: unknown) => {
      mockRepeatCalls.push([animation, repetitions, reversed]);
      return animation;
    },
    cancelAnimation: (sharedValue: { value: unknown }) => {
      mockCancelled.push(sharedValue);
    },
    runOnJS: (callback: (...args: unknown[]) => unknown) => callback,
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import {
  FLOATING_AI_BUTTON_LONG_PRESS_MS,
  PRESS_SCALE_FACTOR,
  useFloatingAIButtonAffordances,
  type FloatingAIButtonAffordanceOptions,
  type FloatingAIButtonAffordances,
} from '../src/components/ai/useFloatingAIButtonAffordances';

const ENTRANCE_SPRING = { mass: 0.9, damping: 14, stiffness: 240 };
const PRESS_SPRING = { mass: 0.6, damping: 16, stiffness: 480 };

const defaultOptions: FloatingAIButtonAffordanceOptions = {
  reduceMotionEnabled: false,
  reduceMotionResolved: true,
  menuOpen: false,
};

function renderAffordances(overrides: Partial<FloatingAIButtonAffordanceOptions> = {}) {
  return renderHook(
    (props: FloatingAIButtonAffordanceOptions) => useFloatingAIButtonAffordances(props),
    { initialProps: { ...defaultOptions, ...overrides } },
  );
}

async function settleDiscovery(result: {
  current: FloatingAIButtonAffordances;
}): Promise<void> {
  await waitFor(() => expect(result.current.discoveryChecked).toBe(true));
}

describe('useFloatingAIButtonAffordances', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockSharedValues.length = 0;
    mockSpringCalls.length = 0;
    mockTimingCalls.length = 0;
    mockDelayCalls.length = 0;
    mockSequenceCalls.length = 0;
    mockRepeatCalls.length = 0;
    mockCancelled.length = 0;
    await AsyncStorage.clear();
  });

  it('exposes the documented long-press window and press scale contract', () => {
    expect(FLOATING_AI_BUTTON_LONG_PRESS_MS).toBe(450);
    expect(PRESS_SCALE_FACTOR).toBe(0.08);
  });

  it('creates entrance, press, hold, and hint shared values in index order', async () => {
    const { result } = renderAffordances();
    await settleDiscovery(result);

    expect(mockSharedValues[0]).toBe(result.current.entranceProgress);
    expect(mockSharedValues[1]).toBe(result.current.pressProgress);
    expect(mockSharedValues[2]).toBe(result.current.holdProgress);
    expect(mockSharedValues[3]).toBe(result.current.hintProgress);
  });

  it('keeps entrance at zero until Reduce Motion state resolves', async () => {
    const { result } = renderAffordances({ reduceMotionResolved: false });

    expect(result.current.entranceProgress.value).toBe(0);
    expect(mockSpringCalls).toEqual([]);

    await settleDiscovery(result);
    expect(result.current.entranceProgress.value).toBe(0);
    expect(mockSpringCalls).toEqual([]);
  });

  it('jumps entrance to one without a spring when Reduce Motion is enabled', async () => {
    const { result } = renderAffordances({ reduceMotionEnabled: true });

    expect(result.current.entranceProgress.value).toBe(1);
    expect(mockSpringCalls).toEqual([]);
    expect(mockCancelled).toContain(result.current.entranceProgress);

    await settleDiscovery(result);
    expect(mockRepeatCalls).toEqual([]);
    expect(mockDelayCalls).toEqual([]);
  });

  it('springs entrance to one exactly once when motion is allowed', async () => {
    const { result, rerender } = renderAffordances();

    expect(mockSpringCalls).toEqual([[1, ENTRANCE_SPRING]]);
    expect(result.current.entranceProgress.value).toBe(1);

    rerender(defaultOptions);
    expect(mockSpringCalls).toHaveLength(1);
    await settleDiscovery(result);
  });

  it('fills the hold ring over the long-press window and drains on early release', async () => {
    const { result } = renderAffordances();
    await settleDiscovery(result);
    mockSpringCalls.length = 0;
    mockTimingCalls.length = 0;

    act(() => {
      result.current.handlePressIn();
    });

    expect(result.current.pressProgress.value).toBe(1);
    expect(mockSpringCalls).toContainEqual([1, PRESS_SPRING]);
    expect(mockTimingCalls).toContainEqual([1, { duration: 450 }]);

    mockTimingCalls.length = 0;
    mockSpringCalls.length = 0;
    act(() => {
      result.current.handlePressOut();
    });

    expect(mockSpringCalls).toContainEqual([0, PRESS_SPRING]);
    expect(mockTimingCalls).toContainEqual([0, { duration: 150 }]);
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('absorbs the ring on hold completion and skips the drain on release', async () => {
    const { result } = renderAffordances();
    await settleDiscovery(result);
    mockSpringCalls.length = 0;
    mockTimingCalls.length = 0;

    act(() => {
      result.current.handlePressIn();
      result.current.handleHoldComplete();
    });

    expect(result.current.holdProgress.value).toBe(0);
    expect(mockTimingCalls).toContainEqual([0, { duration: 200 }]);

    mockTimingCalls.length = 0;
    act(() => {
      result.current.handlePressOut();
    });

    expect(mockTimingCalls).not.toContainEqual([0, { duration: 150 }]);
    expect(mockSpringCalls).toContainEqual([0, PRESS_SPRING]);
  });

  it('cancels and zeroes press, hold, and hint animations on affordance cancel', async () => {
    const { result } = renderAffordances();
    await settleDiscovery(result);
    act(() => {
      result.current.handlePressIn();
    });
    result.current.hintProgress.value = 0.2;
    mockCancelled.length = 0;

    act(() => {
      result.current.cancelAffordances();
    });

    expect(result.current.pressProgress.value).toBe(0);
    expect(result.current.holdProgress.value).toBe(0);
    expect(result.current.hintProgress.value).toBe(0);
    expect(mockCancelled).toHaveLength(3);
    expect(mockCancelled).toEqual(
      expect.arrayContaining([
        result.current.pressProgress,
        result.current.holdProgress,
        result.current.hintProgress,
      ]),
    );
    expect(result.current.entranceProgress.value).toBe(1);
  });

  it('persists discovery and cancels the teaser after the first hub open', async () => {
    const { result } = renderAffordances();
    await settleDiscovery(result);
    expect(result.current.hubDiscovered).toBe(false);

    act(() => {
      result.current.markHubDiscovered();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('ai-hub-discovered', 'true');
    expect(result.current.hubDiscovered).toBe(true);
    expect(mockCancelled).toContain(result.current.hintProgress);
    expect(result.current.hintProgress.value).toBe(0);
  });

  it('arms the one-time teaser pulse sequence while undiscovered', async () => {
    const { result } = renderAffordances();

    expect(mockRepeatCalls).toEqual([]);
    await settleDiscovery(result);

    expect(mockDelayCalls).toContainEqual([900, expect.anything()]);
    expect(mockDelayCalls).toContainEqual([2200, expect.anything()]);
    expect(mockRepeatCalls).toHaveLength(1);
    expect(mockRepeatCalls[0]).toEqual([expect.anything(), 3, false]);
    expect(mockSequenceCalls).toHaveLength(1);
    expect(mockSequenceCalls[0]).toHaveLength(2);
    expect(mockTimingCalls).toContainEqual([0.3, { duration: 550 }]);
    expect(mockTimingCalls).toContainEqual([0, { duration: 550 }]);
  });

  it('does not arm the teaser while the hub menu is open', async () => {
    const { result, rerender } = renderAffordances({ menuOpen: true });
    await settleDiscovery(result);
    expect(mockRepeatCalls).toEqual([]);

    rerender({ ...defaultOptions, menuOpen: false });
    expect(mockRepeatCalls).toHaveLength(1);
  });

  it('skips the hold ring fill under Reduce Motion but keeps press feedback', async () => {
    const { result } = renderAffordances({ reduceMotionEnabled: true });
    await settleDiscovery(result);
    mockSpringCalls.length = 0;
    mockTimingCalls.length = 0;

    act(() => {
      result.current.handlePressIn();
    });

    expect(result.current.pressProgress.value).toBe(1);
    expect(mockSpringCalls).toContainEqual([1, PRESS_SPRING]);
    expect(mockTimingCalls).toEqual([]);
    expect(result.current.holdProgress.value).toBe(0);
  });

  it('skips the teaser when the hub was discovered on a previous launch', async () => {
    await AsyncStorage.setItem('ai-hub-discovered', 'true');

    const { result } = renderAffordances();
    await settleDiscovery(result);

    expect(result.current.hubDiscovered).toBe(true);
    expect(mockRepeatCalls).toEqual([]);
    expect(mockDelayCalls).toEqual([]);
  });

  it('marks discovery checked even when the stored flag fails to load', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('storage offline'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const { result } = renderAffordances();
    await settleDiscovery(result);

    expect(result.current.discoveryChecked).toBe(true);
    expect(result.current.hubDiscovered).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      'Failed to read AI hub discovery flag:',
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});
