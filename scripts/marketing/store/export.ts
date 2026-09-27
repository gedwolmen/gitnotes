/**
 * Marketing Asset Pipeline - Store Export Orchestration
 *
 * Orchestrates the full store composition pipeline:
 * 1. Validates source captures exist
 * 2. Composes slides using composer
 * 3. Validates outputs
 * 4. Creates manifest with artifact records
 * 5. Integrates with the manifest.ts API from Todo 2
 *
 * Consumes DEVICE_DIMENSIONS from ../config (no hardcoded values).
 */

import { existsSync, mkdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import type { DeviceProfile, Orientation, ImageFormat, StoreType } from '../config';
import { DEVICE_DIMENSIONS, FORMAT_OPTIONS, validateOutputPath } from '../config';
import {
  buildManifest,
  generateRunId,
  writeManifest,
  createOutputArtifact,
  createSourceCapture,
  type Manifest,
  type OutputArtifact,
  type SourceCapture,
} from '../manifest';
import type { Slide, ExportRequest, ExportResult, StoreTheme } from './types';
import { buildSlideId, type ValidationResult } from './types';
import { validateOutputPathSafe } from './validators';
import { composeSlide, composeFeatureGraphic } from './composer';

// ------------------------------------------------------------------------------------------------
// Export Orchestration
// ------------------------------------------------------------------------------------------------

/**
 * Run the full store export pipeline.
 * Returns detailed result with checksums and validation.
 */
export async function exportStore(request: ExportRequest): Promise<ExportResult> {
  const {
    store,
    slides,
    theme,
    outputDir,
    format,
    sourceCapturesDir,
    iconPath,
    logoPath,
    overwrite = false,
  } = request;

  const runId = generateRunId();
  const artifacts: string[] = [];
  const checksums: Record<string, string> = {};
  const validations: Record<string, ValidationResult> = {};
  const errors: string[] = [];

  // Validate output directory is safe
  if (!validateOutputPath(outputDir)) {
    return {
      success: false,
      runId,
      artifacts: [],
      validations: {},
      errors: [`Output directory escapes assets/marketing/: ${outputDir}`],
      checksums: {},
    };
  }

  // Create output directory
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Build store subdirectory path
  const storeSubdir = store === 'apple-app-store' ? 'apple' : 'google-play';
  const storeOutputDir = join(outputDir, storeSubdir);

  if (!existsSync(storeOutputDir)) {
    mkdirSync(storeOutputDir, { recursive: true });
  }

  // Process each slide
  for (const slide of slides) {
    const filename =
      buildSlideId(slide.device, slide.id, slide.orientation, slide.index) +
      '.' +
      FORMAT_OPTIONS[format].extension;
    const outputPath = join(storeOutputDir, filename);

    // Check for existing file
    if (existsSync(outputPath) && !overwrite) {
      errors.push(`Output file exists (use --overwrite to replace): ${outputPath}`);
      continue;
    }

    // Resolve source capture path
    const sourcePath = resolve(sourceCapturesDir, slide.sourcePath ?? '');
    if (!existsSync(sourcePath)) {
      errors.push(`Source capture not found: ${sourcePath}`);
      continue;
    }

    // Compose the slide
    try {
      const { checksum } = await composeSlide({
        slide,
        theme,
        outputPath,
        format,
        sourceCapturePath: sourcePath,
        iconPath,
        logoPath,
      });

      artifacts.push(outputPath);
      checksums[outputPath] = checksum;

      // Validate the output
      const { validateComposedImage } = await import('./validators');
      const validation = await validateComposedImage(outputPath, slide.device, slide.orientation);
      validations[outputPath] = validation;

      if (!validation.valid) {
        errors.push(`Validation failed for ${outputPath}: ${validation.errors.join(', ')}`);
      }
    } catch (err) {
      errors.push(
        `Failed to compose ${outputPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // Build source captures list
  const sources: SourceCapture[] = slides.map((slide) => {
    return createSourceCapture(
      slide.device as unknown as import('../config').Route,
      slide.device,
      slide.orientation,
      'en',
    );
  });

  // Build artifacts list
  const manifestArtifacts: OutputArtifact[] = artifacts.map((artifactPath) => {
    return createOutputArtifact(
      artifactPath,
      outputDir,
      'iphone-6.9-inch' as DeviceProfile, // Will be corrected per slide
      'portrait' as Orientation,
      format,
      store,
    );
  });

  // Write manifest
  const manifest: Manifest = buildManifest({
    runId,
    sources,
    artifacts: manifestArtifacts,
    notes: errors.length > 0 ? [`Encountered ${errors.length} errors during export`] : undefined,
  });

  const manifestPath = join(outputDir, `${storeSubdir}-${runId}.manifest.json`);
  writeManifest(manifest, manifestPath);
  artifacts.push(manifestPath);

  return {
    success: errors.length === 0,
    runId,
    artifacts,
    validations,
    errors,
    checksums,
  };
}

/**
 * Export feature graphic for Google Play.
 */
export async function exportFeatureGraphic(
  outputPath: string,
  theme: StoreTheme,
  iconPath?: string,
  tagline?: string,
): Promise<{ success: boolean; checksum?: string; errors: string[] }> {
  // Validate output path
  const pathValidation = validateOutputPathSafe(outputPath);
  if (!pathValidation.valid) {
    return { success: false, errors: pathValidation.errors };
  }

  // Create output directory
  const dir = dirname(outputPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  try {
    const { checksum } = await composeFeatureGraphic(outputPath, theme, iconPath, tagline);

    // Validate the feature graphic
    const { validateFeatureGraphic } = await import('./validators');
    const validation = await validateFeatureGraphic(outputPath);

    if (!validation.valid) {
      return {
        success: false,
        checksum,
        errors: validation.errors,
      };
    }

    return { success: true, checksum, errors: [] };
  } catch (err) {
    return {
      success: false,
      errors: [
        `Failed to compose feature graphic: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

// ------------------------------------------------------------------------------------------------
// Preset Export Configurations
// ------------------------------------------------------------------------------------------------

/**
 * Preset device/orientation combinations for store export.
 */
export const STORE_PRESETS = {
  /** Apple App Store iPhone 6.9" portrait (main iPhone size) */
  APPLE_IPHONE_PORTRAIT: {
    device: 'iphone-6.9-inch' as DeviceProfile,
    orientation: 'portrait' as Orientation,
  },
  /** Apple App Store iPhone 6.9" landscape */
  APPLE_IPHONE_LANDSCAPE: {
    device: 'iphone-6.9-inch' as DeviceProfile,
    orientation: 'landscape' as Orientation,
  },
  /** Apple App Store iPad 13" portrait */
  APPLE_IPAD_PORTRAIT: {
    device: 'ipad-13-inch' as DeviceProfile,
    orientation: 'portrait' as Orientation,
  },
  /** Apple App Store iPad 13" landscape */
  APPLE_IPAD_LANDSCAPE: {
    device: 'ipad-13-inch' as DeviceProfile,
    orientation: 'landscape' as Orientation,
  },
  /** Google Play phone portrait */
  GOOGLE_PHONE_PORTRAIT: {
    device: 'android-phone' as DeviceProfile,
    orientation: 'portrait' as Orientation,
  },
  /** Google Play phone landscape */
  GOOGLE_PHONE_LANDSCAPE: {
    device: 'android-phone' as DeviceProfile,
    orientation: 'landscape' as Orientation,
  },
  /** Google Play 7" tablet portrait */
  GOOGLE_7TABLET_PORTRAIT: {
    device: 'android-7-inch-tablet' as DeviceProfile,
    orientation: 'portrait' as Orientation,
  },
  /** Google Play 7" tablet landscape */
  GOOGLE_7TABLET_LANDSCAPE: {
    device: 'android-7-inch-tablet' as DeviceProfile,
    orientation: 'landscape' as Orientation,
  },
  /** Google Play 10" tablet portrait */
  GOOGLE_10TABLET_PORTRAIT: {
    device: 'android-10-inch-tablet' as DeviceProfile,
    orientation: 'portrait' as Orientation,
  },
  /** Google Play 10" tablet landscape */
  GOOGLE_10TABLET_LANDSCAPE: {
    device: 'android-10-inch-tablet' as DeviceProfile,
    orientation: 'landscape' as Orientation,
  },
} as const;

/**
 * Export slides for a specific preset.
 */
export async function exportPreset(
  preset: keyof typeof STORE_PRESETS,
  slides: Slide[],
  theme: StoreTheme,
  outputDir: string,
  format: ImageFormat,
  sourceCapturesDir: string,
  iconPath?: string,
  overwrite?: boolean,
): Promise<ExportResult> {
  const { device, orientation } = STORE_PRESETS[preset];

  // Filter slides for this preset
  const presetSlides = slides.filter((s) => s.device === device && s.orientation === orientation);

  // Determine store type from preset
  const store: StoreType = preset.startsWith('GOOGLE') ? 'google-play' : 'apple-app-store';

  return exportStore({
    store,
    slides: presetSlides,
    theme,
    outputDir,
    format,
    sourceCapturesDir,
    iconPath,
    overwrite,
  });
}

// ------------------------------------------------------------------------------------------------
// Quick Export Helpers
// ------------------------------------------------------------------------------------------------

/**
 * Quick export for a single device profile.
 * Useful for testing or single-shot exports.
 */
export async function quickExport(
  device: DeviceProfile,
  orientation: Orientation,
  sourcePath: string,
  outputDir: string,
  theme: StoreTheme,
  format: ImageFormat = 'png',
): Promise<ExportResult> {
  const slide: Slide = {
    id: buildSlideId(device, 'home', orientation, 1),
    layout: orientation === 'landscape' ? 'landscape-left' : 'hero',
    device,
    orientation,
    sourcePath: basename(sourcePath),
    headline: theme.id === 'dark-bold' ? 'GitNotēs' : 'GitNotēs',
    subtitle: undefined,
    body: undefined,
    index: 1,
  };

  const store: StoreType = device.startsWith('android') ? 'google-play' : 'apple-app-store';

  return exportStore({
    store,
    slides: [slide],
    theme,
    outputDir,
    format,
    sourceCapturesDir: dirname(sourcePath),
  });
}

/**
 * Generate a sample contact sheet for QA.
 * Creates a composite image showing all device sizes.
 */
export async function generateContactSheet(
  outputPath: string,
  theme: StoreTheme,
): Promise<{ success: boolean; errors: string[] }> {
  try {
    const sharp = (await import('sharp')).default;

    // Sample device dimensions for contact sheet
    const samples = [
      { name: 'iPhone 6.9"', ...DEVICE_DIMENSIONS['iphone-6.9-inch'].portrait },
      { name: 'iPad 13"', ...DEVICE_DIMENSIONS['ipad-13-inch'].portrait },
      { name: 'Android Phone', ...DEVICE_DIMENSIONS['android-phone'].portrait },
    ];

    // Calculate contact sheet dimensions
    const thumbWidth = 300;
    const thumbHeight = 400;
    const cols = 3;
    const rows = 1;
    const sheetWidth = thumbWidth * cols;
    const sheetHeight = thumbHeight * rows;

    // Create SVG background
    const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}">
      <rect width="${sheetWidth}" height="${sheetHeight}" fill="${theme.background}"/>
    </svg>`;

    const bgBuffer = await sharp(Buffer.from(bgSvg)).png().toBuffer();

    // Composite placeholder rectangles for each device size
    let composite = sharp(bgBuffer);

    for (let i = 0; i < samples.length; i++) {
      const x = (i % cols) * thumbWidth + (thumbWidth - thumbWidth * 0.4) / 2;
      const y = Math.floor(i / cols) * thumbHeight + 20;

      // Create a placeholder showing device dimensions
      const placeholderSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${thumbWidth * 0.4}" height="${thumbHeight * 0.8}">
        <rect x="0" y="0" width="${thumbWidth * 0.4}" height="${thumbHeight * 0.8}" fill="${theme.accent}" rx="12" opacity="0.3"/>
        <text x="${thumbWidth * 0.2}" y="${thumbHeight * 0.3}" font-size="14" font-weight="600" fill="${theme.foreground}" text-anchor="middle" font-family="system-ui, sans-serif">${samples[i].name}</text>
        <text x="${thumbWidth * 0.2}" y="${thumbHeight * 0.5}" font-size="11" fill="${theme.muted}" text-anchor="middle" font-family="system-ui, sans-serif">${samples[i].width}×${samples[i].height}</text>
      </svg>`;

      const placeholderBuffer = await sharp(Buffer.from(placeholderSvg)).png().toBuffer();

      composite = composite.composite([
        {
          input: placeholderBuffer,
          left: Math.round(x),
          top: Math.round(y),
        },
      ]);
    }

    await composite.png().toFile(outputPath);

    return { success: true, errors: [] };
  } catch (err) {
    return {
      success: false,
      errors: [
        `Failed to generate contact sheet: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}
