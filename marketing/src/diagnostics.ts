/**
 * Marketing Composition Package - Diagnostics
 *
 * Visible diagnostics for missing images, missing Chromium, and unsupported slide configs.
 * Implements the non-zero failure requirement for CI/CD pipelines.
 */

import type { Diagnostics, SocialSlide } from './types';

// ------------------------------------------------------------------------------------------------
// Chromium Detection
// ------------------------------------------------------------------------------------------------

/**
 * Detect if Chromium is available via Playwright.
 * Returns the version string if found, null otherwise.
 */
export async function detectChromium(): Promise<{ available: boolean; version: string | null }> {
  try {
    const { execSync } = await import('child_process');
    const result = execSync('npx playwright --version', { encoding: 'utf8', timeout: 10000 });
    const version = result.trim();
    return { available: true, version };
  } catch {
    return { available: false, version: null };
  }
}

// ------------------------------------------------------------------------------------------------
// Image Existence Validation
// ------------------------------------------------------------------------------------------------

/**
 * Check if an image URL/path is accessible.
 * For relative paths, treats as unavailable (standalone package has no asset server).
 * For absolute URLs/data URLs, returns true.
 */
export function isImageAccessible(url: string): boolean {
  // Data URLs are always accessible
  if (url.startsWith('data:')) return true;
  // Absolute URLs (http/https) are considered accessible
  if (url.startsWith('http://') || url.startsWith('https://')) return true;
  // Relative paths are not accessible in standalone package context
  return false;
}

// ------------------------------------------------------------------------------------------------
// Slide Configuration Validation
// ------------------------------------------------------------------------------------------------

const SUPPORTED_LAYOUTS = ['hero', 'feature', 'contrast', 'landscape-left', 'landscape-right', 'two-device'] as const;
const SUPPORTED_ORIENTATIONS = ['portrait', 'landscape'] as const;
const SUPPORTED_DEVICES = ['iphone-6.9-inch', 'ipad-13-inch', 'android-phone', 'android-7-inch-tablet', 'android-10-inch-tablet'] as const;

/**
 * Validate a slide configuration and report unsupported items.
 */
export function validateSlideConfig(slide: SocialSlide): string[] {
  const errors: string[] = [];

  if (!SUPPORTED_LAYOUTS.includes(slide.layout as typeof SUPPORTED_LAYOUTS[number])) {
    errors.push(`Slide "${slide.id}": unsupported layout "${slide.layout}". Supported: ${SUPPORTED_LAYOUTS.join(', ')}`);
  }

  if (!SUPPORTED_ORIENTATIONS.includes(slide.orientation as typeof SUPPORTED_ORIENTATIONS[number])) {
    errors.push(`Slide "${slide.id}": unsupported orientation "${slide.orientation}". Supported: ${SUPPORTED_ORIENTATIONS.join(', ')}`);
  }

  if (!SUPPORTED_DEVICES.includes(slide.device as typeof SUPPORTED_DEVICES[number])) {
    errors.push(`Slide "${slide.id}": unsupported device "${slide.device}". Supported: ${SUPPORTED_DEVICES.join(', ')}`);
  }

  if (!slide.headline || slide.headline.trim().length === 0) {
    errors.push(`Slide "${slide.id}": missing required headline`);
  }

  if (slide.index < 1) {
    errors.push(`Slide "${slide.id}": index must be >= 1, got ${slide.index}`);
  }

  return errors;
}

// ------------------------------------------------------------------------------------------------
// Full Diagnostics Run
// ------------------------------------------------------------------------------------------------

/**
 * Run comprehensive diagnostics on a slide configuration.
 */
export async function runDiagnostics(slides: SocialSlide[]): Promise<Diagnostics> {
  const diagnostics: Diagnostics = {
    chromiumAvailable: false,
    imagesLoaded: true,
    missingImages: [],
    unsupportedConfigs: [],
    healthy: true,
    errors: [],
    warnings: [],
  };

  // Check Chromium availability
  const chromiumCheck = await detectChromium();
  diagnostics.chromiumAvailable = chromiumCheck.available;
  if (!chromiumCheck.available) {
    diagnostics.errors.push('Chromium not available. Run: npx playwright install chromium');
    diagnostics.healthy = false;
  }

  // Validate each slide
  for (const slide of slides) {
    // Check image accessibility
    if (!isImageAccessible(slide.sourcePath)) {
      // For the standalone package, warn about relative paths (expected in dev)
      if (!slide.sourcePath.startsWith('data:') && !slide.sourcePath.startsWith('http')) {
        diagnostics.warnings.push(
          `Slide "${slide.id}": relative sourcePath "${slide.sourcePath}" will not load without an asset server. Use absolute URLs or data URIs in production.`
        );
      } else {
        diagnostics.missingImages.push(slide.sourcePath);
        diagnostics.imagesLoaded = false;
        diagnostics.errors.push(`Slide "${slide.id}": image not accessible at "${slide.sourcePath}"`);
        diagnostics.healthy = false;
      }
    }

    // Validate slide config
    const configErrors = validateSlideConfig(slide);
    if (configErrors.length > 0) {
      diagnostics.unsupportedConfigs.push(...configErrors);
      diagnostics.errors.push(...configErrors);
      diagnostics.healthy = false;
    }
  }

  // Check for duplicate slide IDs
  const ids = slides.map((s) => s.id);
  const uniqueIds = new Set(ids);
  if (ids.length !== uniqueIds.size) {
    diagnostics.errors.push('Duplicate slide IDs detected');
    diagnostics.healthy = false;
  }

  // Warn if no slides defined
  if (slides.length === 0) {
    diagnostics.warnings.push('No slides defined');
  }

  return diagnostics;
}

// ------------------------------------------------------------------------------------------------
// Diagnostic Rendering
// ------------------------------------------------------------------------------------------------

/**
 * Render diagnostics as a visible overlay string for debugging.
 */
export function renderDiagnosticsOverlay(diagnostics: Diagnostics): string {
  const lines: string[] = ['[DIAGNOSTICS]'];
  lines.push(`Chromium: ${diagnostics.chromiumAvailable ? '✓ available' : '✗ missing'}`);
  lines.push(`Images: ${diagnostics.imagesLoaded ? '✓ all loaded' : '✗ some missing'}`);

  if (diagnostics.missingImages.length > 0) {
    lines.push(`Missing: ${diagnostics.missingImages.join(', ')}`);
  }

  if (diagnostics.unsupportedConfigs.length > 0) {
    lines.push(`Config errors: ${diagnostics.unsupportedConfigs.length}`);
    diagnostics.unsupportedConfigs.forEach((c) => lines.push(`  - ${c}`));
  }

  lines.push(`Status: ${diagnostics.healthy ? '✓ healthy' : '✗ UNHEALTHY'}`);

  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------
// Exit Code Mapping
// ------------------------------------------------------------------------------------------------

/**
 * Map diagnostics to a POSIX exit code.
 * 0 = healthy, non-zero = failure.
 */
export function diagnosticsToExitCode(diagnostics: Diagnostics): number {
  if (diagnostics.healthy) return 0;
  if (!diagnostics.chromiumAvailable) return 10;
  if (!diagnostics.imagesLoaded) return 11;
  if (diagnostics.unsupportedConfigs.length > 0) return 12;
  return 1;
}
