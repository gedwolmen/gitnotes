/**
 * Regression tests for responsive dimension handling.
 *
 * Validates that NoteImage and GraphViewScreen use reactive useWindowDimensions()
 * instead of the module-level Dimensions.get('window') pattern, which does not
 * update when the device rotates or changes viewport size.
 */

describe('responsive dimension invariants', () => {
  // Note: We validate the source-level invariants rather than rendering full
  // components, which would require extensive Skia / react-native-reanimated mocking.
  // The source pattern check is deterministic and covers the exact regression.

  describe('NoteImage uses useWindowDimensions hook', () => {
    test('imports useWindowDimensions from react-native', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/components/NoteImage.tsx'),
        'utf-8',
      );
      expect(source).toMatch(/import\s+\{[^}]*useWindowDimensions[^}]*\}\s+from\s+['"]react-native['"]/);
    });

    test('does not contain module-level Dimensions.get("window")', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/components/NoteImage.tsx'),
        'utf-8',
      );
      // The stale pattern is: const { width: screenWidth } = Dimensions.get('window');
      // or similar module-level calls. useWindowDimensions is fine (it's a hook call).
      // Match only the stale non-reactive pattern.
      const hasStalePattern = /const\s*\{[^}]*\}\s*=\s*Dimensions\.get\(['"]window['"]\)/.test(source);
      expect(hasStalePattern).toBe(false);
    });

    test('component calls useWindowDimensions inside the component function', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/components/NoteImage.tsx'),
        'utf-8',
      );
      // Verify useWindowDimensions is called within the component body.
      // Simple check: useWindowDimensions appears after the component declaration.
      const fnDeclIndex = source.indexOf('export default function NoteImage');
      const hookIndex = source.indexOf('useWindowDimensions()');
      expect(fnDeclIndex).toBeGreaterThanOrEqual(0);
      expect(hookIndex).toBeGreaterThan(fnDeclIndex);
    });
  });

  describe('GraphViewScreen uses useWindowDimensions hook', () => {
    test('imports useWindowDimensions from react-native', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/screens/GraphViewScreen.tsx'),
        'utf-8',
      );
      expect(source).toMatch(/import\s+\{[^}]*useWindowDimensions[^}]*\}\s+from\s+['"]react-native['"]/);
    });

    test('does not contain module-level Dimensions.get("window")', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/screens/GraphViewScreen.tsx'),
        'utf-8',
      );
      // Dimensions as a type import is fine; Dimensions.get at module level is the bug.
      // We specifically match module-scope .get('window') calls (not hook calls).
      // The pattern captures: any `= Dimensions.get('window')` that is NOT inside a function.
      const moduleLevelDimensions = source.match(
        /^(?:const|let|var)\s+\{[^}]*\}\s*=\s*Dimensions\.get\(['"]window['"]\)/m,
      );
      // If it exists, it must be inside a function (useWindowDimensions is a hook call,
      // not Dimensions.get). Check that the only Dimensions.get call is useWindowDimensions.
      const nonHookDimensionsGet = /Dimensions\.get\(['"]window['"]\)(?!\s*\))/.test(source);
      expect(nonHookDimensionsGet).toBe(false);
    });

    test('centerGraph callback lists screenWidth in its dependency array', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/screens/GraphViewScreen.tsx'),
        'utf-8',
      );
      // Find the centerGraph callback and verify its dependency array includes screenWidth
      // This prevents the regression where centerGraph captured a stale module-level width.
      const centerGraphMatch = source.match(
        /const\s+centerGraph\s*=\s*useCallback\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\},\s*\[([^\]]*)\]\s*\)/,
      );
      expect(centerGraphMatch).not.toBeNull();
      const deps = centerGraphMatch?.[1] ?? '';
      expect(deps).toMatch(/\bscreenWidth\b/);
    });
  });
});
