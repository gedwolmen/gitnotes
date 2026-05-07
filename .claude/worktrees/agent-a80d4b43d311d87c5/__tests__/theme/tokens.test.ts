import {
  resolveColors,
  RADII,
  SPACING,
  TYPE,
  NEUMORPHIC_LIGHT,
  NEUMORPHIC_DARK,
  FLAT_LIGHT,
  FLAT_DARK,
} from '../../src/theme/tokens';

describe('resolveColors', () => {
  it('returns neumorphic light palette by default', () => {
    expect(resolveColors('neumorphic', false)).toBe(NEUMORPHIC_LIGHT);
  });

  it('returns neumorphic dark palette when isDark', () => {
    expect(resolveColors('neumorphic', true)).toBe(NEUMORPHIC_DARK);
  });

  it('returns flat light palette when style=flat and not dark', () => {
    expect(resolveColors('flat', false)).toBe(FLAT_LIGHT);
  });

  it('returns flat dark palette when style=flat and dark', () => {
    expect(resolveColors('flat', true)).toBe(FLAT_DARK);
  });
});

describe('design constants', () => {
  it('exposes pillowy radii', () => {
    expect(RADII).toEqual({ sm: 12, md: 18, lg: 24, pill: 999 });
  });

  it('exposes 4-pt spacing scale', () => {
    expect(SPACING).toEqual({ 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 });
  });

  it('exposes type sizes', () => {
    expect(TYPE).toEqual({ xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 });
  });

  it('keeps neumorphic surface and bg slightly distinct so soft shadows still read', () => {
    expect(NEUMORPHIC_LIGHT.surface).not.toBe(NEUMORPHIC_LIGHT.bg);
    expect(NEUMORPHIC_DARK.surface).not.toBe(NEUMORPHIC_DARK.bg);
  });

  it('keeps neumorphic palette neutral (no blue-tinted shadows or surfaces)', () => {
    // Neutral grays decompose to channels within ±2 of each other.
    const isNeutral = (hex: string): boolean => {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return Math.max(r, g, b) - Math.min(r, g, b) <= 2;
    };
    for (const key of ['bg', 'surface', 'highlight', 'shadow', 'border'] as const) {
      expect(isNeutral(NEUMORPHIC_LIGHT[key])).toBe(true);
      expect(isNeutral(NEUMORPHIC_DARK[key])).toBe(true);
    }
  });

  it('preserves the existing flat palette colors used today', () => {
    expect(FLAT_LIGHT.bg).toBe('#f2f2f7');
    expect(FLAT_LIGHT.text).toBe('#1c1c1e');
    expect(FLAT_DARK.bg).toBe('#000000');
    expect(FLAT_DARK.text).toBe('#f2f2f7');
  });
});
