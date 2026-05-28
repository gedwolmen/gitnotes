import { Palette, ThemeStyle } from './tokens';

export type ElevationTier = 'subtle' | 'raised' | 'floating';
export type Platform = 'ios' | 'android' | 'web';

interface TierSpec {
  offset: number;
  blur: number;
}

const TIERS: Record<ElevationTier, TierSpec> = {
  subtle: { offset: 2, blur: 4 },
  raised: { offset: 4, blur: 8 },
  floating: { offset: 8, blur: 16 },
};

export interface AndroidOverlays {
  offset: number;
  blur: number;
  highlight: string;
  shadow: string;
  inset: boolean;
}

export interface ElevationStyles {
  outer: Record<string, unknown>;
  inner: Record<string, unknown>;
  androidOverlays?: AndroidOverlays;
}

export interface BuildElevationArgs {
  tier: ElevationTier;
  inset: boolean;
  style: ThemeStyle;
  colors: Palette;
  platform: Platform;
}

export function buildElevation(args: BuildElevationArgs): ElevationStyles {
  const { tier, inset, style, colors, platform } = args;

  if (style === 'flat') {
    return { outer: {}, inner: {} };
  }

  const { offset, blur } = TIERS[tier];
  const darkColor = colors.shadow;
  const lightColor = colors.highlight;

  if (platform === 'ios') {
    const topLeftColor = inset ? darkColor : lightColor;
    const bottomRightColor = inset ? lightColor : darkColor;
    return {
      outer: {
        shadowColor: bottomRightColor,
        shadowOffset: { width: offset, height: offset },
        shadowOpacity: 1,
        shadowRadius: blur,
      },
      inner: {
        shadowColor: topLeftColor,
        shadowOffset: { width: -offset, height: -offset },
        shadowOpacity: 1,
        shadowRadius: blur,
      },
    };
  }

  if (platform === 'web') {
    const offsetX = offset;
    const offsetY = offset;
    const blurRadius = blur;
    const color = inset ? lightColor : darkColor;
    return {
      outer: {
        shadowColor: color,
        shadowOffset: { width: offsetX, height: offsetY },
        shadowOpacity: 0.3,
        shadowRadius: blurRadius,
      },
      inner: {},
    };
  }

  return {
    outer: {},
    inner: {},
    androidOverlays: {
      offset,
      blur,
      highlight: lightColor,
      shadow: darkColor,
      inset,
    },
  };
}
