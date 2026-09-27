/**
 * Marketing Asset Pipeline - Store Export Tests
 *
 * Tests for export orchestration:
 * - Full pipeline integration
 * - Manifest creation
 * - Preset exports
 * - Error handling
 * - Path safety
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import {
  exportStore,
  exportFeatureGraphic,
  exportPreset,
  quickExport,
  generateContactSheet,
  STORE_PRESETS,
} from '../../../scripts/marketing/store/export';
import { THEME_CLEAN_LIGHT, THEME_DARK_BOLD } from '../../../scripts/marketing/store/themes';
import { OUTPUT_DIRS, DEVICE_DIMENSIONS } from '../../../scripts/marketing/config';
import { readManifest, computeChecksum } from '../../../scripts/marketing/manifest';
import type { Slide } from '../../../scripts/marketing/store/types';

// ------------------------------------------------------------------------------------------------
// Test Fixtures
// ------------------------------------------------------------------------------------------------

/**
 * Get temp path for test outputs.
 */
function getTempPath(name: string): string {
  const dir = 'assets/marketing/tmp/store-export';
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, name);
}

/**
 * Create a test source capture image.
 */
async function createTestSourceCapture(
  path: string,
  device: 'iphone-6.9-inch' | 'ipad-13-inch' | 'android-phone',
  orientation: 'portrait' | 'landscape',
): Promise<void> {
  const sharp = (await import('sharp')).default;
  const dims = DEVICE_DIMENSIONS[device][orientation];

  await sharp({
    create: {
      width: dims.width,
      height: dims.height,
      channels: 3,
      background: { r: 200, g: 220, b: 255 },
    },
  })
    .flatten()
    .png()
    .toFile(path);
}

