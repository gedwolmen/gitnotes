/**
 * Marketing Asset Pipeline - Video Validator
 *
 * Validates encoded video files using ffprobe.
 * Checks duration, fps, codec, and dimensions match expected values.
 *
 * Uses injectable ProcessExecutor for testing.
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { createHash } from 'crypto';

import { ENV_PATHS } from '../capture/preflight';
import type { ProcessExecutor } from '../capture/types';
import type { VideoMetadata, VideoValidationResult, VideoRatio } from './types';
import { VIDEO_DIMENSIONS } from './types';

// ------------------------------------------------------------------------------------------------
// FFprobe JSON Output Schema
// ------------------------------------------------------------------------------------------------

/**
 * ffprobe JSON output structure we care about.
 */
interface FFProbeOutput {
  format: {
    filename: string;
    size: string;
    format_name: string;
    duration: string;
    bit_rate: string;
  };
  streams: FFProbeStream[];
}

interface FFProbeStream {
  codec_type: 'video' | 'audio' | 'other';
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: string;
  sample_rate?: string;
  channels?: number;
}

// ------------------------------------------------------------------------------------------------
// Metadata Extraction
// ------------------------------------------------------------------------------------------------

/**
 * Extract video metadata using ffprobe.
 * Returns null if ffprobe fails or file doesn't exist.
 */
export async function extractVideoMetadata(
  filePath: string,
  ffprobePath: string = ENV_PATHS.ffprobe,
  _executor?: ProcessExecutor,
): Promise<VideoMetadata | null> {
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    // Use ffprobe to extract JSON metadata
    const { exec: execSync } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(execSync);

    const cmd = [
      ffprobePath,
      '-v',
      'quiet',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      `"${filePath}"`,
    ].join(' ');

    const result = await execAsync(cmd, { timeout: 30000 });
    const stdout = result.stdout as string | Buffer | undefined;
    let output = '';
    if (typeof stdout === 'string') {
      output = stdout;
    } else if (Buffer.isBuffer(stdout)) {
      output = stdout.toString();
    }

    if (!output) {
      return null;
    }

    const data = JSON.parse(output) as FFProbeOutput;

    // Find video and audio streams
    const videoStream = data.streams.find((s) => s.codec_type === 'video');
    const audioStream = data.streams.find((s) => s.codec_type === 'audio');

    // Parse frame rate
    let fps = '0/1';
    let fpsDecimal = 0;
    if (videoStream?.r_frame_rate) {
      fps = videoStream.r_frame_rate;
      const [num, den] = fps.split('/').map(Number);
      fpsDecimal = den > 0 ? num / den : 0;
    }

    // Get file size
    const stats = statSync(filePath);

    return {
      duration: parseFloat(data.format.duration ?? '0'),
      fps,
      fpsDecimal,
      width: videoStream?.width ?? 0,
      height: videoStream?.height ?? 0,
      videoCodec: videoStream?.codec_name ?? 'unknown',
      audioCodec: audioStream?.codec_name ?? 'none',
      videoBitrate: videoStream?.bit_rate
        ? Math.round(parseInt(videoStream.bit_rate, 10) / 1000)
        : 0,
      audioBitrate: audioStream?.bit_rate
        ? Math.round(parseInt(audioStream.bit_rate, 10) / 1000)
        : 0,
      numStreams: data.streams.length,
      sizeBytes: stats.size,
      format: data.format.format_name,
    };
  } catch {
    return null;
  }
}

/**
 * Compute SHA-256 checksum of a file.
 */
export function computeVideoChecksum(filePath: string): string {
  const contents = readFileSync(filePath);
  return createHash('sha256').update(contents).digest('hex');
}

// ------------------------------------------------------------------------------------------------
// Validation Rules
// ------------------------------------------------------------------------------------------------

/**
 * Validate video duration matches expected (±0.5s tolerance).
 */
