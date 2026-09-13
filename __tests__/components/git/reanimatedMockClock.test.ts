'use strict';

const { __advanceBy, __completeAll, __resetTime } = global.MockReanimated as {
  __advanceBy: (ms: number) => void;
  __completeAll: () => void;
  __resetTime: () => void;
};

afterEach(() => {
  __resetTime();
});

describe('MockReanimated clock — baseline characterization', () => {
  it('__resetTime resets mock clock and cancels pending animations', () => {
    const { useSharedValue, withTiming } = require('react-native-reanimated');
    const sv = useSharedValue(0);

    sv.value = withTiming(1, { duration: 3000 });

    expect(sv.value).toBe(0);
    __advanceBy(1500);
    expect(sv.value).toBeCloseTo(0.5, 2);
    __resetTime();
    expect(sv.value).toBe(0);
  });

  it('__advanceBy drives time-based animations proportionally', () => {
    const { useSharedValue, withTiming } = require('react-native-reanimated');
    const sv = useSharedValue(0);

    sv.value = withTiming(1, { duration: 2000 });

    __advanceBy(0);
    expect(sv.value).toBe(0);
    __advanceBy(500);
    expect(sv.value).toBeCloseTo(0.25, 2);
    __advanceBy(500);
    expect(sv.value).toBeCloseTo(0.5, 2);
    __advanceBy(1000);
    expect(sv.value).toBe(1);
  });

  it('__completeAll immediately resolves all pending animations', () => {
    const { useSharedValue, withTiming } = require('react-native-reanimated');
    const sv = useSharedValue(0);

    sv.value = withTiming(1, { duration: 3000 });

    expect(sv.value).toBe(0);
    __completeAll();
    expect(sv.value).toBe(1);
  });

  it('cancelAnimation stops a pending animation in place', () => {
    const { useSharedValue, withTiming, cancelAnimation } = require('react-native-reanimated');
    const sv = useSharedValue(0);

    sv.value = withTiming(1, { duration: 3000 });
    __advanceBy(1000);
    expect(sv.value).toBeCloseTo(1 / 3, 2);

    cancelAnimation(sv);
    __advanceBy(2000);
    expect(sv.value).toBeCloseTo(1 / 3, 2);
  });

  it('withSpring resolves immediately — no time advance needed', () => {
    const { useSharedValue, withSpring } = require('react-native-reanimated');
    const sv = useSharedValue(0);

    sv.value = withSpring(1);
    expect(sv.value).toBe(1);
  });
});
