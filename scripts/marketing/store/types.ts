/**
 * Marketing Asset Pipeline - Store Composition Types
 *
 * Typed contracts for composing store-ready screenshots from source captures.
 * Consumes DEVICE_DIMENSIONS and SAFE_AREAS from ../config.
 *
 * References:
 * - Apple screenshot specs: https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/
 * - Google Play preview assets: https://support.google.com/googleplay/android-developer/answer/9866151
 * - scripts/marketing/config.ts: DEVICE_DIMENSIONS, SAFE_AREAS, OUTPUT_DIRS, SLIDE_COPY
 */

import type { DeviceProfile, Orientation, ImageFormat, StoreType } from '../config';
import { DEVICE_DIMENSIONS, SAFE_AREAS } from '../config';

// ------------------------------------------------------------------------------------------------
// Slide Layout Variants
// ------------------------------------------------------------------------------------------------

/**
 * Slide layout types for visual variety.
 * Each layout positions the device frame and caption differently.
 */
export type SlideLayout =
  | 'hero' // Centered device, large headline above
  | 'feature' // Left-aligned device, caption right
  | 'contrast' // Inverted background (dark bg, light text)
  | 'landscape-left' // Caption left, device right (tablet landscape)
  | 'landscape-right' // Device left, caption right
  | 'two-device'; // Two devices stacked/layered

// ------------------------------------------------------------------------------------------------
// Slide Definition
// ------------------------------------------------------------------------------------------------

/**
 * A single store slide definition.
 */
export interface Slide {
  /** Unique slide identifier */
  id: string;
  /** Layout variant */
  layout: SlideLayout;
  /** Device profile for dimensions */
  device: DeviceProfile;
  /** Orientation */
  orientation: Orientation;
  /** Source capture path to embed */
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
// Theme
// ------------------------------------------------------------------------------------------------

/**
 * Theme tokens for store slide composition.
 * Derived from GitNotēs brand colors.
 */
export interface StoreTheme {
  id: string;
  /** Background color */
  background: string;
  /** Primary text color */
  foreground: string;
  /** Accent color (brand primary) */
  accent: string;
  /** Secondary/muted text */
  muted: string;
  /** Gradient start (optional) */
  gradientFrom?: string;
  /** Gradient end (optional) */
  gradientTo?: string;
}

// ------------------------------------------------------------------------------------------------
// Validation Result
// ------------------------------------------------------------------------------------------------

/**
 * Result of validating a composed image.
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Detailed image metadata from validation.
 */
export interface ImageMetadata {
  width: number;
  height: number;
  format: string;
  channels: number;
  hasAlpha: boolean;
  sizeBytes: number;
  checksum: string;
}

// ------------------------------------------------------------------------------------------------
// Composition Request
// ------------------------------------------------------------------------------------------------

/**
 * Request to compose a single store slide.
 */
export interface ComposeSlideRequest {
  slide: Slide;
  theme: StoreTheme;
  outputPath: string;
  format: ImageFormat;
  /** Source capture absolute path */
  sourceCapturePath: string;
  /** App icon path for hero slides */
  iconPath?: string;
  /** Logo path for feature graphic */
  logoPath?: string;
}

// ------------------------------------------------------------------------------------------------
// Feature Graphic
// ------------------------------------------------------------------------------------------------

/**
 * Feature graphic request for Google Play.
 * 1024x500 landscape banner.
 */
export interface FeatureGraphicRequest {
  outputPath: string;
  theme: StoreTheme;
  iconPath?: string;
  logoPath?: string;
  /** App tagline */
  tagline?: string;
}

// ------------------------------------------------------------------------------------------------
// Export Request
// ------------------------------------------------------------------------------------------------

/**
 * Full export request for a store.
 */
export interface ExportRequest {
  /** Store type */
  store: StoreType;
  /** Slides to compose and export */
  slides: Slide[];
  /** Theme to apply */
  theme: StoreTheme;
  /** Output directory */
  outputDir: string;
  /** Format for exports */
  format: ImageFormat;
  /** Source captures base directory */
  sourceCapturesDir: string;
  /** App icon path */
  iconPath?: string;
  /** Logo path */
  logoPath?: string;
  /** Whether to overwrite existing files */
  overwrite?: boolean;
}

// ------------------------------------------------------------------------------------------------
// Export Result
// ------------------------------------------------------------------------------------------------

/**
 * Result of exporting a store run.
 */
export interface ExportResult {
  success: boolean;
  runId: string;
  /** Paths to all exported files */
  artifacts: string[];
  /** Validation results per artifact */
  validations: Record<string, ValidationResult>;
  /** Errors if failed */
  errors: string[];
  /** SHA-256 checksums of exported files */
  checksums: Record<string, string>;
}

// ------------------------------------------------------------------------------------------------
// Layout Dimensions Helper
// ------------------------------------------------------------------------------------------------

/**
 * Get canvas dimensions for a device profile and orientation.
 * Aliases getDimensions from config for use within store module.
 */
export function getCanvasDimensions(
  device: DeviceProfile,
  orientation: Orientation,
): { width: number; height: number } {
  return DEVICE_DIMENSIONS[device][orientation];
}

/**
 * Get safe area for text placement.
 */
export function getCanvasSafeArea(device: DeviceProfile): {
  top: number;
  bottom: number;
  left: number;
  right: number;
} {
  return SAFE_AREAS[device];
}

// ------------------------------------------------------------------------------------------------
// Slide Builder Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Build a slide ID from components.
 */
export function buildSlideId(
  device: DeviceProfile,
  route: string,
  orientation: Orientation,
  index: number,
): string {
  return `${device}-${route}-${orientation}-${String(index).padStart(2, '0')}`;
}

// ------------------------------------------------------------------------------------------------
// Validation Error Codes
// ------------------------------------------------------------------------------------------------

export const VALIDATION_ERRORS = {
  DIMENSION_MISMATCH: 'DIMENSION_MISMATCH',
  ALPHA_CHANNEL: 'ALPHA_CHANNEL',
  CHECKSUM_MISMATCH: 'CHECKSUM_MISMATCH',
  DECODE_FAILED: 'DECODE_FAILED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  ASPECT_RATIO: 'ASPECT_RATIO',
  MISSING_SOURCE: 'MISSING_SOURCE',
  INVALID_FORMAT: 'INVALID_FORMAT',
  PATH_ESCAPE: 'PATH_ESCAPE',
} as const;

export type ValidationErrorCode = (typeof VALIDATION_ERRORS)[keyof typeof VALIDATION_ERRORS];
