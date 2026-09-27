/**
 * Marketing Composition Package - Deterministic Timeline
 *
 * Provides timeline controls for story rendering at specific checkpoints.
 * Deterministic: same inputs always produce same outputs.
 */

import type { Checkpoint, CheckpointResult, RenderResult, SocialSlide } from './types';

// ------------------------------------------------------------------------------------------------
// Timeline Calculation
// ------------------------------------------------------------------------------------------------

export interface TimelineState {
  /** Current time in milliseconds */
  time: number;
  /** Total duration in milliseconds */
  duration: number;
  /** Current slide index (0-based) */
  slideIndex: number;
  /** Progress within current slide (0-1) */
  slideProgress: number;
  /** Whether story is complete */
  complete: boolean;
}

/**
 * Calculate which slide is visible at a given time.
 * Deterministic: same time + slides always returns same result.
 */
export function getSlideAtTime(timeMs: number, slides: SocialSlide[], totalDuration: number): TimelineState {
  if (slides.length === 0) {
    return {
      time: timeMs,
      duration: totalDuration,
      slideIndex: 0,
      slideProgress: 0,
      complete: true,
    };
  }

  const slideDuration = totalDuration / slides.length;

  // Clamp time to valid range
  const clampedTime = Math.max(0, Math.min(timeMs, totalDuration));

  // Calculate slide index
  const slideIndex = Math.min(Math.floor(clampedTime / slideDuration), slides.length - 1);

  // Calculate progress within slide
  const slideProgress = (clampedTime % slideDuration) / slideDuration;

  return {
    time: clampedTime,
    duration: totalDuration,
    slideIndex,
    slideProgress,
    complete: clampedTime >= totalDuration,
  };
}

// ------------------------------------------------------------------------------------------------
// Checkpoint Generation
// ------------------------------------------------------------------------------------------------

/**
 * Generate the three required checkpoints: 0, duration/2, duration.
 */
export function generateCheckpoints(slides: SocialSlide[], totalDuration: number): Checkpoint[] {
  if (slides.length === 0) {
    return [];
  }

  const checkpoints: Checkpoint[] = [
    {
      id: 'start',
      time: 0,
      expectedSlideIndex: 0,
    },
    {
      id: 'middle',
      time: Math.floor(totalDuration / 2),
      expectedSlideIndex: Math.floor(slides.length / 2),
    },
    {
      id: 'end',
      time: totalDuration,
      expectedSlideIndex: slides.length - 1,
    },
  ];

  return checkpoints;
}

// ------------------------------------------------------------------------------------------------
// Checkpoint Evaluation
// ------------------------------------------------------------------------------------------------

/**
 * Evaluate a single checkpoint against a render result.
 */
export function evaluateCheckpoint(
  checkpoint: Checkpoint,
  actualSlideIndex: number,
  actualHash: string,
  renderTimeMs: number
): CheckpointResult {
  const passed =
    actualSlideIndex === checkpoint.expectedSlideIndex &&
    (checkpoint.expectedHash === undefined || actualHash === checkpoint.expectedHash);

  return {
    checkpoint,
    actualSlideIndex,
    actualHash,
    passed,
    renderTimeMs,
  };
}

// ------------------------------------------------------------------------------------------------
// Frame Extraction
// ------------------------------------------------------------------------------------------------

/**
 * Extract a frame from a canvas at a specific time.
 * This is the core deterministic rendering function.
 */
export async function extractFrameAtTime(
  canvas: HTMLCanvasElement,
  timeMs: number,
  slides: SocialSlide[],
  totalDuration: number,
  getFrameRenderer: (slideIndex: number) => (ctx: CanvasRenderingContext2D, progress: number) => void
): Promise<RenderResult> {
  const startTime = performance.now();

  // Calculate which slide to render
  const state = getSlideAtTime(timeMs, slides, totalDuration);

  // Get the renderer for this slide
  const renderFrame = getFrameRenderer(state.slideIndex);

  // Clear and render
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  renderFrame(ctx, state.slideProgress);

  // Extract as PNG
  const dataUrl = canvas.toDataURL('image/png');

  // Calculate hash of the PNG bytes
  const hash = await hashDataUrl(dataUrl);

  const renderTimeMs = Math.round(performance.now() - startTime);

  return {
    dataUrl,
    hash,
    width: canvas.width,
    height: canvas.height,
    renderTimeMs,
  };
}

/**
 * Hash a data URL to get a deterministic identifier.
 */
async function hashDataUrl(dataUrl: string): Promise<string> {
  const base64 = dataUrl.split(',')[1] || '';
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', bytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Fallback: simple string hash
  let hash = 0;
  for (let i = 0; i < dataUrl.length; i++) {
    const char = dataUrl.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

// ------------------------------------------------------------------------------------------------
// Story Timeline Hook Data
// ------------------------------------------------------------------------------------------------

export interface StoryTimeline {
  /** Total duration in ms */
  duration: number;
  /** Slide count */
  slideCount: number;
  /** Per-slide duration in ms */
  slideDuration: number;
  /** All checkpoints */
  checkpoints: Checkpoint[];
  /** Get timeline state at any time */
  getStateAt: (timeMs: number) => TimelineState;
}

export function createStoryTimeline(slides: SocialSlide[], totalDurationMs: number): StoryTimeline {
  return {
    duration: totalDurationMs,
    slideCount: slides.length,
    slideDuration: slides.length > 0 ? totalDurationMs / slides.length : 0,
    checkpoints: generateCheckpoints(slides, totalDurationMs),
    getStateAt: (timeMs: number) => getSlideAtTime(timeMs, slides, totalDurationMs),
  };
}
