/**
 * Marketing Asset Pipeline - Video Encoder
 *
 * FFmpeg-based video encoding with H.264/AAC.
 * Uses temp file pattern: encode to temp path, validate with ffprobe, atomic rename.
 * Cleans up on errors, interruption, and invalid probe results.
 *
 * References:
 * - FFmpeg H.264 encoding: https://trac.ffmpeg.org/wiki/Encode/H.264
 * - FFmpeg AAC encoding: https://trac.ffmpeg.org/wiki/Encode/AAC
 */

import { existsSync, unlinkSync, renameSync, mkdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

import type { ProcessExecutor } from '../capture/types';
import {
  type EncodeRequest,
  type EncodeResult,
  type EncodingSettings,
  ENCODING_PRESETS,
} from './types';
import { buildCaptionFilter } from './captions';
import { validateVideoStrict, computeVideoChecksum } from './validator';

// ------------------------------------------------------------------------------------------------
// Encoding Constants
// ------------------------------------------------------------------------------------------------

/** Default encoding timeout (5 minutes) */
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

/** Minimum valid output file size (1KB) */
const MIN_OUTPUT_SIZE = 1024;

// ------------------------------------------------------------------------------------------------
// Main Encoding Function
// ------------------------------------------------------------------------------------------------

/**
 * Encode a video from input source with optional caption overlay.
 *
 * @param request - Encoding request
 * @returns Encoding result with output path and metadata
 */
export async function encodeVideo(request: EncodeRequest): Promise<EncodeResult> {
  const startTime = Date.now();
  const commands: string[] = [];

  // Resolve executor
  const executor = request.executor ?? (await getDefaultExecutor());

  // Get encoding settings
  const settings = request.encodingSettings
    ? { ...ENCODING_PRESETS[request.output.profile], ...request.encodingSettings }
    : ENCODING_PRESETS[request.output.profile];

  // Build output paths
  const outputDir = resolve(request.output.outputDir);
  const tempPath = join(outputDir, `.tmp-${request.output.filename}`);
  const finalPath = join(outputDir, request.output.filename);

  // Clean up any existing temp file
  if (existsSync(tempPath)) {
    try {
      unlinkSync(tempPath);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Build FFmpeg command
  const ffmpegCmd = buildFFmpegCommand(request, settings, tempPath);
  commands.push(ffmpegCmd);

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Execute encoding
  try {
    const result = await executor.exec(ffmpegCmd, {
      timeoutMs: DEFAULT_TIMEOUT_MS,
      capture: true,
    });

    if (result.exitCode !== 0) {
      // Clean up temp file on failure
      cleanupTemp(tempPath);
      return {
        success: false,
        errors: [`FFmpeg exited with code ${result.exitCode}: ${result.stderr}`],
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }
  } catch (error) {
    cleanupTemp(tempPath);
    return {
      success: false,
      errors: [
        `FFmpeg execution failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Validate temp file exists and has content
  if (!existsSync(tempPath)) {
    return {
      success: false,
      errors: ['FFmpeg completed but output file was not created'],
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  const stats = statSync(tempPath);
  if (stats.size < MIN_OUTPUT_SIZE) {
    cleanupTemp(tempPath);
    return {
      success: false,
      errors: [`Output file too small (${stats.size} bytes) - likely invalid`],
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Validate with ffprobe
  let metadata;
  try {
    const validationResult = await validateVideoStrict(
      tempPath,
      request.output.ratio,
      request.output.duration,
      settings.video.fps,
      executor,
    );

    if (!validationResult.valid) {
      cleanupTemp(tempPath);
      return {
        success: false,
        errors: validationResult.errors,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    metadata = validationResult.metadata;
  } catch (error) {
    cleanupTemp(tempPath);
    return {
      success: false,
      errors: [
        `FFprobe validation failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Atomic rename to final path
  try {
    // Check if final path exists and we shouldn't overwrite
    if (existsSync(finalPath) && !request.overwrite) {
      cleanupTemp(tempPath);
      return {
        success: false,
        errors: [`Output file exists (use overwrite to replace): ${finalPath}`],
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Delete existing final file if overwrite
    if (existsSync(finalPath)) {
      unlinkSync(finalPath);
    }

    renameSync(tempPath, finalPath);
  } catch (error) {
    cleanupTemp(tempPath);
    return {
      success: false,
      errors: [`Atomic rename failed: ${error instanceof Error ? error.message : String(error)}`],
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Compute checksum
  const checksum = computeVideoChecksum(finalPath);

  return {
    success: true,
    outputPath: finalPath,
    errors: [],
    commands,
    elapsedMs: Date.now() - startTime,
    metadata,
    checksum,
  };
}

/**
 * Build the FFmpeg command for encoding.
 */
function buildFFmpegCommand(
  request: EncodeRequest,
  settings: EncodingSettings,
  outputPath: string,
): string {
  const { output, caption, safeArea } = request;
  const parts: string[] = ['ffmpeg', '-y']; // -y to overwrite

  // Input settings for image sequence
  parts.push('-loop', '1');
  parts.push('-framerate', String(settings.video.fps));
  parts.push('-i', `"${request.inputSource}"`);

  // Video filter complex
  const filters: string[] = [];

  // Scale to exact dimensions
  filters.push(`scale=${output.dimensions.width}:${output.dimensions.height}`);

  // Add caption overlay if specified
  if (caption) {
    const captionFilter = buildCaptionFilter(
      caption,
      safeArea,
      output.dimensions.width,
      output.dimensions.height,
    );
    filters.push(captionFilter);
  }

  if (filters.length > 0) {
    parts.push('-vf', `"${filters.join(',')}"`);
  }

  // Video encoding settings
  parts.push('-c:v', 'libx264');
  parts.push('-preset', 'medium');
  parts.push('-profile:v', settings.video.profile);
  parts.push('-level:v', settings.video.level);
  parts.push('-b:v', `${settings.video.bitrate}k`);

  if (settings.video.maxBitrate) {
    parts.push('-maxrate:v', `${settings.video.maxBitrate}k`);
  }

  parts.push('-bufsize', `${settings.video.bitrate * 2}k`);
  parts.push('-g', String(settings.video.gop));
  parts.push('-pix_fmt', settings.pixelFormat);

  // Audio encoding settings
  parts.push('-c:a', 'aac');
  parts.push('-b:a', `${settings.audio.bitrate}k`);
  parts.push('-ar', String(settings.audio.sampleRate));
  parts.push('-ac', String(settings.audio.channels));

  // Duration
  parts.push('-t', String(output.duration));

  // Output
  parts.push('-f', settings.container);
  parts.push(`"${outputPath}"`);

  return parts.join(' ');
}

/**
 * Clean up temporary file on error.
 */
function cleanupTemp(tempPath: string): void {
  try {
    if (existsSync(tempPath)) {
      unlinkSync(tempPath);
    }
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Get default process executor.
 */
async function getDefaultExecutor(): Promise<ProcessExecutor> {
  const { NodeProcessExecutor } = await import('../capture/preflight');
  return new NodeProcessExecutor();
}

// ------------------------------------------------------------------------------------------------
// Encoding with Interruption Support
// ------------------------------------------------------------------------------------------------

/**
 * Encode video with proper cleanup on interruption.
 * Returns exit code 1 if encoding is interrupted.
 */
export async function encodeVideoWithCleanup(request: EncodeRequest): Promise<EncodeResult> {
  try {
    const result = await encodeVideo(request);

    // If encoding failed and temp file exists, clean it up
    if (!result.success && result.outputPath === undefined) {
      const tempPath = join(resolve(request.output.outputDir), `.tmp-${request.output.filename}`);
      cleanupTemp(tempPath);
    }

    return result;
  } catch (error) {
    // Clean up temp file on any error
    const tempPath = join(resolve(request.output.outputDir), `.tmp-${request.output.filename}`);
    cleanupTemp(tempPath);

    return {
      success: false,
      errors: [`Encoding failed: ${error instanceof Error ? error.message : String(error)}`],
      commands: [],
      elapsedMs: 0,
    };
  }
}

// ------------------------------------------------------------------------------------------------
// Dry Run
// ------------------------------------------------------------------------------------------------

/**
 * Generate the FFmpeg command that would be executed (for dry-run).
 */
export function buildEncodeCommand(request: EncodeRequest): string {
  const settings = request.encodingSettings
    ? { ...ENCODING_PRESETS[request.output.profile], ...request.encodingSettings }
    : ENCODING_PRESETS[request.output.profile];

  return buildFFmpegCommand(request, settings, `<output-path>`);
}

/**
 * Format encode result for display.
 */
export function formatEncodeResult(result: EncodeResult): string {
  const lines: string[] = [];

  lines.push(result.success ? '✓ Encoding succeeded' : '✗ Encoding failed');

  if (result.outputPath) {
    lines.push(`  Output: ${result.outputPath}`);
  }

  if (result.elapsedMs) {
    lines.push(`  Time: ${result.elapsedMs}ms`);
  }

  if (result.metadata) {
    lines.push(`  Duration: ${result.metadata.duration.toFixed(2)}s`);
    lines.push(`  FPS: ${result.metadata.fps}`);
    lines.push(`  Dimensions: ${result.metadata.width}x${result.metadata.height}`);
    lines.push(`  Video: ${result.metadata.videoCodec} @ ${result.metadata.videoBitrate}kbps`);
    lines.push(`  Audio: ${result.metadata.audioCodec} @ ${result.metadata.audioBitrate}kbps`);
  }

  if (result.errors.length > 0) {
    lines.push('  Errors:');
    for (const error of result.errors) {
      lines.push(`    - ${error}`);
    }
  }

  return lines.join('\n');
}
