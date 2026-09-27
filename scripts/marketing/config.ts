/**
 * Marketing Asset Pipeline - Configuration Contracts
 *
 * Defines typed device profiles, format specifications, route contracts,
 * output dimensions, safe areas, and validation rules for the marketing
 * asset generation pipeline.
 *
 * References:
 * - Apple screenshot specs: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
 * - Google Play preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
 */

import { z } from 'zod';

// ------------------------------------------------------------------------------------------------
// Device Profile Schema
// ------------------------------------------------------------------------------------------------

/**
 * Supported device profiles for store screenshots.
 * Each profile maps to exact pixel dimensions required by App Store / Google Play.
 */
export const DeviceProfileSchema = z.enum([
  'iphone-6.9-inch', // iPhone 16 Pro Max / 15 Pro Max - 6.9 inch display
  'ipad-13-inch', // iPad Pro 13" (M4)
  'android-phone', // Google Play phone - variable, use 1080x2340 as baseline
  'android-7-inch-tablet', // 7" tablet portrait/landscape
  'android-10-inch-tablet', // 10" tablet portrait/landscape
]);

export type DeviceProfile = z.infer<typeof DeviceProfileSchema>;

// ------------------------------------------------------------------------------------------------
// Format Schema
// ------------------------------------------------------------------------------------------------

/**
 * Supported output image formats for store assets.
 */
export const ImageFormatSchema = z.enum(['png', 'jpeg']);
export type ImageFormat = z.infer<typeof ImageFormatSchema>;

// ------------------------------------------------------------------------------------------------
// Orientation Schema
// ------------------------------------------------------------------------------------------------

export const OrientationSchema = z.enum(['portrait', 'landscape']);
export type Orientation = z.infer<typeof OrientationSchema>;

// ------------------------------------------------------------------------------------------------
// Store Type Schema
// ------------------------------------------------------------------------------------------------

/**
 * Target store for the asset.
 */
export const StoreTypeSchema = z.enum(['apple-app-store', 'google-play']);
export type StoreType = z.infer<typeof StoreTypeSchema>;

// ------------------------------------------------------------------------------------------------
// Route Contract Schema
// ------------------------------------------------------------------------------------------------

/**
 * Supported app routes for marketing capture.
 * Corresponds to deep links in docs/wiki/screens.md.
 */
export const RouteSchema = z.enum([
  'home',
  'notes',
  'note-editor',
  'canvas-editor',
  'todos',
  'explore',
  'chat',
  'chat-thread',
  'settings',
  'graph-view',
]);

export type Route = z.infer<typeof RouteSchema>;

// ------------------------------------------------------------------------------------------------
// Device Dimensions
// ------------------------------------------------------------------------------------------------

/**
 * Exact pixel dimensions per device profile and orientation.
 * Sourced from official Apple and Google Play specifications.
 */
export const DEVICE_DIMENSIONS: Record<
  DeviceProfile,
  Record<'portrait' | 'landscape', { width: number; height: number }>
> = {
  'iphone-6.9-inch': {
    portrait: { width: 1290, height: 2796 }, // 6.9" iPhone Pro Max
    landscape: { width: 2796, height: 1290 },
  },
  'ipad-13-inch': {
    portrait: { width: 2048, height: 2732 }, // iPad Pro 13"
    landscape: { width: 2732, height: 2048 },
  },
  'android-phone': {
    portrait: { width: 1080, height: 2340 }, // Google Play phone baseline
    landscape: { width: 2340, height: 1080 },
  },
  'android-7-inch-tablet': {
    portrait: { width: 1080, height: 1920 }, // 7" tablet
    landscape: { width: 1920, height: 1080 },
  },
  'android-10-inch-tablet': {
    portrait: { width: 1600, height: 2560 }, // 10" tablet
    landscape: { width: 2560, height: 1600 },
  },
};

// ------------------------------------------------------------------------------------------------
// Safe Area Specifications
// ------------------------------------------------------------------------------------------------

/**
 * Safe area insets (in pixels) for text placement.
 * Prevents captions from being cut off by device UI elements.
 */
