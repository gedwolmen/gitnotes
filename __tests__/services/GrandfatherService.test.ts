let mockStore: Record<string, string> = {};

let resolveGrandfatherStatus: typeof import('@/services/GrandfatherService').resolveGrandfatherStatus;
let GRANDFATHERED_KEY: string;
let GRANDFATHER_CHECKED_KEY: string;
let FIRST_SEEN_BUILD_KEY: string;
let RESTORE_GRANTED_KEY: string;
let PRO_PAYWALL_FIRST_BUILD: number;
let asStore: typeof import('@react-native-async-storage/async-storage').default;

beforeEach(() => {
  mockStore = {};
  jest.resetModules();

  jest.doMock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
      removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
      clear: jest.fn(async () => { mockStore = {}; }),
    },
  }));

  const AsyncStorage = require('@react-native-async-storage/async-storage');
  asStore = AsyncStorage.default;

  const mod = require('@/services/GrandfatherService');
  resolveGrandfatherStatus = mod.resolveGrandfatherStatus;
  GRANDFATHERED_KEY = mod.GRANDFATHERED_KEY;
  GRANDFATHER_CHECKED_KEY = mod.GRANDFATHER_CHECKED_KEY;
  FIRST_SEEN_BUILD_KEY = mod.FIRST_SEEN_BUILD_KEY;
  RESTORE_GRANTED_KEY = mod.RESTORE_GRANTED_KEY;
  PRO_PAYWALL_FIRST_BUILD = mod.PRO_PAYWALL_FIRST_BUILD;

  require('@/services/StorageBootstrap').clearBootCache();
});

describe('resolveGrandfatherStatus', () => {
  describe('iOS grandfathering via originalApplicationVersion', () => {
    it('grandfathers iOS users with build < PRO_PAYWALL_FIRST_BUILD', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '8' });
      expect(result).toEqual({ isGrandfathered: true, reason: 'ios-build' });
    });

    it('grandfathers iOS users with build 1 (edge case)', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '1' });
      expect(result).toEqual({ isGrandfathered: true, reason: 'ios-build' });
    });

    it('does not grandfather iOS users with build >= PRO_PAYWALL_FIRST_BUILD', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: String(PRO_PAYWALL_FIRST_BUILD) });
      expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
      expect(mockStore[GRANDFATHER_CHECKED_KEY]).toBe('true');
    });

    it('does not grandfather iOS users with build 100', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '100' });
      expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    });

    it('rejects non-integer version strings to prevent bypass', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '1.0.0' });
      expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    });

    it('grandfathers even when other AsyncStorage values are absent', async () => {
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '3' });
      expect(result.isGrandfathered).toBe(true);
      expect(result.reason).toBe('ios-build');
    });
  });

  describe('Android grandfathering via FIRST_SEEN_BUILD_KEY', () => {
    it('grandfathers Android users with build < PRO_PAYWALL_FIRST_BUILD', async () => {
      mockStore[FIRST_SEEN_BUILD_KEY] = '5';
      const result = await resolveGrandfatherStatus(null);
      expect(result).toEqual({ isGrandfathered: true, reason: 'android-build' });
    });

    it('does not grandfather Android users with build >= PRO_PAYWALL_FIRST_BUILD', async () => {
      mockStore[FIRST_SEEN_BUILD_KEY] = '15';
      const result = await resolveGrandfatherStatus(null);
      expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
    });
  });

  describe('persisted flag (GRANDFATHERED_KEY)', () => {
    it('returns grandfathered immediately when flag is set', async () => {
      mockStore[GRANDFATHERED_KEY] = 'true';
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '100' });
      expect(result).toEqual({ isGrandfathered: true, reason: 'flag' });
    });
  });

  describe('restore-granted path', () => {
    it('grandfathers when RESTORE_GRANTED_KEY is set and customerInfo is null', async () => {
      mockStore[RESTORE_GRANTED_KEY] = 'true';
      const result = await resolveGrandfatherStatus(null);
      expect(result).toEqual({ isGrandfathered: true, reason: 'restore-granted' });
    });

    it('does not grandfather via restore-granted when customerInfo is not null but build is too high', async () => {
      mockStore[RESTORE_GRANTED_KEY] = 'true';
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '100' });
      expect(result.isGrandfathered).toBe(false);
    });
  });

  describe('GRANDFATHER_CHECKED_KEY caching', () => {
    it('does NOT cache negative result when customerInfo is null', async () => {
      const result = await resolveGrandfatherStatus(null);
      expect(result).toEqual({ isGrandfathered: false, reason: 'none' });
      expect(mockStore[GRANDFATHER_CHECKED_KEY]).toBeUndefined();
    });

    it('caches negative result when customerInfo is available', async () => {
      await resolveGrandfatherStatus({ originalApplicationVersion: '100' });
      expect(mockStore[GRANDFATHER_CHECKED_KEY]).toBe('true');
    });

    it('returns early when GRANDFATHER_CHECKED_KEY is already set', async () => {
      mockStore[GRANDFATHER_CHECKED_KEY] = 'true';
      const result = await resolveGrandfatherStatus({ originalApplicationVersion: '5' });
      expect(result).toEqual({ isGrandfathered: false, reason: 'checked' });
    });

    it('allows re-check when first call had null customerInfo and second has valid data', async () => {
      const first = await resolveGrandfatherStatus(null);
      expect(first).toEqual({ isGrandfathered: false, reason: 'none' });
      expect(mockStore[GRANDFATHER_CHECKED_KEY]).toBeUndefined();

      const second = await resolveGrandfatherStatus({ originalApplicationVersion: '5' });
      expect(second).toEqual({ isGrandfathered: true, reason: 'ios-build' });
    });
  });
});
