/**
 * Marketing Asset Pipeline - Video Index Tests
 *
 * Tests for video export orchestration.
 */

import type { ProcessExecutor } from '../../../scripts/marketing/capture/types';
import {
  VIDEO_OUTPUT_DIRS,
  formatVideoExportResult,
  APPLE_VIDEO_SPECS,
  GOOGLE_PLAY_VIDEO_SPECS,
} from '../../../scripts/marketing/video/index';
import { VideoRatioSchema, VIDEO_DIMENSIONS, getVideoSafeArea } from '../../../scripts/marketing/video/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing video export.
 */
class _MockProcessExecutor implements ProcessExecutor {
  private commands: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();
  private existsPaths: Set<string> = new Set();
  private ffmpegAvailable: boolean = true;
  private ffprobeAvailable: boolean = true;

  /**
   * Set a command result.
   */
  setCommand(path: string, result: { exitCode: number; stdout?: string; stderr?: string }): void {
    this.commands.set(path, {
      exitCode: result.exitCode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
  }

  /**
   * Set which paths exist.
   */
  setExists(path: string, exists: boolean): void {
    if (exists) {
      this.existsPaths.add(path);
    } else {
      this.existsPaths.delete(path);
    }
  }

  /**
   * Set FFmpeg availability.
   */
  setFFmpegAvailable(available: boolean): void {
    this.ffmpegAvailable = available;
  }

  /**
   * Set FFprobe availability.
   */
  setFFprobeAvailable(available: boolean): void {
    this.ffprobeAvailable = available;
  }

  async exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Check for ffmpeg/ffprobe version commands
    if (command.includes('ffmpeg') && command.includes('version')) {
      return this.ffmpegAvailable
        ? { exitCode: 0, stdout: 'ffmpeg version 6.0', stderr: '' }
        : { exitCode: 127, stdout: '', stderr: 'ffmpeg not found' };
    }
    if (command.includes('ffprobe') && command.includes('version')) {
      return this.ffprobeAvailable
        ? { exitCode: 0, stdout: 'ffprobe version 6.0', stderr: '' }
        : { exitCode: 127, stdout: '', stderr: 'ffprobe not found' };
    }

    for (const [pattern, result] of this.commands) {
      if (command.includes(pattern) || pattern === '*') {
        return result;
      }
    }
    return { exitCode: 0, stdout: '', stderr: '' };
  }

  async exists(path: string): Promise<boolean> {
    return this.existsPaths.has(path);
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
    if (!this.existsPaths.has(path)) {
      return null;
    }
    return { size: 1000000, mtimeMs: Date.now() };
  }
}

// ------------------------------------------------------------------------------------------------
// Output Directories Tests
// ------------------------------------------------------------------------------------------------

describe('video/index - VIDEO_OUTPUT_DIRS', () => {
  test('has runs and exports subdirectories', () => {
    expect(VIDEO_OUTPUT_DIRS.runs).toBe('assets/marketing/video/runs');
    expect(VIDEO_OUTPUT_DIRS.exports).toBe('assets/marketing/video/exports');
  });

  test('all paths are under assets/marketing', () => {
    for (const dir of Object.values(VIDEO_OUTPUT_DIRS)) {
      expect(dir.startsWith('assets/marketing/')).toBe(true);
    }
  });
});

// ------------------------------------------------------------------------------------------------
// Platform Specs Tests
// ------------------------------------------------------------------------------------------------

describe('video/index - Platform specs', () => {
  describe('APPLE_VIDEO_SPECS', () => {
    test('has specs for all three ratios', () => {
      expect(APPLE_VIDEO_SPECS[VideoRatioSchema.VERTICAL]).toBeDefined();
      expect(APPLE_VIDEO_SPECS[VideoRatioSchema.SQUARE]).toBeDefined();
      expect(APPLE_VIDEO_SPECS[VideoRatioSchema.HORIZONTAL]).toBeDefined();
    });

    test('vertical has correct dimensions', () => {
      const spec = APPLE_VIDEO_SPECS[VideoRatioSchema.VERTICAL];
      expect(spec.dimensions).toEqual(VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL]);
    });

    test('all have H.264 codec', () => {
      for (const spec of Object.values(APPLE_VIDEO_SPECS)) {
        expect(spec.codec).toBe('H.264');
      }
    });

    test('all have Apple App Store platform', () => {
      for (const spec of Object.values(APPLE_VIDEO_SPECS)) {
        expect(spec.platform).toBe('apple-app-store');
      }
    });

    test('duration limits are appropriate', () => {
      for (const spec of Object.values(APPLE_VIDEO_SPECS)) {
        expect(spec.minDuration).toBeGreaterThanOrEqual(10);
        expect(spec.maxDuration).toBeLessThanOrEqual(120);
        expect(spec.minDuration).toBeLessThan(spec.maxDuration);
      }
    });
  });

  describe('GOOGLE_PLAY_VIDEO_SPECS', () => {
    test('has specs for all three ratios', () => {
      expect(GOOGLE_PLAY_VIDEO_SPECS[VideoRatioSchema.VERTICAL]).toBeDefined();
      expect(GOOGLE_PLAY_VIDEO_SPECS[VideoRatioSchema.SQUARE]).toBeDefined();
      expect(GOOGLE_PLAY_VIDEO_SPECS[VideoRatioSchema.HORIZONTAL]).toBeDefined();
    });

    test('all have H.264 codec', () => {
      for (const spec of Object.values(GOOGLE_PLAY_VIDEO_SPECS)) {
        expect(spec.codec).toBe('H.264');
      }
    });

    test('all have Google Play platform', () => {
      for (const spec of Object.values(GOOGLE_PLAY_VIDEO_SPECS)) {
        expect(spec.platform).toBe('google-play');
      }
    });

    test('Google Play allows longer videos than Apple', () => {
      for (const ratio of Object.keys(APPLE_VIDEO_SPECS)) {
        const apple = APPLE_VIDEO_SPECS[ratio as keyof typeof APPLE_VIDEO_SPECS];
        const google = GOOGLE_PLAY_VIDEO_SPECS[ratio as keyof typeof GOOGLE_PLAY_VIDEO_SPECS];
        expect(google.maxDuration).toBeGreaterThanOrEqual(apple.maxDuration);
      }
    });
  });
});

