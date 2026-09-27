/**
 * Marketing Asset Pipeline - Store Composer Tests
 *
 * Tests for slide composition:
 * - Layout composition with varied layouts
 * - Theme application
 * - Portrait and landscape handling
 * - Source capture integration
 * - Output dimension verification
 */

import { existsSync, mkdirSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { composeSlide, composeFeatureGraphic, buildSlides, getDefaultLayouts } from '../../../scripts/marketing/store/composer';
import { THEME_CLEAN_LIGHT, THEME_DARK_BOLD } from '../../../scripts/marketing/store/themes';
import { DEVICE_DIMENSIONS } from '../../../scripts/marketing/config';
import type { Slide, SlideLayout } from '../../../scripts/marketing/store/types';

// ------------------------------------------------------------------------------------------------
// Test Fixtures
// ------------------------------------------------------------------------------------------------

/**
 * Get temp path for test outputs.
 */
function getTempPath(name: string): string {
  const dir = join(process.cwd(), 'tmp', 'store-composer');
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
    .png()
    .toFile(path);
}

// ------------------------------------------------------------------------------------------------
// composeSlide Tests
// ------------------------------------------------------------------------------------------------

describe('store/composer - composeSlide', () => {
  const testOutputDir = join(process.cwd(), 'tmp', 'store-composer');

  test('composes hero layout slide with correct dimensions', async () => {
    const sourcePath = getTempPath('source-hero.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const outputPath = getTempPath('hero-slide.png');

    const slide: Slide = {
      id: 'hero-test-01',
      layout: 'hero',
      device: 'iphone-6.9-inch',
      orientation: 'portrait',
      sourcePath,
      headline: 'GitNotēs',
      subtitle: 'Notes, Todos & Git',
      body: 'Your data lives as plain Markdown.',
      index: 1,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(1290);
    expect(metadata.height).toBe(2796);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('composes feature layout slide', async () => {
    const sourcePath = getTempPath('source-feature.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const outputPath = getTempPath('feature-slide.png');

    const slide: Slide = {
      id: 'feature-test-01',
      layout: 'feature',
      device: 'iphone-6.9-inch',
      orientation: 'portrait',
      sourcePath,
      headline: 'Capture Every Idea',
      subtitle: undefined,
      body: 'Notes, journals, and canvases.',
      index: 2,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('composes contrast layout slide (dark theme)', async () => {
    const sourcePath = getTempPath('source-contrast.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const outputPath = getTempPath('contrast-slide.png');

    const slide: Slide = {
      id: 'contrast-test-01',
      layout: 'contrast',
      device: 'iphone-6.9-inch',
      orientation: 'portrait',
      sourcePath,
      headline: 'Works Offline',
      body: 'Edits queue locally and sync.',
      index: 3,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_DARK_BOLD,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('composes landscape-left layout for tablet', async () => {
    const sourcePath = getTempPath('source-landscape-left.png');
    await createTestSourceCapture(sourcePath, 'ipad-13-inch', 'landscape');

    const outputPath = getTempPath('landscape-left-slide.png');

    const slide: Slide = {
      id: 'landscape-test-01',
      layout: 'landscape-left',
      device: 'ipad-13-inch',
      orientation: 'landscape',
      sourcePath,
      headline: 'iPad Landscape',
      body: 'Caption on the left.',
      index: 1,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify iPad landscape dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(2732);
    expect(metadata.height).toBe(2048);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('composes Android phone slide', async () => {
    const sourcePath = getTempPath('source-android.png');
    await createTestSourceCapture(sourcePath, 'android-phone', 'portrait');

    const outputPath = getTempPath('android-slide.png');

    const slide: Slide = {
      id: 'android-test-01',
      layout: 'hero',
      device: 'android-phone',
      orientation: 'portrait',
      sourcePath,
      headline: 'Android',
      body: 'Google Play ready.',
      index: 1,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify Android phone dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(1080);
    expect(metadata.height).toBe(2340);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('composes JPEG format output', async () => {
    const sourcePath = getTempPath('source-jpeg.png');
    await createTestSourceCapture(sourcePath, 'iphone-6.9-inch', 'portrait');

    const outputPath = getTempPath('jpeg-slide.jpg');

    const slide: Slide = {
      id: 'jpeg-test-01',
      layout: 'hero',
      device: 'iphone-6.9-inch',
      orientation: 'portrait',
      sourcePath,
      headline: 'JPEG Output',
      index: 1,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'jpeg',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify it's actually JPEG
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.format).toBe('jpeg');

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });

  test('handles missing source capture gracefully', async () => {
    const outputPath = getTempPath('no-source-slide.png');

    const slide: Slide = {
      id: 'no-source-test-01',
      layout: 'hero',
      device: 'iphone-6.9-inch',
      orientation: 'portrait',
      sourcePath: '/nonexistent/source.png',
      headline: 'No Source',
      index: 1,
    };

    // Should still produce output (placeholder background)
    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: '/nonexistent/source.png',
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    unlinkSync(outputPath);
  });
});

// ------------------------------------------------------------------------------------------------
// composeFeatureGraphic Tests
// ------------------------------------------------------------------------------------------------

describe('store/composer - composeFeatureGraphic', () => {
  test('composes feature graphic at 1024x500', async () => {
    const outputPath = getTempPath('feature-graphic.png');

    const { checksum } = await composeFeatureGraphic(
      outputPath,
      THEME_CLEAN_LIGHT,
      undefined,
      'Notes, Todos & Git',
    );

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.width).toBe(1024);
    expect(metadata.height).toBe(500);

    unlinkSync(outputPath);
  });

  test('composes opaque feature graphic', async () => {
    const outputPath = getTempPath('fg-opaque.png');

    await composeFeatureGraphic(outputPath, THEME_CLEAN_LIGHT);

    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    expect(metadata.hasAlpha).toBe(false);

    unlinkSync(outputPath);
  });

  test('uses default tagline when not provided', async () => {
    const outputPath = getTempPath('fg-default-tagline.png');

    await composeFeatureGraphic(outputPath, THEME_CLEAN_LIGHT);

    // Should still produce valid output
    expect(existsSync(outputPath)).toBe(true);

    unlinkSync(outputPath);
  });
});

// ------------------------------------------------------------------------------------------------
// buildSlides Tests
// ------------------------------------------------------------------------------------------------

describe('store/composer - buildSlides', () => {
  test('builds slides with correct structure', () => {
    const layouts: SlideLayout[] = ['hero', 'feature', 'contrast'];
    const slides = buildSlides(
      'iphone-6.9-inch',
      'portrait',
      'home',
      'captures/home.png',
      {
        title: 'GitNotēs',
        subtitle: 'Notes, Todos & Git',
        body: 'Your data lives as plain Markdown.',
      },
      layouts,
    );

    expect(slides).toHaveLength(3);

    slides.forEach((slide, idx) => {
      expect(slide.id).toContain('iphone-6.9-inch');
      expect(slide.id).toContain('home');
      expect(slide.id).toContain('portrait');
      expect(slide.device).toBe('iphone-6.9-inch');
      expect(slide.orientation).toBe('portrait');
      expect(slide.layout).toBe(layouts[idx]);
      expect(slide.index).toBe(idx + 1);
      expect(slide.headline).toBe('GitNotēs');
      expect(slide.subtitle).toBe('Notes, Todos & Git');
      expect(slide.body).toBe('Your data lives as plain Markdown.');
    });
  });

  test('builds slides with unique IDs', () => {
    const layouts = getDefaultLayouts(5);
    const slides = buildSlides(
      'iphone-6.9-inch',
      'portrait',
      'home',
      'captures/home.png',
      { title: 'Test' },
      layouts,
    );

    const ids = slides.map((s) => s.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(5);
  });
});

// ------------------------------------------------------------------------------------------------
// getDefaultLayouts Tests
// ------------------------------------------------------------------------------------------------

describe('store/composer - getDefaultLayouts', () => {
  test('returns correct number of layouts', () => {
    const layouts = getDefaultLayouts(5);
    expect(layouts).toHaveLength(5);
  });

  test('cycles through layout types', () => {
    const layouts = getDefaultLayouts(10);

    // Should cycle through: hero, feature, contrast, landscape-left, landscape-right
    expect(layouts[0]).toBe('hero');
    expect(layouts[1]).toBe('feature');
    expect(layouts[2]).toBe('contrast');
    expect(layouts[3]).toBe('landscape-left');
    expect(layouts[4]).toBe('landscape-right');
    expect(layouts[5]).toBe('hero'); // Cycles back
  });

  test('handles single layout request', () => {
    const layouts = getDefaultLayouts(1);
    expect(layouts).toHaveLength(1);
    expect(layouts[0]).toBe('hero');
  });
});

// ------------------------------------------------------------------------------------------------
// All Device Profiles
// ------------------------------------------------------------------------------------------------

describe('store/composer - all device profiles', () => {
  const devices: Array<{ device: 'iphone-6.9-inch' | 'ipad-13-inch' | 'android-phone'; orientation: 'portrait' | 'landscape' }> = [
    { device: 'iphone-6.9-inch', orientation: 'portrait' },
    { device: 'iphone-6.9-inch', orientation: 'landscape' },
    { device: 'ipad-13-inch', orientation: 'portrait' },
    { device: 'ipad-13-inch', orientation: 'landscape' },
    { device: 'android-phone', orientation: 'portrait' },
    { device: 'android-phone', orientation: 'landscape' },
  ];

  test.each(devices)('composes $device $orientation slide', async ({ device, orientation }) => {
    const sourcePath = getTempPath(`source-${device}-${orientation}.png`);
    await createTestSourceCapture(sourcePath, device, orientation);

    const outputPath = getTempPath(`slide-${device}-${orientation}.png`);

    const slide: Slide = {
      id: `test-${device}-${orientation}`,
      layout: orientation === 'landscape' ? 'landscape-left' : 'hero',
      device,
      orientation,
      sourcePath,
      headline: `${device} ${orientation}`,
      index: 1,
    };

    const { checksum } = await composeSlide({
      slide,
      theme: THEME_CLEAN_LIGHT,
      outputPath,
      format: 'png',
      sourceCapturePath: sourcePath,
    });

    expect(existsSync(outputPath)).toBe(true);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);

    // Verify exact dimensions
    const sharp = (await import('sharp')).default;
    const metadata = await sharp(outputPath).metadata();
    const expected = DEVICE_DIMENSIONS[device][orientation];
    expect(metadata.width).toBe(expected.width);
    expect(metadata.height).toBe(expected.height);

    unlinkSync(sourcePath);
    unlinkSync(outputPath);
  });
});
