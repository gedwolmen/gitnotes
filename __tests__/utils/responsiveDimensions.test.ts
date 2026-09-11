/**
 * Regression tests for responsive dimension handling.
 *
 * Validates that responsive dimensions are read during render without adding
 * another hook whose call count can differ across Android navigation renders.
 */

describe('responsive dimension invariants', () => {
  // Note: We validate the source-level invariants rather than rendering full
  // components, which would require extensive Skia / react-native-reanimated mocking.
  // The source pattern check is deterministic and covers the exact regression.

  describe('NoteImage reads dimensions during render', () => {
    test('does not import useWindowDimensions', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/components/NoteImage.tsx'),
        'utf-8',
      );
      expect(source).not.toMatch(/useWindowDimensions/);
    });

    test('reads window dimensions inside the component function', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/components/NoteImage.tsx'),
        'utf-8',
      );
      const fnDeclIndex = source.indexOf('export default function NoteImage');
      const dimensionReadIndex = source.indexOf("Dimensions.get('window')");
      expect(fnDeclIndex).toBeGreaterThanOrEqual(0);
      expect(dimensionReadIndex).toBeGreaterThan(fnDeclIndex);
    });
  });

  describe('GraphViewScreen reads dimensions during render', () => {
    test('does not import useWindowDimensions', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/screens/GraphViewScreen.tsx'),
        'utf-8',
      );
      expect(source).not.toMatch(/useWindowDimensions/);
    });

    test('reads window dimensions inside the component function', () => {
      const source = require('fs').readFileSync(
        require('path').join(__dirname, '../../src/screens/GraphViewScreen.tsx'),
        'utf-8',
      );
      const fnDeclIndex = source.indexOf('export default function GraphViewScreen');
      const dimensionReadIndex = source.indexOf("Dimensions.get('window')");
      expect(fnDeclIndex).toBeGreaterThanOrEqual(0);
      expect(dimensionReadIndex).toBeGreaterThan(fnDeclIndex);
    });
  });
});