// ------------------------------------------------------------------------------------------------
// Format Result Tests
// ------------------------------------------------------------------------------------------------

describe('video/index - formatVideoExportResult', () => {
  test('formats successful result', () => {
    const result = {
      runId: 'video-123-abc',
      success: true,
      exports: [
        {
          ratio: VideoRatioSchema.VERTICAL,
          outputPath: '/output/video-9x16.mp4',
          encodeResult: {
            success: true,
            outputPath: '/output/video-9x16.mp4',
            errors: [],
            commands: [],
            elapsedMs: 5000,
            metadata: {
              duration: 15.0,
              fps: '30/1',
              fpsDecimal: 30,
              width: 1080,
              height: 1920,
              videoCodec: 'h264',
              audioCodec: 'aac',
              videoBitrate: 8000,
              audioBitrate: 128,
              numStreams: 2,
              sizeBytes: 2048576,
              format: 'mp4',
            },
          },
        },
        {
          ratio: VideoRatioSchema.SQUARE,
          outputPath: '/output/video-1x1.mp4',
          encodeResult: {
            success: true,
            outputPath: '/output/video-1x1.mp4',
            errors: [],
            commands: [],
            elapsedMs: 4500,
            metadata: {
              duration: 15.0,
              fps: '30/1',
              fpsDecimal: 30,
              width: 1080,
              height: 1080,
              videoCodec: 'h264',
              audioCodec: 'aac',
              videoBitrate: 8000,
              audioBitrate: 128,
              numStreams: 2,
              sizeBytes: 1536000,
              format: 'mp4',
            },
          },
        },
        {
          ratio: VideoRatioSchema.HORIZONTAL,
          outputPath: '/output/video-16x9.mp4',
          encodeResult: {
            success: true,
            outputPath: '/output/video-16x9.mp4',
            errors: [],
            commands: [],
            elapsedMs: 6000,
            metadata: {
              duration: 15.0,
              fps: '30/1',
              fpsDecimal: 30,
              width: 1920,
              height: 1080,
              videoCodec: 'h264',
              audioCodec: 'aac',
              videoBitrate: 8000,
              audioBitrate: 128,
              numStreams: 2,
              sizeBytes: 3072000,
              format: 'mp4',
            },
          },
        },
      ],
      preflight: {
        allAvailable: true,
        tools: [],
        ffmpegAvailable: true,
        ffprobeAvailable: true,
        playwrightAvailable: false,
        ios: { xcrunAvailable: false, simulators: [] },
      },
      errors: [],
      elapsedMs: 15500,
    };

    const formatted = formatVideoExportResult(result);

    expect(formatted).toContain('SUCCESS');
    expect(formatted).toContain('video-123-abc');
    expect(formatted).toContain('9:16');
    expect(formatted).toContain('1:1');
    expect(formatted).toContain('16:9');
    expect(formatted).toContain('FFmpeg: ✓');
    expect(formatted).toContain('FFprobe: ✓');
  });

  test('formats failed result', () => {
    const result = {
      runId: 'video-456-def',
      success: false,
      exports: [
        {
          ratio: VideoRatioSchema.VERTICAL,
          encodeResult: {
            success: false,
            errors: ['FFmpeg not found'],
            commands: [],
            elapsedMs: 0,
          },
        },
      ],
      preflight: {
        allAvailable: false,
        tools: [],
        ffmpegAvailable: false,
        ffprobeAvailable: true,
        playwrightAvailable: false,
        ios: { xcrunAvailable: false, simulators: [] },
      },
      errors: ['FFmpeg not available'],
      elapsedMs: 100,
    };

    const formatted = formatVideoExportResult(result);

    expect(formatted).toContain('FAILED');
    expect(formatted).toContain('FFmpeg not available');
    expect(formatted).toContain('FFmpeg: ✗');
  });

  test('shows dry-run commands when present', () => {
    const result = {
      runId: 'video-789-ghi',
      success: true,
      exports: [
        {
          ratio: VideoRatioSchema.VERTICAL,
          command: 'ffmpeg -y -loop 1 ...',
        },
      ],
      preflight: {
        allAvailable: true,
        tools: [],
        ffmpegAvailable: true,
        ffprobeAvailable: true,
        playwrightAvailable: false,
        ios: { xcrunAvailable: false, simulators: [] },
      },
      errors: [],
      elapsedMs: 50,
    };

    const formatted = formatVideoExportResult(result);

    expect(formatted).toContain('ffmpeg -y -loop 1 ...');
  });
});

