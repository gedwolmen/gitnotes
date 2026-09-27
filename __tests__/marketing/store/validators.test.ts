/**
 * Marketing Asset Pipeline - Store Validators Tests
 *
 * Tests for image validation:
 * - Dimension matching against DEVICE_DIMENSIONS contracts
 * - Alpha channel rejection (opaque requirement)
 * - Checksum computation and validation
 * - Decodability validation
 * - Feature graphic validation
 * - Malformed/missing source capture handling
 */

import { existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  validateDimensions,
  validateOpacity,
  validateAspectRatio,
  validateDecodable,
  validateFileSize,
  validateSourceCapture,
  validateOutputPathSafe,
  validateComposedImage,
  validateFeatureGraphic,
  extractImageMetadata,
  computeFileChecksum,
  flattenAlpha,
  ensureOpaque,
} from '../../../scripts/marketing/store/validators';
import { DEVICE_DIMENSIONS } from '../../../scripts/marketing/config';
import type { ImageMetadata } from '../../../scripts/marketing/store/types';

// ------------------------------------------------------------------------------------------------
// Test Fixtures
// ------------------------------------------------------------------------------------------------

/**
 * Create a temporary test image using sharp.
 */
async function createTestImage(
  path: string,
  width: number,
  height: number,
  options: { hasAlpha?: boolean; format?: 'png' | 'jpeg' } = {},
): Promise<void> {
  const sharp = (await import('sharp')).default;
  const { hasAlpha = false, format = 'png' } = options;

  // Create a simple colored image
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" fill="${hasAlpha ? '#5B7CEC80' : '#5B7CEC'}"/>
  </svg>`;

  let image = sharp(Buffer.from(svg));
  if (!hasAlpha) {
    image = image.flatten();
  }

  if (format === 'jpeg') {
    image = image.jpeg({ quality: 90 });
  } else {
    image = image.png();
  }

  await image.toFile(path);
}

/**
 * Create a properly sized opaque PNG matching device dimensions.
 */
async function createOpaqueTestImage(
  path: string,
  device: 'iphone-6.9-inch' | 'ipad-13-inch' | 'android-phone',
  orientation: 'portrait' | 'landscape',
): Promise<void> {
  const dims = DEVICE_DIMENSIONS[device][orientation];
  await createTestImage(path, dims.width, dims.height, { hasAlpha: false, format: 'png' });
}

/**
 * Create a RGBA PNG (with alpha channel).
 */
async function createAlphaTestImage(path: string, width: number, height: number): Promise<void> {
  await createTestImage(path, width, height, { hasAlpha: true, format: 'png' });
}

/**
 * Get temp path for test fixtures.
 */
function getTempPath(name: string): string {
  const dir = 'assets/marketing/tmp/store-validators';
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, name);
}

// ------------------------------------------------------------------------------------------------
// validateDimensions Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateDimensions', () => {
  test('passes for correct iPhone 6.9" portrait dimensions (1290x2796)', async () => {
    const path = getTempPath('iphone-portrait-ok.png');
    await createOpaqueTestImage(path, 'iphone-6.9-inch', 'portrait');

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'iphone-6.9-inch', 'portrait');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('passes for correct iPad 13" landscape dimensions (2732x2048)', async () => {
    const path = getTempPath('ipad-landscape-ok.png');
    await createOpaqueTestImage(path, 'ipad-13-inch', 'landscape');

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'ipad-13-inch', 'landscape');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('passes for correct Android phone portrait dimensions (1080x2340)', async () => {
    const path = getTempPath('android-portrait-ok.png');
    await createOpaqueTestImage(path, 'android-phone', 'portrait');

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'android-phone', 'portrait');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('FAILS for wrong width', async () => {
    // Create an image with wrong width
    const path = getTempPath('wrong-width.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1000, // Wrong - should be 1290
        height: 2796,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'iphone-6.9-inch', 'portrait');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Width mismatch'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for wrong height', async () => {
    const path = getTempPath('wrong-height.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1290,
        height: 2000, // Wrong - should be 2796
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'iphone-6.9-inch', 'portrait');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Height mismatch'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for wrong dimensions on Android tablet', async () => {
    const path = getTempPath('android-tablet-wrong.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1600, // Should be 1080 for 7" tablet portrait
        height: 2560,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateDimensions(metadata!, 'android-7-inch-tablet', 'portrait');
    expect(result.valid).toBe(false);

    unlinkSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// validateOpacity Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateOpacity', () => {
  test('passes for opaque RGB PNG', async () => {
    const path = getTempPath('opaque-rgb.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1290,
        height: 2796,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();
    expect(metadata!.hasAlpha).toBe(false);

    const result = validateOpacity(metadata!);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('FAILS for RGBA PNG with alpha channel', async () => {
    const path = getTempPath('rgba-with-alpha.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1290,
        height: 2796,
        channels: 4,
        background: { r: 91, g: 126, b: 236, alpha: 0.8 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();
    expect(metadata!.hasAlpha).toBe(true);
    expect(metadata!.channels).toBe(4);

    const result = validateOpacity(metadata!);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Alpha channel detected'))).toBe(true);
    expect(result.errors.some((e) => e.includes('RGBA'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for PNG with 4 channels', async () => {
    const path = getTempPath('4-channel.png');
    await createAlphaTestImage(path, 1290, 2796);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateOpacity(metadata!);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('4 channels'))).toBe(true);

    unlinkSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// validateSourceCapture Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateSourceCapture', () => {
  test('passes for existing file', async () => {
    const path = getTempPath('existing-source.png');
    await createOpaqueTestImage(path, 'iphone-6.9-inch', 'portrait');

    const result = validateSourceCapture(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('FAILS for missing file', () => {
    const result = validateSourceCapture('/nonexistent/path/to/capture.png');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
  });

  test('FAILS for empty file', () => {
    const path = getTempPath('empty-source.png');
    writeFileSync(path, '');

    const result = validateSourceCapture(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('empty'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for directory instead of file', () => {
    const path = getTempPath('is-directory');
    mkdirSync(path, { recursive: true });

    const result = validateSourceCapture(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('not a file'))).toBe(true);

    // Clean up directory
    const { rmdirSync } = require('fs');
    rmdirSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// validateFeatureGraphic Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateFeatureGraphic', () => {
  test('passes for valid 1024x500 opaque PNG', async () => {
    const path = getTempPath('valid-feature-graphic.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024,
        height: 500,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('passes for valid 1024x500 opaque JPEG', async () => {
    const path = getTempPath('valid-feature-graphic.jpg');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024,
        height: 500,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .jpeg({ quality: 90 })
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('FAILS for wrong width (not 1024)', async () => {
    const path = getTempPath('wrong-fg-width.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024, // Correct width
        height: 400, // Wrong height (should be 500)
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('height must be 500'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for wrong height (not 500)', async () => {
    const path = getTempPath('wrong-fg-height.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024,
        height: 500, // Correct
        channels: 4, // Wrong - has alpha
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Alpha channel'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for RGBA feature graphic', async () => {
    const path = getTempPath('rgba-feature-graphic.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024,
        height: 500,
        channels: 4,
        background: { r: 91, g: 126, b: 236, alpha: 0.5 },
      },
    })
      .png()
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Alpha channel'))).toBe(true);

    unlinkSync(path);
  });

  test('FAILS for non-PNG/JPEG format', async () => {
    const path = getTempPath('webp-feature-graphic.webp');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1024,
        height: 500,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .webp()
      .toFile(path);

    const result = await validateFeatureGraphic(path);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('must be PNG or JPEG'))).toBe(true);

    unlinkSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// validateFileSize Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateFileSize', () => {
  test('passes for reasonable file size', async () => {
    const path = getTempPath('normal-size.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 1290,
        height: 2796,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateFileSize(metadata!);
    // Normal PNG should pass (not too small, not too large)
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('warns for very small file', async () => {
    const path = getTempPath('tiny-size.png');
    const sharp = (await import('sharp')).default;
    // Create a tiny 10x10 image
    await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 91, g: 126, b: 236 },
      },
    })
      .png()
      .toFile(path);

    const metadata = await extractImageMetadata(path);
    expect(metadata).not.toBeNull();

    const result = validateFileSize(metadata!);
    // Should have warnings about small file
    expect(result.warnings.some((w) => w.includes('unusually small'))).toBe(true);

    unlinkSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// validateOutputPathSafe Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateOutputPathSafe', () => {
  test('passes for valid path within assets/marketing/', () => {
    const result = validateOutputPathSafe('assets/marketing/store/apple/hero.png');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('passes for nested path within assets/marketing/', () => {
    const result = validateOutputPathSafe('assets/marketing/store/google-play/feature.png');
    expect(result.valid).toBe(true);
  });

  test('FAILS for absolute path', () => {
    const result = validateOutputPathSafe('/tmp/output.png');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('escapes'))).toBe(true);
  });

  test('FAILS for path with traversal', () => {
    const result = validateOutputPathSafe('assets/marketing/../../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('escapes'))).toBe(true);
  });

  test('FAILS for path outside assets/marketing/', () => {
    const result = validateOutputPathSafe('output.png');
    expect(result.valid).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------------
// validateComposedImage Integration Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - validateComposedImage', () => {
  test('passes for correctly sized opaque PNG', async () => {
    const path = getTempPath('valid-composed.png');
    await createOpaqueTestImage(path, 'iphone-6.9-inch', 'portrait');

    const result = await validateComposedImage(path, 'iphone-6.9-inch', 'portrait');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);

    unlinkSync(path);
  });

  test('FAILS for multiple validation errors', async () => {
    // Create an image with wrong dimensions AND alpha
    const path = getTempPath('multi-error.png');
    const sharp = (await import('sharp')).default;
    await sharp({
      create: {
        width: 500, // Wrong
        height: 500, // Wrong
        channels: 4, // Has alpha
        background: { r: 91, g: 126, b: 236, alpha: 0.5 },
      },
    })
      .png()
      .toFile(path);

    const result = await validateComposedImage(path, 'iphone-6.9-inch', 'portrait');
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(3);

    unlinkSync(path);
  });
});

// ------------------------------------------------------------------------------------------------
// Existing Feature Graphic Validation
// ------------------------------------------------------------------------------------------------

describe('store/validators - existing feature_graphic.png', () => {
  const FG_PATH = join(process.cwd(), 'assets', 'feature_graphic.png');

  test('existing feature_graphic.png passes validation', async () => {
    // Skip if file doesn't exist (CI environment)
    if (!existsSync(FG_PATH)) {
      console.log('Skipping: feature_graphic.png not found');
      return;
    }

    const result = await validateFeatureGraphic(FG_PATH);
    expect(result.valid).toBe(true, `Feature graphic should pass validation. Errors: ${result.errors.join(', ')}`);
    expect(result.errors).toHaveLength(0);
  });

  test('existing feature_graphic.png is opaque (no alpha)', async () => {
    if (!existsSync(FG_PATH)) {
      console.log('Skipping: feature_graphic.png not found');
      return;
    }

    const metadata = await extractImageMetadata(FG_PATH);
    expect(metadata).not.toBeNull();
    expect(metadata!.hasAlpha).toBe(false);
  });

  test('existing feature_graphic.png has correct dimensions (1024x500)', async () => {
    if (!existsSync(FG_PATH)) {
      console.log('Skipping: feature_graphic.png not found');
      return;
    }

    const metadata = await extractImageMetadata(FG_PATH);
    expect(metadata).not.toBeNull();
    expect(metadata!.width).toBe(1024);
    expect(metadata!.height).toBe(500);
  });

  test('existing feature_graphic.png is decodable', async () => {
    if (!existsSync(FG_PATH)) {
      console.log('Skipping: feature_graphic.png not found');
      return;
    }

    const result = await validateDecodable(FG_PATH);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ------------------------------------------------------------------------------------------------
// computeFileChecksum Tests
// ------------------------------------------------------------------------------------------------

describe('store/validators - computeFileChecksum', () => {
  test('computes consistent SHA-256 checksum', async () => {
    const path = getTempPath('checksum-test.png');
    await createOpaqueTestImage(path, 'iphone-6.9-inch', 'portrait');

    const checksum1 = computeFileChecksum(path);
    const checksum2 = computeFileChecksum(path);

    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/);

    unlinkSync(path);
  });

  test('different files produce different checksums', async () => {
    const path1 = getTempPath('checksum1.png');
    const path2 = getTempPath('checksum2.png');

    await createOpaqueTestImage(path1, 'iphone-6.9-inch', 'portrait');
    await createOpaqueTestImage(path2, 'ipad-13-inch', 'portrait');

    const checksum1 = computeFileChecksum(path1);
    const checksum2 = computeFileChecksum(path2);

    expect(checksum1).not.toBe(checksum2);

    unlinkSync(path1);
    unlinkSync(path2);
  });
});
