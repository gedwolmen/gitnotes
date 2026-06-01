import { buildElevation } from '../../src/theme/elevation';
import { NEUMORPHIC_LIGHT } from '../../src/theme/tokens';

describe('buildElevation', () => {
  it('returns flat zero-shadow when style=flat', () => {
    const e = buildElevation({
      tier: 'raised',
      inset: false,
      style: 'flat',
      colors: NEUMORPHIC_LIGHT,
      platform: 'ios',
    });
    expect(e.outer).toEqual({});
    expect(e.inner).toEqual({});
  });

  it('builds raised tier on iOS with two opposing shadows', () => {
    const e = buildElevation({
      tier: 'raised',
      inset: false,
      style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT,
      platform: 'ios',
    });
    expect(e.outer).toEqual({
      shadowColor: NEUMORPHIC_LIGHT.shadow,
      shadowOffset: { width: 4, height: 4 },
      shadowOpacity: 1,
      shadowRadius: 8,
    });
    expect(e.inner).toEqual({
      shadowColor: NEUMORPHIC_LIGHT.highlight,
      shadowOffset: { width: -4, height: -4 },
      shadowOpacity: 1,
      shadowRadius: 8,
    });
  });

  it('builds subtle and floating tiers with the spec offsets/blurs', () => {
    const subtle = buildElevation({
      tier: 'subtle', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    expect((subtle.outer as any).shadowOffset).toEqual({ width: 2, height: 2 });
    expect((subtle.outer as any).shadowRadius).toBe(4);

    const floating = buildElevation({
      tier: 'floating', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    expect((floating.outer as any).shadowOffset).toEqual({ width: 8, height: 8 });
    expect((floating.outer as any).shadowRadius).toBe(16);
  });

  it('inverts shadow direction when inset=true', () => {
    const e = buildElevation({
      tier: 'raised', inset: true, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'ios',
    });
    expect((e.outer as any).shadowColor).toBe(NEUMORPHIC_LIGHT.highlight);
    expect((e.outer as any).shadowOffset).toEqual({ width: 4, height: 4 });
    expect((e.inner as any).shadowColor).toBe(NEUMORPHIC_LIGHT.shadow);
    expect((e.inner as any).shadowOffset).toEqual({ width: -4, height: -4 });
  });

  it('uses CSS box-shadow strings on web', () => {
    const e = buildElevation({
      tier: 'raised', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'web',
    });
    expect((e.outer as any).shadowColor).toBe(NEUMORPHIC_LIGHT.shadow);
    expect((e.outer as any).shadowOffset).toEqual({ width: 4, height: 4 });
    expect((e.outer as any).shadowOpacity).toBe(0.3);
    expect((e.outer as any).shadowRadius).toBe(8);
  });

  it('uses CSS inset box-shadow on web when inset=true', () => {
    const e = buildElevation({
      tier: 'raised', inset: true, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'web',
    });
    expect((e.outer as any).shadowColor).toBe(NEUMORPHIC_LIGHT.highlight);
    expect((e.outer as any).shadowOffset).toEqual({ width: 4, height: 4 });
    expect((e.outer as any).shadowOpacity).toBe(0.3);
    expect((e.outer as any).shadowRadius).toBe(8);
  });

  it('returns empty inner and undefined androidOverlays on android with overlay descriptor', () => {
    const e = buildElevation({
      tier: 'raised', inset: false, style: 'neumorphic',
      colors: NEUMORPHIC_LIGHT, platform: 'android',
    });
    expect(e.outer).toEqual({});
    expect(e.inner).toEqual({});
    expect(e.androidOverlays).toBeUndefined();
  });
});