// ------------------------------------------------------------------------------------------------
// Ratio Consistency Tests
// ------------------------------------------------------------------------------------------------

describe('video/index - Ratio consistency', () => {
  test('all ratios have matching dimensions and safe areas', () => {
    const ratios = [
      VideoRatioSchema.VERTICAL,
      VideoRatioSchema.SQUARE,
      VideoRatioSchema.HORIZONTAL,
    ];

    for (const ratio of ratios) {
      const dims = VIDEO_DIMENSIONS[ratio];
      const safeArea = getVideoSafeArea(ratio);

      expect(dims.width).toBeGreaterThan(0);
      expect(dims.height).toBeGreaterThan(0);
      expect(safeArea.top).toBeGreaterThanOrEqual(0);
      expect(safeArea.bottom).toBeGreaterThanOrEqual(0);
      expect(safeArea.left).toBeGreaterThanOrEqual(0);
      expect(safeArea.right).toBeGreaterThanOrEqual(0);

      // Safe area should not exceed dimensions
      expect(safeArea.top + safeArea.bottom).toBeLessThan(dims.height);
      expect(safeArea.left + safeArea.right).toBeLessThan(dims.width);
    }
  });

  test('vertical ratio is actually vertical (taller than wide)', () => {
    const dims = VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL];
    expect(dims.height).toBeGreaterThan(dims.width);
    expect(dims.width / dims.height).toBeCloseTo(9 / 16, 2);
  });

  test('square ratio is actually square', () => {
    const dims = VIDEO_DIMENSIONS[VideoRatioSchema.SQUARE];
    expect(dims.width).toBe(dims.height);
  });

  test('horizontal ratio is actually horizontal (wider than tall)', () => {
    const dims = VIDEO_DIMENSIONS[VideoRatioSchema.HORIZONTAL];
    expect(dims.width).toBeGreaterThan(dims.height);
    expect(dims.width / dims.height).toBeCloseTo(16 / 9, 2);
  });
});
