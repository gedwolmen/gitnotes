/**
 * Marketing Asset Pipeline - Video Captions Tests
 *
 * Tests for safe-area-aware caption overlay generation.
 */

import {
  buildCaptionFilter,
  buildVideoFilterComplex,
  validateCaptionBounds,
  validateCaptionForRatio,
} from '../../../scripts/marketing/video/captions';
import { DEFAULT_CAPTION } from '../../../scripts/marketing/video/types';
import type { VideoCaption, VideoSafeArea } from '../../../scripts/marketing/video/types';

// ------------------------------------------------------------------------------------------------
// Caption Filter Builder Tests
// ------------------------------------------------------------------------------------------------

describe('video/captions - buildCaptionFilter', () => {
  const safeArea: VideoSafeArea = {
    top: 100,
    bottom: 100,
    left: 40,
    right: 40,
    scale: 1,
  };

  const videoWidth = 1080;
  const videoHeight = 1920;

  test('generates drawtext filter with all parameters', () => {
    const caption: VideoCaption = {
      text: 'Test Caption',
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 16,
      verticalOffset: 0,
    };

    const filter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);

    expect(filter).toContain('drawtext');
    expect(filter).toContain('Test Caption');
    expect(filter).toContain('fontsize');
    expect(filter).toContain('fontcolor');
    expect(filter).toContain('enable=');
  });

  test('escapes special characters in text', () => {
    const caption: VideoCaption = {
      text: "Test's Caption: GitNotēs",
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const filter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);

    // Should escape quotes (single quote escaped as \') and colons (escaped as \:)
    expect(filter).not.toContain("'Test's Caption");
    // The unescaped ": GitNot" should not appear - it should be escaped as "\: GitNot"
    expect(filter).toContain("\\: GitNot");
  });

  test('handles different positions', () => {
    const baseCaption: VideoCaption = {
      text: 'Test',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const topFilter = buildCaptionFilter({ ...baseCaption, position: 'top' }, safeArea, videoWidth, videoHeight);
    const centerFilter = buildCaptionFilter({ ...baseCaption, position: 'center' }, safeArea, videoWidth, videoHeight);
    const bottomFilter = buildCaptionFilter({ ...baseCaption, position: 'bottom' }, safeArea, videoWidth, videoHeight);

    // All should be valid filters
    expect(topFilter).toContain('drawtext');
    expect(centerFilter).toContain('drawtext');
    expect(bottomFilter).toContain('drawtext');
  });

  test('includes background box when backgroundColor is set', () => {
    const caption: VideoCaption = {
      text: 'Test',
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 16,
      verticalOffset: 0,
    };

    const filter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);

    // Should have drawbox for background
    expect(filter).toContain('drawbox');
  });

  test('does not include background box when backgroundColor is undefined', () => {
    const caption: VideoCaption = {
      text: 'Test',
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const filter = buildCaptionFilter(caption, safeArea, videoWidth, videoHeight);

    // Should not have drawbox
    expect(filter).not.toContain('drawbox');
  });
});

// ------------------------------------------------------------------------------------------------
// Filter Complex Builder Tests
// ------------------------------------------------------------------------------------------------

describe('video/captions - buildVideoFilterComplex', () => {
  const safeArea: VideoSafeArea = {
    top: 100,
    bottom: 100,
    left: 40,
    right: 40,
    scale: 1,
  };

  test('returns correct structure for single input', () => {
    const result = buildVideoFilterComplex(
      1,
      DEFAULT_CAPTION,
      safeArea,
      1080,
      1920,
      30,
      15,
    );

    expect(result.filterComplex).toContain('[0:v]');
    expect(result.inputArgs.length).toBeGreaterThan(0);
  });

  test('returns correct structure for multiple inputs', () => {
    const result = buildVideoFilterComplex(
      3,
      DEFAULT_CAPTION,
      safeArea,
      1080,
      1920,
      30,
      15,
    );

    expect(result.filterComplex).toContain('concat');
    expect(result.inputArgs.length).toBe(3 * 6); // -loop 1, -framerate 30, -i %d.png for each
  });

  test('includes caption filter when caption is provided', () => {
    const result = buildVideoFilterComplex(
      1,
      DEFAULT_CAPTION,
      safeArea,
      1080,
      1920,
      30,
      15,
    );

    expect(result.filterComplex).toContain('drawtext');
  });

  test('skips caption filter when caption is undefined', () => {
    const result = buildVideoFilterComplex(
      1,
      undefined,
      safeArea,
      1080,
      1920,
      30,
      15,
    );

    expect(result.filterComplex).not.toContain('drawtext');
    expect(result.filterComplex).toContain('copy');
  });
});

// ------------------------------------------------------------------------------------------------
// Caption Bounds Validation Tests
// ------------------------------------------------------------------------------------------------

describe('video/captions - validateCaptionBounds', () => {
  const safeArea: VideoSafeArea = {
    top: 120,
    bottom: 120,
    left: 40,
    right: 40,
    scale: 1,
  };

  test('returns valid for caption within safe area', () => {
    const caption: VideoCaption = {
      text: 'Short',
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionBounds(caption, safeArea, 1080, 1920);

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('returns error for oversized caption', () => {
    const caption: VideoCaption = {
      text: 'This is a very long caption that might overflow the safe area bounds',
      position: 'bottom',
      fontSizeRatio: 0.1, // Large font
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionBounds(caption, safeArea, 1080, 1920);

    // Should have warnings about font size being large
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('returns error for font size too small', () => {
    const caption: VideoCaption = {
      text: 'Test',
      position: 'bottom',
      fontSizeRatio: 0.005, // Very small
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionBounds(caption, safeArea, 1080, 1920);

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes('small for video height'))).toBe(true);
  });

  test('returns error for font size too large', () => {
    const caption: VideoCaption = {
      text: 'Test',
      position: 'bottom',
      fontSizeRatio: 0.2, // Larger than 15% max
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionBounds(caption, safeArea, 1080, 1920);

    expect(result.errors.some((e) => e.includes('exceeds maximum'))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Caption for Ratio Validation Tests
// ------------------------------------------------------------------------------------------------

describe('video/captions - validateCaptionForRatio', () => {
  test('validates successfully for vertical video with reasonable caption', () => {
    const caption: VideoCaption = {
      text: 'GitNotēs',
      position: 'bottom',
      fontSizeRatio: 0.05,
      fontWeight: 700,
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.6)',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionForRatio(caption, 'VERTICAL');

    expect(result.errors.length).toBe(0);
  });

  test('returns error for oversized caption on vertical', () => {
    const caption: VideoCaption = {
      text: 'A very long caption text that is likely to overflow the available safe area on a vertical video format',
      position: 'bottom',
      fontSizeRatio: 0.08,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 30,
      verticalOffset: 0,
    };

    const result = validateCaptionForRatio(caption, 'VERTICAL');

    // Should have warnings about size
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  test('returns valid for square video', () => {
    const caption: VideoCaption = {
      text: 'GitNotēs',
      position: 'center',
      fontSizeRatio: 0.06,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 16,
      verticalOffset: 0,
    };

    const result = validateCaptionForRatio(caption, 'SQUARE');

    expect(result.errors.length).toBe(0);
  });

  test('returns valid for horizontal video', () => {
    const caption: VideoCaption = {
      text: 'GitNotēs',
      position: 'top',
      fontSizeRatio: 0.04,
      fontWeight: 700,
      color: '#FFFFFF',
      padding: 12,
      verticalOffset: 0,
    };

    const result = validateCaptionForRatio(caption, 'HORIZONTAL');

    expect(result.errors.length).toBe(0);
  });
});