// ------------------------------------------------------------------------------------------------
// exportStore Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - exportStore', () => {
  const testOutputDir = getTempPath('output');

  beforeAll(() => {
    // Clean up stale output from previous runs
    if (existsSync(testOutputDir)) {
      rmSync(testOutputDir, { recursive: true, force: true });
    }
    mkdirSync(testOutputDir, { recursive: true });
  });

  test('exports single slide with manifest', async () => {
    // Create test source capture
    const sourceDir = getTempPath('source-single');
    mkdirSync(sourceDir, { recursive: true });
    const sourcePath = join(sourceDir, 'home-portrait.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const slides: Slide[] = [
      {
        id: 'test-single-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'home-portrait.png',
        headline: 'GitNotēs',
        body: 'Your data lives as plain Markdown.',
        index: 1,
      },
    ];

    const result = await exportStore({
      store: 'apple-app-store',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: testOutputDir,
      format: 'png',
      sourceCapturesDir: sourceDir,
    });

    expect(result.success).toBe(true);
    const imageArtifacts = result.artifacts.filter((f) => !f.endsWith('.manifest.json'));
    expect(imageArtifacts.length).toBe(1);
    expect(existsSync(imageArtifacts[0])).toBe(true);
    expect(Object.keys(result.validations).length).toBe(1);
    expect(result.errors).toHaveLength(0);

    // Verify artifact is valid
    const validation = result.validations[imageArtifacts[0]];
    expect(validation.valid).toBe(true);

    // Verify manifest was created
    const manifestFiles = result.artifacts.filter((f) => f.endsWith('.manifest.json'));
    expect(manifestFiles.length).toBeGreaterThan(0);

    // Cleanup
    unlinkSync(sourcePath);
  });

  test('exports multiple slides for Apple', async () => {
    const sourceDir = getTempPath('source-multi');
    mkdirSync(sourceDir, { recursive: true });

    // Create source captures
    const homePath = join(sourceDir, 'home.png');
    const notesPath = join(sourceDir, 'notes.png');
    await createTestSourceCapture(homePath, 'iphone-6.9-inch', 'portrait');
    await createTestSourceCapture(notesPath, 'iphone-6.9-inch', 'portrait');

    const slides: Slide[] = [
      {
        id: 'test-multi-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'home.png',
        headline: 'GitNotēs',
        body: 'Your data lives as plain Markdown.',
        index: 1,
      },
      {
        id: 'test-multi-02',
        layout: 'feature',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'notes.png',
        headline: 'Capture Every Idea',
        body: 'Notes, journals, and canvases.',
        index: 2,
      },
    ];

    const result = await exportStore({
      store: 'apple-app-store',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: testOutputDir,
      format: 'png',
      sourceCapturesDir: sourceDir,
    });

    expect(result.success).toBe(true);
    const imageArtifacts = result.artifacts.filter((f) => !f.endsWith('.manifest.json'));
    expect(imageArtifacts.length).toBe(2);
    expect(result.errors).toHaveLength(0);

    // All artifacts should be valid
    for (const artifact of imageArtifacts) {
      const validation = result.validations[artifact];
      if (!validation?.valid) {
        console.log('Validation errors:', validation?.errors);
      }
      expect(validation?.valid).toBe(true);
    }

    // Cleanup
    unlinkSync(homePath);
    unlinkSync(notesPath);
  });

  test('exports Google Play slides', async () => {
    const sourceDir = getTempPath('source-google');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'home.png');
    await createTestSourceCapture(sourcePath, 'android-phone', 'portrait');

    const slides: Slide[] = [
      {
        id: 'test-google-01',
        layout: 'hero',
        device: 'android-phone',
        orientation: 'portrait',
        sourcePath: 'home.png',
        headline: 'GitNotēs for Android',
        body: 'Available on Google Play.',
        index: 1,
      },
    ];

    const result = await exportStore({
      store: 'google-play',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: testOutputDir,
      format: 'png',
      sourceCapturesDir: sourceDir,
    });

    expect(result.success).toBe(true);
    const imageArtifacts = result.artifacts.filter((f) => !f.endsWith('.manifest.json'));
    expect(imageArtifacts.length).toBe(1);
    expect(imageArtifacts[0]).toContain('google-play');

    // Cleanup
    unlinkSync(sourcePath);
  });

  test('reports errors for missing source captures', async () => {
    const slides: Slide[] = [
      {
        id: 'test-missing-source-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: '/nonexistent/source.png',
        headline: 'Missing Source',
        index: 1,
      },
    ];

    const result = await exportStore({
      store: 'apple-app-store',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: testOutputDir,
      format: 'png',
      sourceCapturesDir: '/nonexistent',
    });

    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
  });

  test('rejects output path outside assets/marketing/', async () => {
    const slides: Slide[] = [
      {
        id: 'test-path-escape-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'home.png',
        headline: 'Path Escape',
        index: 1,
      },
    ];

    const result = await exportStore({
      store: 'apple-app-store',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: '/tmp/outside', // Invalid
      format: 'png',
      sourceCapturesDir: testOutputDir,
    });

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('escapes'))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// exportFeatureGraphic Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - exportFeatureGraphic', () => {
  test('exports valid feature graphic', async () => {
    const outputPath = getTempPath('exported-feature-graphic.png');

    const result = await exportFeatureGraphic(
      outputPath,
      THEME_CLEAN_LIGHT,
      undefined,
      'Notes, Todos & Git',
    );

    expect(result.success).toBe(true);
    expect(result.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(existsSync(outputPath)).toBe(true);

    // Verify dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(500);

    // Verify opaque
    expect(metadata.hasAlpha).toBe(false);

    unlinkSync(outputPath);
  });

  test('rejects output path outside assets/marketing/', async () => {
    const result = await exportFeatureGraphic(
      '/tmp/invalid-path/fg.png',
      THEME_CLEAN_LIGHT,
    );

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('escapes'))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// exportPreset Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - exportPreset', () => {
  beforeAll(() => {
    const outputDir = getTempPath('preset-output');
    if (existsSync(outputDir)) {
      rmSync(outputDir, { recursive: true, force: true });
    }
    mkdirSync(outputDir, { recursive: true });
  });

  test('exports APPLE_IPHONE_PORTRAIT preset', async () => {
    const sourceDir = getTempPath('source-preset');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'home.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const slides: Slide[] = [
      {
        id: 'preset-test-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'home.png',
        headline: 'Preset Test',
        index: 1,
      },
    ];

    const result = await exportPreset(
      'APPLE_IPHONE_PORTRAIT',
      slides,
      THEME_CLEAN_LIGHT,
      getTempPath('preset-output'),
      'png',
      sourceDir,
    );

    expect(result.success).toBe(true);

    // Cleanup
    unlinkSync(sourcePath);
  });
});

// ------------------------------------------------------------------------------------------------
// quickExport Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - quickExport', () => {
  beforeAll(() => {
    const outDir1 = getTempPath('quick-output');
    const outDir2 = getTempPath('quick-output-ipad');
    for (const d of [outDir1, outDir2]) {
      if (existsSync(d)) {
        rmSync(d, { recursive: true, force: true });
      }
      mkdirSync(d, { recursive: true });
    }
  });

  test('quick export for iPhone portrait', async () => {
    const sourceDir = getTempPath('source-quick');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'home.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const result = await quickExport(
      'iphone-6.9-inch',
      'portrait',
      sourcePath,
      getTempPath('quick-output'),
      THEME_CLEAN_LIGHT,
      'png',
    );

    expect(result.success).toBe(true);
    const imageArtifacts = result.artifacts.filter((f) => !f.endsWith('.manifest.json'));
    expect(imageArtifacts.length).toBe(1);

    // Cleanup
    unlinkSync(join(sourceDir, 'home.png'));
  });

  test('quick export for iPad landscape', async () => {
    const sourceDir = getTempPath('source-quick-ipad');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'home.png');
    await createTestSourceCapture(sourcePath, 'ipad-13-inch', 'landscape');

    const result = await quickExport(
      'ipad-13-inch',
      'landscape',
      sourcePath,
      getTempPath('quick-output-ipad'),
      THEME_CLEAN_LIGHT,
      'png',
    );

    expect(result.success).toBe(true);
    const imageArtifacts = result.artifacts.filter((f) => !f.endsWith('.manifest.json'));
    expect(imageArtifacts.length).toBe(1);

    // Verify iPad landscape dimensions in output
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(imageArtifacts[0]).metadata();
    expect(metadata.width).toBe(2732);
    expect(metadata.height).toBe(2048);

    // Cleanup
    unlinkSync(join(sourceDir, 'home.png'));
  });
});

