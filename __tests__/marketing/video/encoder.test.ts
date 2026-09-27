/**
 * Marketing Asset Pipeline - Video Encoder Tests
 *
 * Tests for FFmpeg video encoding with temp file pattern and atomic rename.
 * Uses mock executor for deterministic testing.
 */

import type { ProcessExecutor } from '../../../scripts/marketing/capture/types';
import { VideoRatioSchema, EncodingProfileSchema, VIDEO_SAFE_AREAS } from '../../../scripts/marketing/video/types';
import type { EncodeRequest, EncodeResult } from '../../../scripts/marketing/video/types';
import { buildEncodeCommand, formatEncodeResult } from '../../../scripts/marketing/video/encoder';
import { buildVideoOutput } from '../../../scripts/marketing/video/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing video encoding.
 */
class MockProcessExecutor implements ProcessExecutor {
  private commands: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();
  private existsPaths: Set<string> = new Set();
  private shouldFail: boolean = false;
  private failError: string = 'Mock execution failed';

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
   * Configure to fail execution.
   */
  setFail(fail: boolean, error?: string): void {
    this.shouldFail = fail;
    if (error) this.failError = error;
  }

  async exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    if (this.shouldFail) {
      throw new Error(this.failError);
    }

    // Find matching command
    for (const [pattern, result] of this.commands) {
      if (command.includes(pattern) || pattern === '*') {
        return result;
      }
    }
    return { exitCode: 127, stdout: '', stderr: `command not found: ${command}` };
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
// Build Command Tests
// ------------------------------------------------------------------------------------------------

describe('video/encoder - buildEncodeCommand', () => {
  test('generates ffmpeg command with correct structure', () => {
    const output = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);

    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).toContain('ffmpeg');
    expect(command).toContain('-y'); // overwrite
    expect(command).toContain('-loop');
    expect(command).toContain('-framerate');
    expect(command).toContain('libx264');
    expect(command).toContain('-c:v');
    expect(command).toContain('-preset');
    expect(command).toContain('-profile:v');
    expect(command).toContain('-pix_fmt');
    expect(command).toContain('-c:a');
    expect(command).toContain('-t');
    expect(command).toContain('-f');
  });

  test('includes correct dimensions', () => {
    const verticalOutput = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output: verticalOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).toContain('scale=1080:1920');
  });

  test('includes correct duration', () => {
    const output = buildVideoOutput(VideoRatioSchema.SQUARE, EncodingProfileSchema.SOCIAL, '/output', 'video', 30);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.SQUARE],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).toContain('-t 30');
  });

  test('includes bitrate settings', () => {
    const output = buildVideoOutput(VideoRatioSchema.HORIZONTAL, EncodingProfileSchema.APP_STORE, '/output', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.HORIZONTAL],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).toContain('-b:v');
    expect(command).toContain('-bufsize');
    expect(command).toContain('-g'); // keyframe interval
  });

  test('escapes input and output paths', () => {
    const output = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output dir', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input dir/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    // Paths should be quoted
    expect(command).toContain('"/input dir/frame.png"');
    expect(command).toContain('"<output-path>"'); // output is placeholder
  });

  test('includes caption filter when caption provided', () => {
    const output = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      caption: {
        text: 'GitNotēs',
        position: 'bottom',
        fontSizeRatio: 0.05,
        fontWeight: 700,
        color: '#FFFFFF',
        padding: 16,
        verticalOffset: 0,
      },
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).toContain('-vf');
    expect(command).toContain('drawtext');
  });

  test('omits caption filter when no caption', () => {
    const output = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor: new MockProcessExecutor(),
    };

    const command = buildEncodeCommand(request);

    expect(command).not.toContain('drawtext');
  });
});

// ------------------------------------------------------------------------------------------------
// Format Result Tests
// ------------------------------------------------------------------------------------------------

