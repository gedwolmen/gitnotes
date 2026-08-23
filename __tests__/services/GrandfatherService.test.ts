jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
      __dump: () => ({ ...store }),
      __setGrandfather: async () => {
        store['@gitnotes:pro_grandfathered'] = 'true';
      },
      __setChecked: async () => {
        store['@gitnotes:grandfather_checked'] = 'true';
      },
    },
  };
});

jest.mock('../../src/services/OnboardingService', () => ({
  OnboardingService: {
    isOnboardingCompleted: jest.fn(async () => false),
    completeOnboarding: jest.fn(async () => undefined),
    resetOnboarding: jest.fn(async () => undefined),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingService } from '../../src/services/OnboardingService';
import {
  GRANDFATHERED_KEY,
  GRANDFATHER_CHECKED_KEY,
  resolveGrandfatherStatus,
} from '../../src/services/GrandfatherService';

const store = AsyncStorage as unknown as {
  __reset: () => void;
  __dump: () => Record<string, string>;
};

const isOnboardingCompletedMock = OnboardingService.isOnboardingCompleted as jest.Mock;

beforeEach(() => {
  store.__reset();
  isOnboardingCompletedMock.mockClear();
  isOnboardingCompletedMock.mockResolvedValue(false);
});

describe('resolveGrandfatherStatus', () => {
  it('grants immediately when the flag is already set (flag reason)', async () => {
    await store.__setGrandfather();
    const result = await resolveGrandfatherStatus(null);
    expect(result).toEqual({ isGrandfathered: true, reason: 'flag' });
    expect(isOnboardingCompletedMock).not.toHaveBeenCalled();
  });

  it('skips evaluation when the one-shot check already ran', async () => {
    await store.__setChecked();
    const result = await resolveGrandfatherStatus(null);
    expect(result).toEqual({ isGrandfathered: false, reason: 'checked' });
    expect(isOnboardingCompletedMock).not.toHaveBeenCalled();
  });

  it('does NOT grant via onboarding alone (paywall bypass prevention)', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus(null);
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    const dump = store.__dump();
    expect(dump[GRANDFATHERED_KEY]).toBeUndefined();
    expect(dump[GRANDFATHER_CHECKED_KEY]).toBe('true');
  });

  it('grants via combined onboarding + iOS install version < 9 (pre-paywall install)', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '7' });
    expect(result).toEqual({ isGrandfathered: true, reason: 'ios-build' });
    expect(store.__dump()[GRANDFATHERED_KEY]).toBe('true');
  });

  it('does NOT grant via onboarding + iOS install version >= 9 (post-paywall install)', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '12' });
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    expect(store.__dump()[GRANDFATHERED_KEY]).toBeUndefined();
  });

  it('does NOT grant via onboarding alone when originalApplicationVersion is null (Android / no signal)', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus(null);
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    expect(store.__dump()[GRANDFATHERED_KEY]).toBeUndefined();
  });

  it('grants via iOS build when originalApplicationVersion < 9', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '7' });
    expect(result).toEqual({ isGrandfathered: true, reason: 'ios-build' });
    expect(store.__dump()[GRANDFATHERED_KEY]).toBe('true');
  });

  it('grants via iOS build at the exact boundary 8 < 9', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '8' });
    expect(result.isGrandfathered).toBe(true);
  });

  it('does NOT grant via iOS build alone without onboarding completion', async () => {
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '7' });
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    expect(store.__dump()[GRANDFATHERED_KEY]).toBeUndefined();
  });

  it('does not grant when the iOS build is 9 or newer', async () => {
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: '9' });
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
  });

  it('does not grant on a non-numeric originalApplicationVersion', async () => {
    const result = await resolveGrandfatherStatus({ originalApplicationVersion: 'abc' });
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
  });

  it('does not grant when customerInfo is unavailable and onboarding is incomplete', async () => {
    const result = await resolveGrandfatherStatus(null);
    expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    expect(store.__dump()[GRANDFATHER_CHECKED_KEY]).toBe('true');
  });

  it('is one-shot: a second call after granting returns the flag and never re-evaluates', async () => {
    isOnboardingCompletedMock.mockResolvedValue(true);
    const first = await resolveGrandfatherStatus({ originalApplicationVersion: '7' });
    expect(first.isGrandfathered).toBe(true);
    expect(isOnboardingCompletedMock).toHaveBeenCalledTimes(1);

    const second = await resolveGrandfatherStatus(null);
    expect(second).toEqual({ isGrandfathered: true, reason: 'flag' });
    expect(isOnboardingCompletedMock).toHaveBeenCalledTimes(1);
  });

  it('never revokes: a checked new user who later onboarded stays non-grandfathered', async () => {
    const first = await resolveGrandfatherStatus(null);
    expect(first).toEqual({ isGrandfathered: false, reason: 'none' });
    isOnboardingCompletedMock.mockResolvedValue(true);
    const second = await resolveGrandfatherStatus(null);
    expect(second).toEqual({ isGrandfathered: false, reason: 'checked' });
  });
});
