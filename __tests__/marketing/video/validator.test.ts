/**
 * Marketing Asset Pipeline - Video Validator Tests
 *
 * Tests for ffprobe-based video validation.
 * Uses mock executor to simulate ffprobe responses.
 */

import type { ProcessExecutor } from '../../../scripts/marketing/capture/types';
import { VideoRatioSchema } from '../../../scripts/marketing/video/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing video validation.
 */
class _MockProcessExecutor implements ProcessExecutor {
  private commands: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();
  private existsPaths: Set<string> = new Set();

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

  async exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
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
// Mock FFProbe Responses
// ------------------------------------------------------------------------------------------------

const VALID_1080P_H264_MP4 = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '2048576',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '15.00',
    bit_rate: '1094565',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1080,
      height: 1920,
      r_frame_rate: '30/1',
      bit_rate: '1000000',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      bit_rate: '128000',
      sample_rate: '44100',
      channels: 2,
    },
  ],
});

const VALID_1080P_SQUARE = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '1536000',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '15.00',
    bit_rate: '819200',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'libx264',
      width: 1080,
      height: 1080,
      r_frame_rate: '30/1',
      bit_rate: '750000',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      bit_rate: '128000',
      sample_rate: '44100',
      channels: 2,
    },
  ],
});

const VALID_1920X1080_HORIZONTAL = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '3072000',
    format_name: 'mp4',
    duration: '15.00',
    bit_rate: '1638400',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264_videotoolbox',
      width: 1920,
      height: 1080,
      r_frame_rate: '30/1',
      bit_rate: '1500000',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      bit_rate: '256000',
      sample_rate: '44100',
      channels: 2,
    },
  ],
});

const INVALID_CODEC = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '1024000',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '15.00',
    bit_rate: '819200',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'vp9',
      width: 1080,
      height: 1920,
      r_frame_rate: '30/1',
      bit_rate: '750000',
    },
    {
      codec_type: 'audio',
      codec_name: 'opus',
      bit_rate: '96000',
      sample_rate: '48000',
      channels: 1,
    },
  ],
});

const WRONG_DURATION = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '1536000',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '30.00', // Should be 15
    bit_rate: '819200',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1080,
      height: 1920,
      r_frame_rate: '30/1',
      bit_rate: '750000',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      bit_rate: '128000',
      sample_rate: '44100',
      channels: 2,
    },
  ],
});

const WRONG_FPS = JSON.stringify({
  format: {
    filename: '/output/video.mp4',
    size: '1536000',
    format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
    duration: '15.00',
    bit_rate: '819200',
  },
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1080,
      height: 1920,
      r_frame_rate: '60/1', // Should be 30
      bit_rate: '750000',
    },
    {
      codec_type: 'audio',
      codec_name: 'aac',
      bit_rate: '128000',
      sample_rate: '44100',
      channels: 2,
    },
  ],
});

// ------------------------------------------------------------------------------------------------
// Validation Rule Tests
// ------------------------------------------------------------------------------------------------

import {
  validateDuration,
  validateFPS,
  validateDimensions,
  validateVideoCodec,
  validateAudioCodec,
  validateVideoBitrate,
  validateFileSize,
  validateContainer,
} from '../../../scripts/marketing/video/validator';

describe('video/validator - validation rules', () => {
  describe('validateDuration', () => {
    test('returns valid when duration matches expected', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateDuration(metadata, 15);
      expect(result.valid).toBe(true);
    });

    test('returns valid within tolerance', () => {
      const metadata = { duration: 15.4, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateDuration(metadata, 15, 0.5);
      expect(result.valid).toBe(true);
    });

    test('returns error when duration outside tolerance', () => {
      const metadata = { duration: 16.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateDuration(metadata, 15, 0.5);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Duration mismatch');
    });
  });

  describe('validateFPS', () => {
    test('returns valid when FPS matches expected', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateFPS(metadata, 30);
      expect(result.valid).toBe(true);
    });

    test('returns valid within tolerance', () => {
      const metadata = { duration: 15.0, fps: '31/1', fpsDecimal: 31, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateFPS(metadata, 30, 1);
      expect(result.valid).toBe(true);
    });

    test('returns error when FPS outside tolerance', () => {
      const metadata = { duration: 15.0, fps: '60/1', fpsDecimal: 60, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateFPS(metadata, 30, 1);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('FPS mismatch');
    });
  });

  describe('validateDimensions', () => {
    test('returns valid for matching dimensions', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateDimensions(metadata, VideoRatioSchema.VERTICAL);
      expect(result.valid).toBe(true);
    });

    test('returns error for non-matching dimensions', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1920, height: 1080, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateDimensions(metadata, VideoRatioSchema.VERTICAL);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Dimensions mismatch');
    });
  });

  describe('validateVideoCodec', () => {
    test('returns valid for h264', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateVideoCodec(metadata);
      expect(result.valid).toBe(true);
    });

    test('returns valid for libx264', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'libx264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateVideoCodec(metadata);
      expect(result.valid).toBe(true);
    });

    test('returns error for non-h264 codec', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'vp9', audioCodec: 'opus', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateVideoCodec(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be H.264');
    });
  });

  describe('validateAudioCodec', () => {
    test('returns valid for aac', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateAudioCodec(metadata);
      expect(result.valid).toBe(true);
    });

    test('returns error for non-aac codec', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'mp3', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateAudioCodec(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('must be AAC');
    });
  });

  describe('validateVideoBitrate', () => {
    test('returns valid within range', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateVideoBitrate(metadata, 5000, 10000);
      expect(result.valid).toBe(true);
    });

    test('returns error outside range', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 2000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateVideoBitrate(metadata, 5000, 10000);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('bitrate out of range');
    });
  });

  describe('validateFileSize', () => {
    test('returns valid for reasonable size', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mp4' };
      const result = validateFileSize(metadata);
      expect(result.valid).toBe(true);
    });

    test('returns error for file too small', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 100, format: 'mp4' };
      const result = validateFileSize(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('too small');
    });

    test('returns error for file too large', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 600 * 1024 * 1024, format: 'mp4' };
      const result = validateFileSize(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('exceeds limit');
    });
  });

  describe('validateContainer', () => {
    test('returns valid for mp4', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'mov,mp4,m4a,3gp,3g2,mj2' };
      const result = validateContainer(metadata);
      expect(result.valid).toBe(true);
    });

    test('returns error for non-mp4 container', () => {
      const metadata = { duration: 15.0, fps: '30/1', fpsDecimal: 30, width: 1080, height: 1920, videoCodec: 'h264', audioCodec: 'aac', videoBitrate: 8000, audioBitrate: 128, numStreams: 2, sizeBytes: 2000000, format: 'webm' };
      const result = validateContainer(metadata);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Container format must be MP4/MOV');
    });
  });
});
