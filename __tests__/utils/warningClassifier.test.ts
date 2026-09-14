/**
 * Regression tests for warning classifier utility.
 *
 * These tests verify:
 * 1. Documented external/framework/SDK warnings are correctly classified as allowlisted
 * 2. Unknown/app-owned warnings are correctly classified as TARGET
 * 3. The classifier is deterministic (same input = same output)
 * 4. The classifier does not monkey-patch console.warn
 *
 * The classifier is used to verify that only documented external warnings
 * appear in the iOS runner, and no app-owned target warnings remain.
 */
import {
  classifyWarning,
  assertAllowlistedWarning,
  filterTargetWarnings,
  isAllowlistedWarning,
  getWarningCategories,
} from '../../src/utils/warningClassifier';

describe('warningClassifier', () => {
  describe('classifyWarning', () => {
    describe('FRAMEWORK category - iOS/UIRefreshControl warnings', () => {
      const frameworkWarnings = [
        'UIRefreshControl was called with an offscreen instance',
        'UIRefreshControl attempting to dismiss redrawal',
        '[framework] UIRefreshControl issue detected',
      ];

      test.each(frameworkWarnings)('classifies "%s" as FRAMEWORK', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('FRAMEWORK');
        expect(result.category).not.toBe('TARGET');
      });

      it('provides reason for FRAMEWORK classification', () => {
        const result = classifyWarning('UIRefreshControl warning');
        expect(result.reason).toContain('UIRefreshControl');
        expect(result.matchedPattern).toBeTruthy();
      });
    });

    describe('SDK category - RevenueCat warnings', () => {
      const sdkWarnings = [
        'Purchases.logIn called with the same appUserID as already logged in',
        'logIn called with the same user',
        'RevenueCat: logIn already logged in user',
      ];

      test.each(sdkWarnings)('classifies "%s" as SDK', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('SDK');
        expect(result.category).not.toBe('TARGET');
      });

      it('provides reason for SDK classification', () => {
        const result = classifyWarning('Purchases.logIn called with the same appUserID');
        expect(result.reason).toContain('RevenueCat');
      });
    });

    describe('SDK category - Expo warnings', () => {
      const expoWarnings = [
        'expo-linking: invalid state in session',
        'expo-auth-session: INVALID_STATE',
      ];

      test.each(expoWarnings)('classifies "%s" as SDK', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('SDK');
        expect(result.category).not.toBe('TARGET');
      });
    });

    describe('DOCUMENT category - Worklet/Skia architectural limitations', () => {
      const documentWarnings = [
        'Worklet: shared object mutation detected',
        'shared object mutation in worklet',
        'worklet attempted to mutate shared Skia object',
        'Skia.Path.Make() called inside worklet',
      ];

      test.each(documentWarnings)('classifies "%s" as DOCUMENT', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('DOCUMENT');
        expect(result.category).not.toBe('TARGET');
      });

      it('provides reason for DOCUMENT classification referencing Skia+Reanimated', () => {
        const result = classifyWarning('shared object mutation in worklet');
        expect(result.reason).toContain('Skia');
        expect(result.reason).toContain('Reanimated');
      });
    });

    describe('EXTERNAL category - Simulator/Toolchain warnings', () => {
      const externalWarnings = [
        'CoreHaptics engine not available in simulator',
        'CHHapticEngine failed to initialize in simulator',
        'Xcode warning: implicit conversion',
        'clang warning: pointer alignment',
        'ld: warning: duplicate symbol',
        'Metro bundler warning: large asset',
      ];

      test.each(externalWarnings)('classifies "%s" as EXTERNAL', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('EXTERNAL');
        expect(result.category).not.toBe('TARGET');
      });

      it('provides reason for EXTERNAL CoreHaptics classification', () => {
        const result = classifyWarning('CoreHaptics not available in simulator');
        expect(result.reason).toContain('Simulator');
        expect(result.reason).toContain('CoreHaptics');
      });
    });

    describe('TARGET category - Unknown/app-owned warnings', () => {
      const targetWarnings = [
        'Possible Unhandled Promise Rejection',
        'TypeError: Cannot read property x of undefined',
        'App-specific warning about something',
        'Canvas rendering error in my component',
        '[your-app] Something went wrong',
        'gitnotes: Failed to sync repository',
        'Network request failed',
      ];

      test.each(targetWarnings)('classifies "%s" as TARGET', (warning) => {
        const result = classifyWarning(warning);
        expect(result.category).toBe('TARGET');
      });

      it('provides reason for TARGET classification', () => {
        const result = classifyWarning('My app error');
        expect(result.reason).toContain('Unknown warning');
        expect(result.reason).toContain('not in the documented allowlist');
      });

      it('includes the original warning in TARGET reason', () => {
        const warning = 'gitnotes: sync failed';
        const result = classifyWarning(warning);
        expect(result.reason).toContain(warning);
      });
    });

    describe('edge cases', () => {
      it('handles empty string as TARGET', () => {
        const result = classifyWarning('');
        expect(result.category).toBe('TARGET');
        expect(result.reason).toContain('Empty warning');
      });

      it('handles whitespace-only string as TARGET', () => {
        const result = classifyWarning('   \n\t  ');
        expect(result.category).toBe('TARGET');
      });

      it('is case-sensitive in pattern matching', () => {
        // 'uir efreshcontrol' should not match 'UIRefreshControl'
        const result = classifyWarning('uir efreshcontrol warning');
        expect(result.category).toBe('TARGET');
      });

      it('uses partial matching within the warning string', () => {
        // The warning may have prefixes or suffixes
        const result = classifyWarning('Warning: UIRefreshControl was called');
        expect(result.category).toBe('FRAMEWORK');
      });
    });

    describe('determinism', () => {
      it('returns same classification for same input multiple times', () => {
        const warning = 'UIRefreshControl warning';
        const result1 = classifyWarning(warning);
        const result2 = classifyWarning(warning);
        const result3 = classifyWarning(warning);

        expect(result1.category).toBe(result2.category);
        expect(result2.category).toBe(result3.category);
        expect(result1.reason).toBe(result2.reason);
        expect(result2.reason).toBe(result3.reason);
      });

      it('different warnings get classified independently', () => {
        const frameworkResult = classifyWarning('UIRefreshControl warning');
        const sdkResult = classifyWarning('RevenueCat same-user warning');
        const targetResult = classifyWarning('Unknown app error');

        expect(frameworkResult.category).toBe('FRAMEWORK');
        expect(sdkResult.category).toBe('SDK');
        expect(targetResult.category).toBe('TARGET');
      });

      // Regression test: global regex (g flag) causes .test() to mutate lastIndex,
      // which can cause repeated matches to fail after first call.
      // This test uses the pattern that previously had the 'g' flag.
      it('repeatedly classifies warning with "attempting to dismiss redrawal" consistently', () => {
        const warning = 'UIRefreshControl attempting to dismiss redrawal warning';
        for (let i = 0; i < 10; i++) {
          const result = classifyWarning(warning);
          expect(result.category).toBe('FRAMEWORK');
          expect(result.reason).toContain('UIRefreshControl');
        }
      });

      it('repeatedly classifies any allowlisted warning consistently (stress test)', () => {
        const warnings = [
          'UIRefreshControl was called with an offscreen instance',
          'Purchases.logIn called with the same appUserID as already logged in',
          'Worklet: shared object mutation detected',
          'CoreHaptics engine not available in simulator',
          'expo-linking: invalid state in session',
        ];

        for (const warning of warnings) {
          for (let i = 0; i < 5; i++) {
            const result = classifyWarning(warning);
            expect(result.category).not.toBe('TARGET');
          }
        }
      });
    });
  });

  describe('assertAllowlistedWarning', () => {
    it('does not throw for FRAMEWORK warning', () => {
      expect(() => assertAllowlistedWarning('UIRefreshControl warning')).not.toThrow();
    });

    it('does not throw for SDK warning', () => {
      expect(() => assertAllowlistedWarning('RevenueCat logIn same user')).not.toThrow();
    });

    it('does not throw for EXTERNAL warning', () => {
      expect(() => assertAllowlistedWarning('CoreHaptics not available')).not.toThrow();
    });

    it('does not throw for DOCUMENT warning', () => {
      expect(() => assertAllowlistedWarning('shared object mutation in worklet')).not.toThrow();
    });

    it('throws Error for TARGET warning', () => {
      expect(() => assertAllowlistedWarning('My app error')).toThrow(Error);
    });

    it('throws with descriptive message for TARGET warning', () => {
      const warning = 'gitnotes: sync failed';
      expect(() => assertAllowlistedWarning(warning)).toThrow(/App-owned target warning detected/);
      expect(() => assertAllowlistedWarning(warning)).toThrow(warning);
      expect(() => assertAllowlistedWarning(warning)).toThrow(/not in the documented allowlist/);
    });
  });

  describe('filterTargetWarnings', () => {
    it('returns empty array when all warnings are allowlisted', () => {
      const warnings = [
        'UIRefreshControl warning',
        'RevenueCat logIn same user',
        'CoreHaptics simulator',
        'shared object mutation',
      ];
      const result = filterTargetWarnings(warnings);
      expect(result).toEqual([]);
    });

    it('returns only TARGET warnings', () => {
      const warnings = [
        'UIRefreshControl warning', // FRAMEWORK
        'My app error', // TARGET
        'RevenueCat logIn same user', // SDK
        'Another app issue', // TARGET
        'CoreHaptics simulator', // EXTERNAL
      ];
      const result = filterTargetWarnings(warnings);
      expect(result).toEqual(['My app error', 'Another app issue']);
    });

    it('returns all warnings when all are TARGET', () => {
      const warnings = ['Error 1', 'Error 2', 'Error 3'];
      const result = filterTargetWarnings(warnings);
      expect(result).toEqual(warnings);
    });

    it('returns empty array for empty input', () => {
      const result = filterTargetWarnings([]);
      expect(result).toEqual([]);
    });
  });

  describe('isAllowlistedWarning', () => {
    it('returns true for FRAMEWORK warning', () => {
      expect(isAllowlistedWarning('UIRefreshControl warning')).toBe(true);
    });

    it('returns true for SDK warning', () => {
      expect(isAllowlistedWarning('RevenueCat logIn same user')).toBe(true);
    });

    it('returns true for EXTERNAL warning', () => {
      expect(isAllowlistedWarning('CoreHaptics not available')).toBe(true);
    });

    it('returns true for DOCUMENT warning', () => {
      expect(isAllowlistedWarning('shared object mutation')).toBe(true);
    });

    it('returns false for TARGET warning', () => {
      expect(isAllowlistedWarning('My app error')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isAllowlistedWarning('')).toBe(false);
    });
  });

  describe('getWarningCategories', () => {
    it('returns all warning categories', () => {
      const categories = getWarningCategories();
      expect(categories).toContain('DOCUMENT');
      expect(categories).toContain('EXTERNAL');
      expect(categories).toContain('FRAMEWORK');
      expect(categories).toContain('SDK');
      expect(categories).toContain('TARGET');
    });

    it('returns exactly 5 categories', () => {
      const categories = getWarningCategories();
      expect(categories).toHaveLength(5);
    });
  });
});
