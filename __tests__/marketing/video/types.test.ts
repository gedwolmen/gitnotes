/**
 * Marketing Asset Pipeline - Video Types Tests
 *
 * Tests for video type definitions, dimensions, and helpers.
 */

import {
  VideoRatioSchema,
  VIDEO_DIMENSIONS,
  ENCODING_PRESETS,
  VIDEO_SAFE_AREAS,
  getVideoDimensions,
  getVideoSafeArea,
  buildVideoOutput,
  validateVideoRatio,
  DEFAULT_CAPTION,
} from '../../../scripts/marketing/video/types';

// ------------------------------------------------------------------------------------------------
// Video Ratio Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - VideoRatioSchema', () => {
  test('defines three video ratios', () => {
    expect(Object.keys(VideoRatioSchema)).toHaveLength(3);
  });

  test('vertical is 9:16', () => {
    expect(VideoRatioSchema.VERTICAL).toBe('9:16');
  });

  test('square is 1:1', () => {
    expect(VideoRatioSchema.SQUARE).toBe('1:1');
  });

  test('horizontal is 16:9', () => {
    expect(VideoRatioSchema.HORIZONTAL).toBe('16:9');
  });
});

// ------------------------------------------------------------------------------------------------
// Video Dimensions Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - VIDEO_DIMENSIONS', () => {
  test('vertical has correct dimensions', () => {
    expect(VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL]).toEqual({
      width: 1080,
      height: 1920,
    });
  });

  test('square has correct dimensions', () => {
    expect(VIDEO_DIMENSIONS[VideoRatioSchema.SQUARE]).toEqual({
      width: 1080,
      height: 1080,
    });
  });

  test('horizontal has correct dimensions', () => {
    expect(VIDEO_DIMENSIONS[VideoRatioSchema.HORIZONTAL]).toEqual({
      width: 1920,
      height: 1080,
    });
  });

  test('all dimensions have same pixel count aspect', () => {
    const vertical = VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL];
    const square = VIDEO_DIMENSIONS[VideoRatioSchema.SQUARE];
    const horizontal = VIDEO_DIMENSIONS[VideoRatioSchema.HORIZONTAL];

    // Verify ratios
    expect(vertical.width / vertical.height).toBeCloseTo(9 / 16, 4);
    expect(square.width / square.height).toBeCloseTo(1, 4);
    expect(horizontal.width / horizontal.height).toBeCloseTo(16 / 9, 4);
  });
});

// ------------------------------------------------------------------------------------------------
// Encoding Presets Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - ENCODING_PRESETS', () => {
  test('app-store preset has high bitrate', () => {
    const settings = ENCODING_PRESETS['app-store'];
    expect(settings.video.bitrate).toBeGreaterThan(10000);
    expect(settings.video.profile).toBe('high');
  });

  test('social preset has moderate bitrate', () => {
    const settings = ENCODING_PRESETS['social'];
    expect(settings.video.bitrate).toBeGreaterThan(5000);
    expect(settings.video.bitrate).toBeLessThan(15000);
    expect(settings.video.profile).toBe('main');
  });

  test('minimal preset has low bitrate', () => {
    const settings = ENCODING_PRESETS['minimal'];
    expect(settings.video.bitrate).toBeLessThan(5000);
    expect(settings.video.profile).toBe('baseline');
  });

  test('all presets use yuv420p pixel format', () => {
    for (const preset of Object.values(ENCODING_PRESETS)) {
      expect(preset.pixelFormat).toBe('yuv420p');
    }
  });

  test('all presets use mp4 container', () => {
    for (const preset of Object.values(ENCODING_PRESETS)) {
      expect(preset.container).toBe('mp4');
    }
  });

  test('all presets have 30fps', () => {
    for (const preset of Object.values(ENCODING_PRESETS)) {
      expect(preset.video.fps).toBe(30);
    }
  });

  test('app-store has stereo audio', () => {
    const settings = ENCODING_PRESETS['app-store'];
    expect(settings.audio.channels).toBe(2);
    expect(settings.audio.sampleRate).toBe(44100);
  });
});

// ------------------------------------------------------------------------------------------------
// Safe Area Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - VIDEO_SAFE_AREAS', () => {
  test('vertical has largest safe area (for phone UI)', () => {
    const vertical = VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL];
    const horizontal = VIDEO_SAFE_AREAS[VideoRatioSchema.HORIZONTAL];

    expect(vertical.top).toBeGreaterThan(horizontal.top);
    expect(vertical.bottom).toBeGreaterThan(horizontal.bottom);
  });

  test('all safe areas have positive insets', () => {
    for (const safeArea of Object.values(VIDEO_SAFE_AREAS)) {
      expect(safeArea.top).toBeGreaterThanOrEqual(0);
      expect(safeArea.bottom).toBeGreaterThanOrEqual(0);
      expect(safeArea.left).toBeGreaterThanOrEqual(0);
      expect(safeArea.right).toBeGreaterThanOrEqual(0);
    }
  });
});