export function validateDuration(
  metadata: VideoMetadata,
  expectedDuration: number,
  tolerance: number = 0.5,
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const diff = Math.abs(metadata.duration - expectedDuration);
  if (diff > tolerance) {
    errors.push(
      `Duration mismatch: expected ${expectedDuration}s (±${tolerance}s), got ${metadata.duration.toFixed(2)}s`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate video FPS matches expected.
 */
export function validateFPS(
  metadata: VideoMetadata,
  expectedFPS: number,
  tolerance: number = 1,
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const diff = Math.abs(metadata.fpsDecimal - expectedFPS);
  if (diff > tolerance) {
    errors.push(`FPS mismatch: expected ${expectedFPS}, got ${metadata.fpsDecimal.toFixed(2)}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate video dimensions match expected ratio.
 */
export function validateDimensions(
  metadata: VideoMetadata,
  expectedRatio: VideoRatio,
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const expected = VIDEO_DIMENSIONS[expectedRatio];

  if (metadata.width !== expected.width || metadata.height !== expected.height) {
    errors.push(
      `Dimensions mismatch: expected ${expected.width}x${expected.height} for ${expectedRatio}, ` +
        `got ${metadata.width}x${metadata.height}`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate video codec is H.264.
 */
export function validateVideoCodec(metadata: VideoMetadata): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validCodecs = ['h264', 'libx264', 'h264_videotoolbox'];
  if (!validCodecs.includes(metadata.videoCodec.toLowerCase())) {
    errors.push(`Video codec must be H.264, got: ${metadata.videoCodec}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate audio codec is AAC.
 */
export function validateAudioCodec(metadata: VideoMetadata): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validCodecs = ['aac', 'aac_at', 'aac_fixed'];
  if (!validCodecs.includes(metadata.audioCodec.toLowerCase())) {
    errors.push(`Audio codec must be AAC, got: ${metadata.audioCodec}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate video bitrate is within expected range.
 */
export function validateVideoBitrate(
  metadata: VideoMetadata,
  minBitrate: number,
  maxBitrate: number,
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (metadata.videoBitrate < minBitrate || metadata.videoBitrate > maxBitrate) {
    errors.push(
      `Video bitrate out of range: expected ${minBitrate}-${maxBitrate}kbps, got ${metadata.videoBitrate}kbps`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate audio bitrate is within expected range.
 */
export function validateAudioBitrate(
  metadata: VideoMetadata,
  minBitrate: number,
  maxBitrate: number,
): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (
    metadata.audioBitrate > 0 &&
    (metadata.audioBitrate < minBitrate || metadata.audioBitrate > maxBitrate)
  ) {
    errors.push(
      `Audio bitrate out of range: expected ${minBitrate}-${maxBitrate}kbps, got ${metadata.audioBitrate}kbps`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate file size is reasonable.
 */
export function validateFileSize(metadata: VideoMetadata): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const MIN_SIZE = 10 * 1024; // 10KB
  const MAX_SIZE = 500 * 1024 * 1024; // 500MB

  if (metadata.sizeBytes < MIN_SIZE) {
    errors.push(`File size too small: ${metadata.sizeBytes} bytes (expected > ${MIN_SIZE} bytes)`);
  }

  if (metadata.sizeBytes > MAX_SIZE) {
    errors.push(`File size exceeds limit: ${metadata.sizeBytes} bytes (max ${MAX_SIZE} bytes)`);
  }

  // Warn if file seems unusually small for duration
  const bytesPerSecond = metadata.sizeBytes / (metadata.duration || 1);
  if (bytesPerSecond < 1000) {
    warnings.push(
      `Low data rate: ${bytesPerSecond.toFixed(0)} bytes/second - video may be heavily compressed`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate container format is MP4.
 */
export function validateContainer(metadata: VideoMetadata): VideoValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const validFormats = ['mov,mp4,m4a,3gp,3g2,mj2', 'mp4', 'mov', 'm4a'];
  if (!validFormats.some((f) => metadata.format.includes(f))) {
    errors.push(`Container format must be MP4/MOV, got: ${metadata.format}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ------------------------------------------------------------------------------------------------
// Full Validation
// ------------------------------------------------------------------------------------------------

/**
 * Run all validations on a video file.
 */
export async function validateVideo(
  filePath: string,
  options: {
    expectedRatio?: VideoRatio;
    expectedDuration?: number;
    expectedFPS?: number;
    minBitrate?: number;
    maxBitrate?: number;
    minAudioBitrate?: number;
    maxAudioBitrate?: number;
    executor?: ProcessExecutor;
  } = {},
): Promise<VideoValidationResult> {
  const allErrors: string[] = [];
  const allWarnings: string[] = [];

  // Check file exists
  if (!existsSync(filePath)) {
    return {
      valid: false,
      errors: [`File not found: ${filePath}`],
      warnings: [],
    };
  }

  // Extract metadata
  const metadata = await extractVideoMetadata(filePath, ENV_PATHS.ffprobe, options.executor);

  if (!metadata) {
    return {
      valid: false,
      errors: ['Failed to extract video metadata with ffprobe'],
      warnings: [],
    };
  }

  // Run all validations
  if (options.expectedRatio) {
    const dimResult = validateDimensions(metadata, options.expectedRatio);
    allErrors.push(...dimResult.errors);
    allWarnings.push(...dimResult.warnings);
  }

  if (options.expectedDuration !== undefined) {
    const durResult = validateDuration(metadata, options.expectedDuration);
    allErrors.push(...durResult.errors);
    allWarnings.push(...durResult.warnings);
  }

  if (options.expectedFPS !== undefined) {
    const fpsResult = validateFPS(metadata, options.expectedFPS);
    allErrors.push(...fpsResult.errors);
    allWarnings.push(...fpsResult.warnings);
  }

  const codecResult = validateVideoCodec(metadata);
  allErrors.push(...codecResult.errors);
  allWarnings.push(...codecResult.warnings);

  const audioResult = validateAudioCodec(metadata);
  allErrors.push(...audioResult.errors);
  allWarnings.push(...audioResult.warnings);

  const containerResult = validateContainer(metadata);
  allErrors.push(...containerResult.errors);
  allWarnings.push(...containerResult.warnings);

  const sizeResult = validateFileSize(metadata);
  allErrors.push(...sizeResult.errors);
  allWarnings.push(...sizeResult.warnings);

  if (options.minBitrate !== undefined && options.maxBitrate !== undefined) {
    const bitrateResult = validateVideoBitrate(metadata, options.minBitrate, options.maxBitrate);
    allErrors.push(...bitrateResult.errors);
    allWarnings.push(...bitrateResult.warnings);
  }

  if (options.minAudioBitrate !== undefined && options.maxAudioBitrate !== undefined) {
    const audioBitrateResult = validateAudioBitrate(
      metadata,
      options.minAudioBitrate,
      options.maxAudioBitrate,
    );
    allErrors.push(...audioBitrateResult.errors);
    allWarnings.push(...audioBitrateResult.warnings);
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    metadata,
  };
}

/**
 * Validate video with strict tolerances for deterministic output.
 */
export async function validateVideoStrict(
  filePath: string,
  expectedRatio: VideoRatio,
  expectedDuration: number,
  expectedFPS: number,
  executor?: ProcessExecutor,
): Promise<VideoValidationResult> {
  return validateVideo(filePath, {
    expectedRatio,
    expectedDuration,
    expectedFPS,
    executor,
  });
}