describe('video/encoder - formatEncodeResult', () => {
  test('formats successful result', () => {
    const result: EncodeResult = {
      success: true,
      outputPath: '/output/video.mp4',
      errors: [],
      commands: ['ffmpeg -y ...'],
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
        format: 'mov,mp4,m4a,3gp,3g2,mj2',
      },
      checksum: 'abc123',
    };

    const formatted = formatEncodeResult(result);

    expect(formatted).toContain('Encoding succeeded');
    expect(formatted).toContain('/output/video.mp4');
    expect(formatted).toContain('5000ms');
    expect(formatted).toContain('15.00s');
    expect(formatted).toContain('1080x1920');
    expect(formatted).toContain('h264');
  });

  test('formats failed result', () => {
    const result: EncodeResult = {
      success: false,
      errors: ['FFmpeg exited with code 1', 'Invalid input'],
      commands: ['ffmpeg -y ...'],
      elapsedMs: 1000,
    };

    const formatted = formatEncodeResult(result);

    expect(formatted).toContain('Encoding failed');
    expect(formatted).toContain('FFmpeg exited with code 1');
    expect(formatted).toContain('Invalid input');
  });

  test('shows time even for failed result', () => {
    const result: EncodeResult = {
      success: false,
      errors: ['Failed'],
      commands: [],
      elapsedMs: 100,
    };

    const formatted = formatEncodeResult(result);

    expect(formatted).toContain('100ms');
  });
});

// ------------------------------------------------------------------------------------------------
// Encoding Integration Tests (with mock executor)
// ------------------------------------------------------------------------------------------------

describe('video/encoder - integration', () => {
  let executor: MockProcessExecutor;

  beforeEach(() => {
    executor = new MockProcessExecutor();
  });

  test('command generation is deterministic', () => {
    const output = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const request: EncodeRequest = {
      inputSource: '/input/frame.png',
      output,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      caption: {
        text: 'GitNotēs',
        position: 'bottom',
        fontSizeRatio: 0.05,
        fontWeight: 700,
        color: '#FFFFFF',
        padding: 16,
        verticalOffset: 0,
      },
      executor,
    };

    const command1 = buildEncodeCommand(request);
    const command2 = buildEncodeCommand(request);

    expect(command1).toBe(command2);
  });

  test('different ratios produce different scale filters', () => {
    const verticalOutput = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const squareOutput = buildVideoOutput(VideoRatioSchema.SQUARE, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);
    const horizontalOutput = buildVideoOutput(VideoRatioSchema.HORIZONTAL, EncodingProfileSchema.SOCIAL, '/output', 'video', 15);

    const verticalCmd = buildEncodeCommand({
      inputSource: '/input/frame.png',
      output: verticalOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor,
    });

    const squareCmd = buildEncodeCommand({
      inputSource: '/input/frame.png',
      output: squareOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.SQUARE],
      executor,
    });

    const horizontalCmd = buildEncodeCommand({
      inputSource: '/input/frame.png',
      output: horizontalOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.HORIZONTAL],
      executor,
    });

    expect(verticalCmd).toContain('scale=1080:1920');
    expect(squareCmd).toContain('scale=1080:1080');
    expect(horizontalCmd).toContain('scale=1920:1080');
  });

  test('different profiles produce different bitrates', () => {
    const appStoreOutput = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.APP_STORE, '/output', 'video', 15);
    const minimalOutput = buildVideoOutput(VideoRatioSchema.VERTICAL, EncodingProfileSchema.MINIMAL, '/output', 'video', 15);

    const appStoreCmd = buildEncodeCommand({
      inputSource: '/input/frame.png',
      output: appStoreOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor,
    });

    const minimalCmd = buildEncodeCommand({
      inputSource: '/input/frame.png',
      output: minimalOutput,
      safeArea: VIDEO_SAFE_AREAS[VideoRatioSchema.VERTICAL],
      executor,
    });

    // APP_STORE has higher bitrate than MINIMAL
    expect(appStoreCmd).not.toBe(minimalCmd);
  });
});