// ------------------------------------------------------------------------------------------------
// Helper Function Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - helper functions', () => {
  describe('getVideoDimensions', () => {
    test('returns correct dimensions for each ratio', () => {
      expect(getVideoDimensions(VideoRatioSchema.VERTICAL)).toEqual({ width: 1080, height: 1920 });
      expect(getVideoDimensions(VideoRatioSchema.SQUARE)).toEqual({ width: 1080, height: 1080 });
      expect(getVideoDimensions(VideoRatioSchema.HORIZONTAL)).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe('getVideoSafeArea', () => {
    test('returns correct safe area for each ratio', () => {
      expect(getVideoSafeArea(VideoRatioSchema.VERTICAL)).toEqual(VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL]);
      expect(getVideoSafeArea(VideoRatioSchema.SQUARE)).toEqual(VIDEO_SAFE_AREAS[VideoRatioSchema.SQUARE]);
      expect(getVideoSafeArea(VideoRatioSchema.HORIZONTAL)).toEqual(VIDEO_SAFE_AREAS[VideoRatioSchema.HORIZONTAL]);
    });
  });

  describe('buildVideoOutput', () => {
    test('builds correct output spec', () => {
      const output = buildVideoOutput(VideoRatioSchema.VERTICAL, 'social', '/output', 'video', 15);

      expect(output.ratio).toBe(VideoRatioSchema.VERTICAL);
      expect(output.dimensions).toEqual({ width: 1080, height: 1920 });
      expect(output.profile).toBe('social');
      expect(output.duration).toBe(15);
      expect(output.outputDir).toBe('/output');
      expect(output.filename).toBe('video-9x16-social.mp4');
    });

    test('uses default duration of 15 seconds', () => {
      const output = buildVideoOutput(VideoRatioSchema.SQUARE, 'app-store', '/output', 'video');
      expect(output.duration).toBe(15);
    });

    test('filename includes ratio and profile', () => {
      const verticalOutput = buildVideoOutput(VideoRatioSchema.VERTICAL, 'app-store', '/output', 'video');
      expect(verticalOutput.filename).toContain('9x16');
      expect(verticalOutput.filename).toContain('app-store');

      const squareOutput = buildVideoOutput(VideoRatioSchema.SQUARE, 'minimal', '/output', 'video');
      expect(squareOutput.filename).toContain('1x1');
      expect(squareOutput.filename).toContain('minimal');

      const horizontalOutput = buildVideoOutput(VideoRatioSchema.HORIZONTAL, 'social', '/output', 'video');
      expect(horizontalOutput.filename).toContain('16x9');
      expect(horizontalOutput.filename).toContain('social');
    });
  });

  describe('validateVideoRatio', () => {
    test('returns true for matching dimensions', () => {
      expect(validateVideoRatio(1080, 1920, VideoRatioSchema.VERTICAL)).toBe(true);
      expect(validateVideoRatio(1080, 1080, VideoRatioSchema.SQUARE)).toBe(true);
      expect(validateVideoRatio(1920, 1080, VideoRatioSchema.HORIZONTAL)).toBe(true);
    });

    test('returns false for non-matching dimensions', () => {
      expect(validateVideoRatio(1920, 1080, VideoRatioSchema.VERTICAL)).toBe(false);
      expect(validateVideoRatio(1080, 1920, VideoRatioSchema.SQUARE)).toBe(false);
      expect(validateVideoRatio(1080, 1080, VideoRatioSchema.HORIZONTAL)).toBe(false);
    });

    test('returns false for wrong aspect ratio even with same dimensions', () => {
      // 1080x1080 is square, not vertical
      expect(validateVideoRatio(1080, 1080, VideoRatioSchema.VERTICAL)).toBe(false);
    });
  });
});

// ------------------------------------------------------------------------------------------------
// Default Caption Tests
// ------------------------------------------------------------------------------------------------

describe('video/types - DEFAULT_CAPTION', () => {
  test('has required fields', () => {
    expect(DEFAULT_CAPTION.text).toBe('GitNotēs');
    expect(DEFAULT_CAPTION.position).toBe('bottom');
    expect(DEFAULT_CAPTION.fontSizeRatio).toBeGreaterThan(0);
    expect(DEFAULT_CAPTION.fontWeight).toBeGreaterThan(0);
    expect(DEFAULT_CAPTION.color).toBeDefined();
  });

  test('has reasonable font size ratio', () => {
    expect(DEFAULT_CAPTION.fontSizeRatio).toBeGreaterThanOrEqual(0.02);
    expect(DEFAULT_CAPTION.fontSizeRatio).toBeLessThanOrEqual(0.15);
  });

  test('has background color for readability', () => {
    expect(DEFAULT_CAPTION.backgroundColor).toBeDefined();
    expect(DEFAULT_CAPTION.backgroundColor).toMatch(/^rgba?\(.*\)$/);
  });
});