export const SAFE_AREAS: Record<
  DeviceProfile,
  { top: number; bottom: number; left: number; right: number }
> = {
  'iphone-6.9-inch': { top: 63, bottom: 51, left: 0, right: 0 },
  'ipad-13-inch': { top: 0, bottom: 0, left: 0, right: 0 },
  'android-phone': { top: 0, bottom: 0, left: 0, right: 0 },
  'android-7-inch-tablet': { top: 0, bottom: 0, left: 0, right: 0 },
  'android-10-inch-tablet': { top: 0, bottom: 0, left: 0, right: 0 },
};

// ------------------------------------------------------------------------------------------------
// Format Options
// ------------------------------------------------------------------------------------------------

export const FORMAT_OPTIONS: Record<ImageFormat, { quality: number; extension: string }> = {
  png: { quality: 100, extension: 'png' },
  jpeg: { quality: 90, extension: 'jpg' },
};

// ------------------------------------------------------------------------------------------------
// English Slide Copy
// ------------------------------------------------------------------------------------------------

/**
 * English marketing copy templates for slides.
 * Placeholders: {{appName}}, {{tagline}}
 */
export interface SlideCopy {
  title: string;
  subtitle?: string;
  body?: string;
}

export const SLIDE_COPY: Record<string, SlideCopy> = {
  hero: {
    title: 'GitNotēs',
    subtitle: 'Notes, Todos & Git',
    body: 'Your data lives as plain Markdown — yours to read, edit, and version anywhere.',
  },
  notes: {
    title: 'Capture Every Idea',
    body: 'Notes, journals, and canvases — all backed by a Git repo.',
  },
  sync: {
    title: 'Works Offline',
    body: "Edits queue locally and sync when you're back online.",
  },
  ai: {
    title: 'AI-Powered',
    body: 'Chat with context from your notes or repo.',
  },
  multiplatform: {
    title: 'iOS & Android',
    body: 'Free and open source. No lock-in.',
  },
};

// ------------------------------------------------------------------------------------------------
// Output Root Configuration
// ------------------------------------------------------------------------------------------------

/**
 * Output directory root for generated marketing assets.
 * All paths are rooted under assets/marketing/ to prevent traversal.
 */
export const OUTPUT_ROOT = 'assets/marketing';

/**
 * Subdirectories for different asset types.
 */
export const OUTPUT_DIRS = {
  runs: `${OUTPUT_ROOT}/runs`, // Per-run working output (ignored)
  exports: `${OUTPUT_ROOT}/exports`, // Final export artifacts (ignored)
  captures: `${OUTPUT_ROOT}/captures`, // Raw simulator captures (ignored)
  store: `${OUTPUT_ROOT}/store`, // Store-ready compositions
  social: `${OUTPUT_ROOT}/social`, // Social media exports
} as const;

/**
 * Filename pattern for store assets.
 * Pattern: {device}-{route}-{orientation}-{index}.{format}
 */
export function buildStoreFilename(
  device: DeviceProfile,
  route: Route,
  orientation: Orientation,
  format: ImageFormat,
  index: number = 1,
): string {
  return `${device}-${route}-${orientation}-${String(index).padStart(2, '0')}.${FORMAT_OPTIONS[format].extension}`;
}

// ------------------------------------------------------------------------------------------------
// Overwrite Policy
// ------------------------------------------------------------------------------------------------

export const OVERWRITE_POLICY = {
  /**
   * If true, existing files are overwritten silently.
   * If false, existing files cause a validation error.
   */
  allow: false,

  /**
   * Backup existing files before overwrite (when allow=true).
   */
  backup: true,
} as const;

// ------------------------------------------------------------------------------------------------
// Tool Version Tracking
// ------------------------------------------------------------------------------------------------

export interface ToolVersion {
  name: string;
  version: string;
  path?: string;
}

/**
 * Known tool versions for manifest metadata.
 */
export const KNOWN_TOOLS: Record<string, string> = {
  xcrun: 'simctl',
  adb: 'android-debug-bridge',
  ffmpeg: 'ffmpeg',
  ffprobe: 'ffprobe',
  sharp: 'sharp',
  playwright: 'playwright',
} as const;