// ------------------------------------------------------------------------------------------------
// generateContactSheet Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - generateContactSheet', () => {
  test('generates contact sheet', async () => {
    const outputPath = getTempPath('contact-sheet.png');

    const result = await generateContactSheet(outputPath, THEME_CLEAN_LIGHT);

    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(existsSync(outputPath)).toBe(true);

    // Verify output is a valid image
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBeGreaterThan(0);
    expect(metadata.height).toBeGreaterThan(0);

    unlinkSync(outputPath);
  });
});

// ------------------------------------------------------------------------------------------------
// STORE_PRESETS Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - STORE_PRESETS', () => {
  test('has all expected presets', () => {
    expect(STORE_PRESETS.APPLE_IPHONE_PORTRAIT).toBeDefined();
    expect(STORE_PRESETS.APPLE_IPHONE_LANDSCAPE).toBeDefined();
    expect(STORE_PRESETS.APPLE_IPAD_PORTRAIT).toBeDefined();
    expect(STORE_PRESETS.APPLE_IPAD_LANDSCAPE).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_PHONE_PORTRAIT).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_PHONE_LANDSCAPE).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_7TABLET_PORTRAIT).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_7TABLET_LANDSCAPE).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_10TABLET_PORTRAIT).toBeDefined();
    expect(STORE_PRESETS.GOOGLE_10TABLET_LANDSCAPE).toBeDefined();
  });

  test('all Apple presets have correct device', () => {
    expect(STORE_PRESETS.APPLE_IPHONE_PORTRAIT.device).toBe('iphone-6.9-inch');
    expect(STORE_PRESETS.APPLE_IPAD_PORTRAIT.device).toBe('ipad-13-inch');
  });

  test('all Google presets have correct device', () => {
    expect(STORE_PRESETS.GOOGLE_PHONE_PORTRAIT.device).toBe('android-phone');
    expect(STORE_PRESETS.GOOGLE_7TABLET_PORTRAIT.device).toBe('android-7-inch-tablet');
    expect(STORE_PRESETS.GOOGLE_10TABLET_PORTRAIT.device).toBe('android-10-inch-tablet');
  });

  test('dimensions match DEVICE_DIMENSIONS contracts', () => {
    // Verify that preset dimensions match the contracts
    const { device, orientation } = STORE_PRESETS.APPLE_IPHONE_PORTRAIT;
    const expected = DEVICE_DIMENSIONS['iphone-6.9-inch']['portrait'];
    expect(expected.width).toBe(1290);
    expect(expected.height).toBe(2796);

    const { device: ipad, orientation: ipadOrient } = STORE_PRESETS.APPLE_IPAD_LANDSCAPE;
    const ipadExpected = DEVICE_DIMENSIONS['ipad-13-inch']['landscape'];
    expect(ipadExpected.width).toBe(2732);
    expect(ipadExpected.height).toBe(2048);
  });
});

// ------------------------------------------------------------------------------------------------
// Manifest Integration Tests
// ------------------------------------------------------------------------------------------------

describe('store/export - manifest integration', () => {
  const testOutputDir = getTempPath('output');

  test('creates manifest with correct structure', async () => {
    const sourceDir = getTempPath('source-manifest');
    mkdirSync(sourceDir, { recursive: true });

    const sourcePath = join(sourceDir, 'home.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const slides: Slide[] = [
      {
        id: 'manifest-test-01',
        layout: 'hero',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        sourcePath: 'home.png',
        headline: 'Manifest Test',
        index: 1,
      },
    ];

    const result = await exportStore({
      store: 'apple-app-store',
      slides,
      theme: THEME_CLEAN_LIGHT,
      outputDir: testOutputDir,
      format: 'png',
      sourceCapturesDir: sourceDir,
    });

    expect(result.success).toBe(true);

    // Find manifest file
    const manifestPath = result.artifacts.find((f) => f.endsWith('.manifest.json'));
    expect(manifestPath).toBeDefined();

    if (manifestPath) {
      const manifest = readManifest(manifestPath!);
      expect(manifest).not.toBeNull();
      expect(manifest!.runId).toBe(result.runId);
      expect(manifest!.sources.length).toBeGreaterThan(0);
    }

    // Cleanup
    unlinkSync(sourcePath);
  });
});
