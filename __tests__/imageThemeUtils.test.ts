import {
  getCaptionText,
  getSvgTint,
  shouldApplyCaption,
  shouldInvertForDark,
} from '../src/utils/imageThemeUtils';

describe('imageThemeUtils', () => {
  test('shouldInvertForDark reflects dark mode', () => {
    expect(shouldInvertForDark(true)).toBe(true);
    expect(shouldInvertForDark(false)).toBe(false);
  });

  test('getSvgTint returns a light tint in dark mode', () => {
    expect(getSvgTint(true)).toBe('#f5f5f5');
  });

  test('getSvgTint returns undefined in light mode', () => {
    expect(getSvgTint(false)).toBeUndefined();
  });

  test('shouldApplyCaption requires a non-empty alt text', () => {
    expect(shouldApplyCaption('My photo')).toBe(true);
    expect(shouldApplyCaption('')).toBe(false);
  });

  test('getCaptionText trims alt text', () => {
    expect(getCaptionText('  My photo  ')).toBe('My photo');
  });

  test('getCaptionText preserves internal spacing while trimming edges', () => {
    expect(getCaptionText('  hello   world  ')).toBe('hello   world');
  });
});