// ------------------------------------------------------------------------------------------------
// Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate that a device profile exists.
 */
export function validateDeviceProfile(profile: string): profile is DeviceProfile {
  return DeviceProfileSchema.safeParse(profile).success;
}

/**
 * Validate that a route string is a known route.
 */
export function validateRoute(route: string): route is Route {
  return RouteSchema.safeParse(route).success;
}

/**
 * Validate output path stays within assets/marketing/.
 * Rejects absolute paths and traversal attempts.
 */
export function validateOutputPath(outputPath: string): boolean {
  const normalized = outputPath.replace(/\\/g, '/');
  // Reject absolute paths
  if (normalized.startsWith('/')) return false;
  // Reject traversal above assets/marketing
  if (normalized.includes('..')) return false;
  // Must start with assets/marketing
  if (!normalized.startsWith(OUTPUT_ROOT)) return false;
  return true;
}

/**
 * Full configuration object for a marketing asset run.
 */
export interface MarketingConfig {
  device: DeviceProfile;
  route: Route;
  orientation: Orientation;
  format: ImageFormat;
  store: StoreType;
  locale: string;
  outputDir: string;
  overwrite: boolean;
  copy: SlideCopy;
}

export const DEFAULT_CONFIG: Omit<MarketingConfig, 'device' | 'route' | 'orientation'> = {
  format: 'png',
  store: 'apple-app-store',
  locale: 'en',
  outputDir: OUTPUT_DIRS.store,
  overwrite: OVERWRITE_POLICY.allow,
  copy: SLIDE_COPY['hero'],
};

// ------------------------------------------------------------------------------------------------
// Config Builder
// ------------------------------------------------------------------------------------------------

/**
 * Build a full MarketingConfig from partial input with validation.
 * Throws ZodError for invalid inputs.
 */
export function buildMarketingConfig(
  partial: Partial<MarketingConfig> & { device: string; route: string; orientation: string },
): MarketingConfig {
  const device = DeviceProfileSchema.parse(partial.device);
  const route = RouteSchema.parse(partial.route);
  const orientation = OrientationSchema.parse(partial.orientation);
  const format = partial.format ?? DEFAULT_CONFIG.format;
  const store = partial.store ?? DEFAULT_CONFIG.store;
  const locale = partial.locale ?? DEFAULT_CONFIG.locale;
  const outputDir = partial.outputDir ?? DEFAULT_CONFIG.outputDir;
  const overwrite = partial.overwrite ?? DEFAULT_CONFIG.overwrite;
  const copyKey =
    typeof partial.copy === 'string'
      ? partial.copy
      : route === 'home'
        ? 'hero'
        : route === 'notes'
          ? 'notes'
          : route === 'note-editor'
            ? 'notes'
            : route === 'canvas-editor'
              ? 'notes'
              : route === 'todos'
                ? 'notes'
                : route === 'explore'
                  ? 'sync'
                  : route === 'chat'
                    ? 'ai'
                    : 'hero';
  const copy = SLIDE_COPY[copyKey as keyof typeof SLIDE_COPY] ?? SLIDE_COPY['hero'];

  const formatParsed = ImageFormatSchema.parse(format);
  const storeParsed = StoreTypeSchema.parse(store);

  // Validate output path doesn't escape
  if (!validateOutputPath(outputDir)) {
    throw new Error(`Output path "${outputDir}" escapes assets/marketing/ root`);
  }

  return {
    device,
    route,
    orientation,
    format: formatParsed,
    store: storeParsed,
    locale,
    outputDir,
    overwrite,
    copy,
  };
}

/**
 * Get dimensions for a device profile and orientation.
 */
export function getDimensions(
  device: DeviceProfile,
  orientation: Orientation,
): { width: number; height: number } {
  return DEVICE_DIMENSIONS[device][orientation];
}

/**
 * Get safe area for a device profile.
 */
export function getSafeArea(device: DeviceProfile): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  return SAFE_AREAS[device];
}
