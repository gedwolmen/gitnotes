/**
 * Marketing Asset Pipeline - Video Captions
 *
 * Safe-area-aware caption overlay generation for video.
 * Produces FFmpeg filter complex for burn-in captions.
 *
 * References:
 * - FFmpeg drawtext: https://ffmpeg.org/ffmpeg-filters.html#drawtext
 * - Safe area specs: https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications/
 */

import type { VideoCaption, VideoSafeArea } from './types';
import { VideoRatioSchema, VIDEO_DIMENSIONS } from './types';

// ------------------------------------------------------------------------------------------------
// Caption Filter Builder
// ------------------------------------------------------------------------------------------------

/**
 * Build FFmpeg drawtext filter for caption overlay.
 *
 * @param caption - Caption specification
 * @param safeArea - Safe area insets
 * @param videoWidth - Video width in pixels
 * @param videoHeight - Video height in pixels
 * @returns FFmpeg filter string for caption
 */
export function buildCaptionFilter(
  caption: VideoCaption,
  safeArea: VideoSafeArea,
  videoWidth: number,
  videoHeight: number,
): string {
  // Calculate font size based on video height
  const fontSize = Math.round(videoHeight * caption.fontSizeRatio);

  // Calculate text alignment position
  const { x, y, alignment } = calculateCaptionPosition(
    caption,
    safeArea,
    videoWidth,
    videoHeight,
    fontSize,
  );

  // Build drawtext filter
  const escapedText = escapeDrawtext(caption.text);
  const enableExpr = 'between(t,0,60)'; // Show for first 60 seconds

  // Build filter components
  const filterParts: string[] = [];

  // Background filter if specified
  if (caption.backgroundColor) {
    // Draw background box first
    const boxFilter = buildBackgroundFilter(
      caption,
      safeArea,
      videoWidth,
      videoHeight,
      fontSize,
      x,
      y,
    );
    filterParts.push(boxFilter);
  }

  // Main text filter
  const textFilter = [
    `drawtext=text='${escapedText}'`,
    `:x=${x}`,
    `:y=${y}`,
    `:fontsize=${fontSize}`,
    `:fontcolor=${caption.color}`,
    `:fontweight=${caption.fontWeight}`,
    `:alignment=${alignment}`,
    `:enable='${enableExpr}'`,
  ].join('');

  filterParts.push(textFilter);

  return filterParts.join(',');
}

/**
 * Build background box filter for caption.
 */
function buildBackgroundFilter(
  caption: VideoCaption,
  safeArea: VideoSafeArea,
  videoWidth: number,
  videoHeight: number,
  fontSize: number,
  textX: number,
  textY: number,
): string {
  // Estimate text width (approximate - actual measurement would need complex calculation)
  const textWidth = estimateTextWidth(caption.text, fontSize);
  const textHeight = fontSize * 1.5;

  // Box padding
  const padding = caption.padding;

  // Box coordinates
  const boxX = Math.max(safeArea.left, textX - padding);
  const boxY = Math.max(safeArea.top, textY - padding);
  const boxWidth = textWidth + padding * 2;
  const boxHeight = textHeight + padding * 2;

  return [
    `drawbox=x=${boxX}:y=${boxY}:w=${boxWidth}:h=${boxHeight}`,
    `:color=${caption.backgroundColor}`,
    `:t=fill`,
    `:enable='between(t,0,60)'`,
  ].join('');
}

/**
 * Calculate caption position based on alignment.
 */
function calculateCaptionPosition(
  caption: VideoCaption,
  safeArea: VideoSafeArea,
  videoWidth: number,
  videoHeight: number,
  fontSize: number,
): { x: number; y: number; alignment: number } {
  // Calculate safe area bounds
  const safeLeft = safeArea.left;
  const safeRight = videoWidth - safeArea.right;
  const safeTop = safeArea.top;
  const safeBottom = videoHeight - safeArea.bottom;
  const safeWidth = safeRight - safeLeft;
  const safeHeight = safeBottom - safeTop;

  // Text height for vertical positioning
  const textHeight = fontSize * 1.5;

  let y: number;
  const x = safeLeft + safeWidth / 2;
  const alignment = 1;

  // Vertical position based on caption.position
  switch (caption.position) {
    case 'top':
      y = safeTop + safeHeight * 0.15 + caption.verticalOffset;
      break;
    case 'center':
      y = safeTop + safeHeight * 0.5 + caption.verticalOffset;
      break;
    case 'bottom':
    default:
      y = safeBottom - safeHeight * 0.15 - textHeight + caption.verticalOffset;
      break;
  }

  // Clamp y to safe area
  y = Math.max(safeTop + fontSize, Math.min(safeBottom - textHeight, y));

  return { x, y, alignment };
}

/**
 * Escape special characters for FFmpeg drawtext filter.
 */
function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]');
}

/**
 * Estimate text width in pixels (approximate).
 * FFmpeg's drawtext doesn't provide easy text measurement,
 * so we use a rough estimate based on character count.
 */
function estimateTextWidth(text: string, fontSize: number): number {
  // Average character width is roughly 0.6 * font size for proportional fonts
  // Plus some padding
  return Math.round(text.length * fontSize * 0.6 + fontSize);
}

