/**
 * Marketing Asset Pipeline - Store Themes
 *
 * Brand-derived theme tokens for store slide composition.
 * Tokens are derived from GitNotēs brand colors.
 *
 * Brand palette sources:
 * - assets/logo.svg (brand blue: #5B7CEC)
 * - README.md accent colors (blue tones)
 * - App Store badges (Apple uses #007AFF, Google Play uses gradient)
 */

import type { StoreTheme } from './types';

// ------------------------------------------------------------------------------------------------
// Brand Colors (from GitNotēs identity)
// ------------------------------------------------------------------------------------------------

/**
 * GitNotēs brand primary color (blue-violet).
 * Sourced from logo SVG and brand identity.
 */
const BRAND_PRIMARY = '#5B7CEC';

/**
 * Dark background for contrast slides.
 */
const BRAND_DARK = '#0B1020';

/**
 * Light background for primary slides.
 */
const BRAND_LIGHT = '#F6F1EA';

/**
 * Text on light backgrounds.
 */
const TEXT_DARK = '#171717';

/**
 * Text on dark backgrounds.
 */
const TEXT_LIGHT = '#F8FAFC';

/**
 * Muted text color.
 */
const TEXT_MUTED = '#6B7280';

// ------------------------------------------------------------------------------------------------
// Preset Themes
// ------------------------------------------------------------------------------------------------

/**
 * Clean, light theme with warm undertones.
 * Default for most store screenshots.
 */
export const THEME_CLEAN_LIGHT: StoreTheme = {
  id: 'clean-light',
  background: BRAND_LIGHT,
  foreground: TEXT_DARK,
  accent: BRAND_PRIMARY,
  muted: TEXT_MUTED,
  gradientFrom: '#F6F1EA',
  gradientTo: '#E8E4DD',
};

/**
 * Bold, dark theme for contrast slides.
 */
export const THEME_DARK_BOLD: StoreTheme = {
  id: 'dark-bold',
  background: BRAND_DARK,
  foreground: TEXT_LIGHT,
  accent: '#8B5CF6',
  muted: '#94A3B8',
  gradientFrom: '#0B1020',
  gradientTo: '#16213e',
};

/**
 * Warm editorial theme with amber accents.
 */
export const THEME_WARM_EDITORIAL: StoreTheme = {
  id: 'warm-editorial',
  background: '#F7E8DA',
  foreground: '#2B1D17',
  accent: '#D97706',
  muted: '#7C5A47',
  gradientFrom: '#F7E8DA',
  gradientTo: '#F0DCC8',
};

/**
 * Professional blue theme matching GitNotēs brand.
 */
export const THEME_BRAND_BLUE: StoreTheme = {
  id: 'brand-blue',
  background: '#EFF4FF',
  foreground: '#1E3A5F',
  accent: BRAND_PRIMARY,
  muted: '#5B7CEC',
  gradientFrom: '#EFF4FF',
  gradientTo: '#DBE4FF',
};

// ------------------------------------------------------------------------------------------------
// Theme Registry
// ------------------------------------------------------------------------------------------------

export const STORE_THEMES: Record<string, StoreTheme> = {
  'clean-light': THEME_CLEAN_LIGHT,
  'dark-bold': THEME_DARK_BOLD,
  'warm-editorial': THEME_WARM_EDITORIAL,
  'brand-blue': THEME_BRAND_BLUE,
};

/**
 * Get a theme by ID.
 * Returns clean-light as default for unknown IDs.
 */
export function getTheme(themeId: string): StoreTheme {
  return STORE_THEMES[themeId] ?? THEME_CLEAN_LIGHT;
}

/**
 * Get all available theme IDs.
 */
export function getThemeIds(): string[] {
  return Object.keys(STORE_THEMES);
}

// ------------------------------------------------------------------------------------------------
// Typography Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Font size tokens relative to canvas width.
 * All sizes are fractions of canvas width for resolution independence.
 */
export const FONT_SIZES = {
  /** Category label above headline */
  label: 0.028,
  /** Standard headline */
  headline: 0.09,
  /** Hero headline (larger) */
  heroHeadline: 0.1,
  /** Subtitle text */
  subtitle: 0.035,
  /** Body copy */
  body: 0.03,
  /** Small caption text */
  caption: 0.025,
} as const;

/**
 * Font weight tokens.
 */
export const FONT_WEIGHTS = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

// ------------------------------------------------------------------------------------------------
// Layout Position Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Calculate device frame position for a given layout.
 * Returns { left, bottom, width, rotate } for portrait slides.
 * All values are fractions of canvas dimensions.
 */
export function getPortraitLayout(
  layout: string,
  _canvasWidth: number,
  _canvasHeight: number,
): { left: string; bottom: string; width: string; rotate?: number } {
  switch (layout) {
    case 'hero':
      return {
        left: '50%',
        bottom: '0%',
        width: '82%',
        rotate: undefined,
      };
    case 'feature':
      return {
        left: '5%',
        bottom: '5%',
        width: '55%',
        rotate: undefined,
      };
    case 'contrast':
      return {
        left: '50%',
        bottom: '0%',
        width: '80%',
        rotate: undefined,
      };
    case 'two-device':
      return {
        left: '50%',
        bottom: '0%',
        width: '75%',
        rotate: undefined,
      };
    default:
      return {
        left: '50%',
        bottom: '0%',
        width: '82%',
        rotate: undefined,
      };
  }
}

/**
 * Calculate device frame position for landscape tablet layouts.
 * Returns { top, left, width }.
 */
export function getLandscapeLayout(
  layout: string,
  _canvasWidth: number,
  _canvasHeight: number,
): { top: string; left: string; width: string } {
  switch (layout) {
    case 'landscape-left':
      // Caption on left, device on right
      return {
        top: '50%',
        left: '55%',
        width: '42%',
      };
    case 'landscape-right':
      // Device on left, caption on right
      return {
        top: '50%',
        left: '5%',
        width: '42%',
      };
    default:
      return {
        top: '50%',
        left: '50%',
        width: '40%',
      };
  }
}

/**
 * Calculate caption position for portrait layouts.
 * Returns { left, top } as fractions.
 */
export function getPortraitCaptionPosition(layout: string): {
  left: string;
  top: string;
  width: string;
} {
  switch (layout) {
    case 'hero':
      return { left: '10%', top: '8%', width: '80%' };
    case 'feature':
      return { left: '55%', top: '20%', width: '40%' };
    case 'contrast':
      return { left: '10%', top: '8%', width: '80%' };
    default:
      return { left: '10%', top: '8%', width: '80%' };
  }
}

/**
 * Calculate caption position for landscape layouts.
 * Returns { left, top } as fractions.
 */
export function getLandscapeCaptionPosition(layout: string): {
  left: string;
  top: string;
  width: string;
} {
  switch (layout) {
    case 'landscape-left':
      return { left: '5%', top: '50%', width: '34%' };
    case 'landscape-right':
      return { left: '55%', top: '50%', width: '40%' };
    default:
      return { left: '5%', top: '50%', width: '34%' };
  }
}
