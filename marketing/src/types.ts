/**
 * Marketing Composition Package - Shared Types
 *
 * Consumes store slide/manifest contracts from the parent scripts/marketing/store/ directory.
 * These types extend the Todo 4 contracts with social story-specific concerns.
 *
 * IMPORTANT: These types intentionally DUPLICATE the structure from scripts/marketing/store/types.ts
 * to keep the marketing compositing package truly standalone (no shared node_modules with the Expo app).
 * The source of truth remains scripts/marketing/store/types.ts.
 */

// ------------------------------------------------------------------------------------------------
// Device Profile (from scripts/marketing/config.ts)
// ------------------------------------------------------------------------------------------------

export const DEVICE_DIMENSIONS: Record<
  DeviceProfile,
  Record<'portrait' | 'landscape', { width: number; height: number }>
> = {
  'iphone-6.9-inch': {
    portrait: { width: 1290, height: 2796 },
    landscape: { width: 2796, height: 1290 },
  },
  'ipad-13-inch': {
    portrait: { width: 2048, height: 2732 },
    landscape: { width: 2732, height: 2048 },
  },
  'android-phone': {
    portrait: { width: 1080, height: 2340 },
    landscape: { width: 2340, height: 1080 },
  },
  'android-7-inch-tablet': {
    portrait: { width: 1080, height: 1920 },
    landscape: { width: 1920, height: 1080 },
  },
  'android-10-inch-tablet': {
    portrait: { width: 1600, height: 2560 },
    landscape: { width: 2560, height: 1600 },
  },
};

export const DeviceProfileSchema = ['iphone-6.9-inch', 'ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'] as const;
export type DeviceProfile = typeof DeviceProfileSchema[number];

// ------------------------------------------------------------------------------------------------
// Theme (from scripts/marketing/store/themes.ts)
// ------------------------------------------------------------------------------------------------

export interface StoreTheme {
  id: string;
  background: string;
  foreground: string;
  accent: string;
  muted: string;
  gradientFrom?: string;
  gradientTo?: string;
}

export const THEME_CLEAN_LIGHT: StoreTheme = {
  id: 'clean-light',
  background: '#F6F1EA',
  foreground: '#171717',
  accent: '#5B7CEC',
  muted: '#6B7280',
  gradientFrom: '#F6F1EA',
  gradientTo: '#E8E4DD',
};

export const THEME_DARK_BOLD: StoreTheme = {
  id: 'dark-bold',
  background: '#0B1020',
  foreground: '#F8FAFC',
  accent: '#8B5CF6',
  muted: '#94A3B8',
  gradientFrom: '#0B1020',
  gradientTo: '#16213e',
};

// ------------------------------------------------------------------------------------------------
// Slide Layout Variants (from scripts/marketing/store/types.ts)
// ------------------------------------------------------------------------------------------------

export type SlideLayout =
  | 'hero'
  | 'feature'
  | 'contrast'
  | 'landscape-left'
  | 'landscape-right'
  | 'two-device';

// ------------------------------------------------------------------------------------------------
// Social Story Slide
// ------------------------------------------------------------------------------------------------

export interface SocialSlide {
  /** Unique slide identifier */
  id: string;
  /** Layout variant */
  layout: SlideLayout;
  /** Device profile for dimensions */
  device: DeviceProfile;
  /** Orientation */
  orientation: 'portrait' | 'landscape';
  /** Source capture path (absolute URL or relative path) */
  sourcePath: string;
  /** Headline copy */
  headline: string;
  /** Optional subtitle copy */
  subtitle?: string;
  /** Optional body copy */
  body?: string;
  /** Slide index for ordering (1-based) */
  index: number;
}

// ------------------------------------------------------------------------------------------------
// Social Story Composition Contract
// ------------------------------------------------------------------------------------------------

export interface StorySlideConfig {
  /** Total story duration in milliseconds */
  duration: number;
  /** Per-slide duration in milliseconds (overrides total duration) */
  slideDuration?: number;
  /** Easing function name */
  easing?: string;
  /** Theme to apply */
  theme: StoreTheme;
  /** Slides in order */
  slides: SocialSlide[];
  /** Output width */
  width: number;
  /** Output height */
  height: number;
}

// ------------------------------------------------------------------------------------------------
// Checkpoint Contract
// ------------------------------------------------------------------------------------------------

export interface Checkpoint {
  /** Checkpoint identifier */
  id: string;
  /** Time in milliseconds */
  time: number;
  /** Expected slide index visible at this checkpoint */
  expectedSlideIndex: number;
  /** Expected frame hash (SHA-256 hex of rendered PNG) */
  expectedHash?: string;
}

export interface CheckpointResult {
  checkpoint: Checkpoint;
  /** Actual slide index at this checkpoint */
  actualSlideIndex: number;
  /** Actual frame hash */
  actualHash: string;
  /** Whether the checkpoint passed */
  passed: boolean;
  /** Time taken to render this checkpoint */
  renderTimeMs: number;
}

// ------------------------------------------------------------------------------------------------
// Image Loading State
// ------------------------------------------------------------------------------------------------

export interface ImageLoadState {
  url: string;
  loaded: boolean;
  error: string | null;
  width: number;
  height: number;
}

// ------------------------------------------------------------------------------------------------
// Diagnostics
// ------------------------------------------------------------------------------------------------

export interface Diagnostics {
  /** Whether Chromium/Playwright is available */
  chromiumAvailable: boolean;
  /** Whether all images loaded successfully */
  imagesLoaded: boolean;
  /** Missing image URLs */
  missingImages: string[];
  /** Unsupported slide configurations */
  unsupportedConfigs: string[];
  /** Overall health status */
  healthy: boolean;
  /** Error messages */
  errors: string[];
  /** Warning messages */
  warnings: string[];
}

// ------------------------------------------------------------------------------------------------
// Preload Result
// ------------------------------------------------------------------------------------------------

export interface PreloadResult {
  /** All images that were preloaded */
  images: ImageLoadState[];
  /** Whether all images loaded successfully */
  allLoaded: boolean;
  /** Time taken to preload all images */
  preloadTimeMs: number;
}

// ------------------------------------------------------------------------------------------------
// Render Result
// ------------------------------------------------------------------------------------------------

export interface RenderResult {
  /** Base64-encoded PNG data URL */
  dataUrl: string;
  /** SHA-256 hash of the PNG bytes */
  hash: string;
  /** Width of rendered frame */
  width: number;
  /** Height of rendered frame */
  height: number;
  /** Time taken to render */
  renderTimeMs: number;
}

// ------------------------------------------------------------------------------------------------
// Export
// ------------------------------------------------------------------------------------------------

export interface ExportResult {
  /** Whether export succeeded */
  success: boolean;
  /** Output path if saved */
  outputPath?: string;
  /** Hash of the output file */
  hash?: string;
  /** Errors if failed */
  errors: string[];
  /** Checkpoint results */
  checkpointResults: CheckpointResult[];
}