// ------------------------------------------------------------------------------------------------
// Full Filter Complex Builder
// ------------------------------------------------------------------------------------------------

/**
 * Build complete FFmpeg filter complex for video with caption.
 *
 * @param inputCount - Number of input files (for image sequences)
 * @param caption - Caption specification
 * @param safeArea - Safe area insets
 * @param videoWidth - Video width
 * @param videoHeight - Video height
 * @param fps - Frames per second
 * @param duration - Duration in seconds
 * @returns Object with filter complex and related settings
 */
export function buildVideoFilterComplex(
  inputCount: number,
  caption: VideoCaption | undefined,
  safeArea: VideoSafeArea,
  videoWidth: number,
  videoHeight: number,
  fps: number,
  _duration: number,
): {
  filterComplex: string;
  inputArgs: string[];
  outputArgs: string[];
} {
  const inputArgs: string[] = [];
  const outputArgs: string[] = [];

  // Build input args for image sequence
  for (let i = 0; i < inputCount; i++) {
    inputArgs.push('-loop', '1', '-framerate', String(fps), '-i', `%d.png`);
  }

  // Build filter complex for concatenation and caption
  if (inputCount > 1) {
    // Multiple inputs - need to concatenate
    const concatParts: string[] = [];
    for (let i = 0; i < inputCount; i++) {
      const label = `[${i}:v]`;
      concatParts.push(label);
    }
    concatParts.push(`concat=n=${inputCount}:v=1[outv]`);

    let filterComplex = concatParts.join('');

    // Add caption if specified
    if (caption) {
      const captionFilter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);
      filterComplex += `;[outv]${captionFilter}[outv_with_caption]`;
    }

    return {
      filterComplex,
      inputArgs,
      outputArgs,
    };
  }

  // Single input
  let filterComplex = '[0:v]';

  if (caption) {
    const captionFilter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);
    filterComplex += captionFilter + '[outv]';
  } else {
    filterComplex += 'copy[outv]';
  }

  return {
    filterComplex,
    inputArgs,
    outputArgs,
  };
}

// ------------------------------------------------------------------------------------------------
// Caption Validation
// ------------------------------------------------------------------------------------------------

/**
 * Validate caption bounds against safe area.
 * Ensures caption fits within safe area without overflow.
 */
export function validateCaptionBounds(
  caption: VideoCaption,
  safeArea: VideoSafeArea,
  videoWidth: number,
  videoHeight: number,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Calculate safe area bounds
  const safeLeft = safeArea.left;
  const safeRight = videoWidth - safeArea.right;
  const safeTop = safeArea.top;
  const safeBottom = videoHeight - safeArea.bottom;

  // Estimate caption dimensions
  const fontSize = Math.round(videoHeight * caption.fontSizeRatio);
  const estimatedWidth = estimateTextWidth(caption.text, fontSize) + caption.padding * 2;
  const estimatedHeight = fontSize * 1.5 + caption.padding * 2;

  // Check horizontal bounds
  if (safeLeft + estimatedWidth > safeRight) {
    errors.push(
      `Caption width (${estimatedWidth}px) exceeds safe area width (${safeRight - safeLeft}px)`,
    );
  }

  // Check vertical bounds
  const { y } = calculateCaptionPosition(caption, safeArea, videoWidth, videoHeight, fontSize);
  if (y < safeTop) {
    errors.push(`Caption Y position (${y}px) above safe area top (${safeTop}px)`);
  }
  if (y + estimatedHeight > safeBottom) {
    warnings.push(`Caption may extend below safe area bottom (${safeBottom}px)`);
  }

  // Check font size is reasonable
  const minFontSize = Math.round(videoHeight * 0.02);
  const maxFontSize = Math.round(videoHeight * 0.15);
  if (fontSize < minFontSize) {
    warnings.push(`Font size (${fontSize}px) is small for video height (${videoHeight}px)`);
  }
  if (fontSize > maxFontSize) {
    errors.push(`Font size (${fontSize}px) exceeds maximum recommended (${maxFontSize}px)`);
  } else if (fontSize > maxFontSize * 0.5) {
    warnings.push(`Font size (${fontSize}px) is large for video height (${videoHeight}px)`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validate caption for a specific video ratio.
 */
export function validateCaptionForRatio(
  caption: VideoCaption,
  ratio: keyof typeof VideoRatioSchema,
): { valid: boolean; errors: string[]; warnings: string[] } {
  const dims = VIDEO_DIMENSIONS[VideoRatioSchema[ratio]];

  // Use default safe areas for validation
  const defaultSafeAreas = {
    [VideoRatioSchema.VERTICAL]: { top: 120, bottom: 120, left: 40, right: 40, scale: 1 },
    [VideoRatioSchema.SQUARE]: { top: 80, bottom: 80, left: 40, right: 40, scale: 1 },
    [VideoRatioSchema.HORIZONTAL]: { top: 60, bottom: 60, left: 40, right: 40, scale: 1 },
  };

  const safe = defaultSafeAreas[VideoRatioSchema[ratio]];

  return validateCaptionBounds(caption, safe, dims.width, dims.height);
}
