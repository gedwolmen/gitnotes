/**
 * Marketing Composition Package - Image Preloader
 *
 * Preloads images before rendering to ensure deterministic output.
 * Returns detailed load state for diagnostics.
 */

import type { ImageLoadState, PreloadResult, SocialSlide } from './types';

// ------------------------------------------------------------------------------------------------
// Image Preloader
// ------------------------------------------------------------------------------------------------

/**
 * Preload a single image and return its load state.
 * Uses Promise-based loading with timeout.
 */
function preloadImage(url: string, timeoutMs: number = 5000): Promise<ImageLoadState> {
  return new Promise((resolve) => {
    // For data URLs, return immediately as "loaded"
    if (url.startsWith('data:')) {
      resolve({
        url,
        loaded: true,
        error: null,
        width: 0,
        height: 0,
      });
      return;
    }

    // For non-http(s) URLs, return as not loaded (standalone package)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      resolve({
        url,
        loaded: false,
        error: 'Relative paths require an asset server in standalone mode',
        width: 0,
        height: 0,
      });
      return;
    }

    const img = new Image();

    const timeoutId = setTimeout(() => {
      img.src = '';
      resolve({
        url,
        loaded: false,
        error: `Timeout after ${timeoutMs}ms`,
        width: 0,
        height: 0,
      });
    }, timeoutMs);

    img.onload = () => {
      clearTimeout(timeoutId);
      resolve({
        url,
        loaded: true,
        error: null,
        width: img.naturalWidth,
        height: img.naturalHeight,
      });
    };

    img.onerror = () => {
      clearTimeout(timeoutId);
      resolve({
        url,
        loaded: false,
        error: 'Failed to load image',
        width: 0,
        height: 0,
      });
    };

    img.src = url;
  });
}

/**
 * Preload all images for a set of slides.
 * Images are loaded in parallel for speed.
 */
export async function preloadSlideImages(
  slides: SocialSlide[],
  timeoutMs: number = 5000
): Promise<PreloadResult> {
  const startTime = performance.now();

  // Extract unique image URLs from slides
  const imageUrls = [...new Set(slides.map((slide) => slide.sourcePath))];

  // Load all images in parallel
  const results = await Promise.all(imageUrls.map((url) => preloadImage(url, timeoutMs)));

  const allLoaded = results.every((state) => state.loaded);
  const preloadTimeMs = Math.round(performance.now() - startTime);

  return {
    images: results,
    allLoaded,
    preloadTimeMs,
  };
}

/**
 * Preload images sequentially (for stricter ordering guarantees).
 */
export async function preloadSlideImagesSequential(
  slides: SocialSlide[],
  timeoutMs: number = 5000
): Promise<PreloadResult> {
  const startTime = performance.now();

  const imageUrls = [...new Set(slides.map((slide) => slide.sourcePath))];
  const results: ImageLoadState[] = [];

  for (const url of imageUrls) {
    const state = await preloadImage(url, timeoutMs);
    results.push(state);
  }

  const allLoaded = results.every((state) => state.loaded);
  const preloadTimeMs = Math.round(performance.now() - startTime);

  return {
    images: results,
    allLoaded,
    preloadTimeMs,
  };
}

// ------------------------------------------------------------------------------------------------
// Preload with Retry
// ------------------------------------------------------------------------------------------------

/**
 * Preload with automatic retry on failure.
 */
export async function preloadWithRetry(
  slides: SocialSlide[],
  maxRetries: number = 2,
  timeoutMs: number = 5000
): Promise<PreloadResult> {
  let lastResult: PreloadResult | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    lastResult = await preloadSlideImages(slides, timeoutMs);

    if (lastResult.allLoaded) {
      return lastResult;
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
    }
  }

  return lastResult!;
}

// ------------------------------------------------------------------------------------------------
// Preload Summary
// ------------------------------------------------------------------------------------------------

/**
 * Generate a human-readable summary of preload results.
 */
export function preloadSummary(result: PreloadResult): string {
  const lines: string[] = ['[PRELOAD SUMMARY]'];
  lines.push(`Images: ${result.images.length}`);
  lines.push(`Loaded: ${result.images.filter((i) => i.loaded).length}/${result.images.length}`);
  lines.push(`Time: ${result.preloadTimeMs}ms`);

  if (!result.allLoaded) {
    lines.push('Failed images:');
    result.images
      .filter((i) => !i.loaded)
      .forEach((i) => {
        lines.push(`  - ${i.url}: ${i.error}`);
      });
  }

  return lines.join('\n');
}
