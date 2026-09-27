/**
 * Marketing Asset Pipeline - Video Module
 *
 * Unified video encoding orchestration.
 * Combines Playwright capture (for source frames) with FFmpeg encoding
 * for deterministic MP4 exports at 9:16, 1:1, and 16:9 ratios.
 *
 * References:
 * - scripts/marketing/config.ts: Output directories
 * - scripts/marketing/manifest.ts: Output manifest and checksums
 * - scripts/marketing/store/types.ts: Slide/Timeline from Todo 5 (reused, not duplicated)
 */

import { existsSync, mkdirSync } from 'fs';
import type { ProcessExecutor } from '../capture/types';
import { NodeProcessExecutor, runPreflight } from '../capture/preflight';
import {
  VideoRatioSchema,
  VideoRatio,
  EncodingProfile,
  EncodingProfileSchema,
  VIDEO_DIMENSIONS,
  type EncodeRequest,
  type EncodeResult,
  type VideoCaption,
  type VideoSafeArea,
  buildVideoOutput,
  getVideoSafeArea,
  DEFAULT_CAPTION,
} from './types';
import { encodeVideo, buildEncodeCommand } from './encoder';

// ------------------------------------------------------------------------------------------------
// Export Directories
// ------------------------------------------------------------------------------------------------

/**
 * Video output subdirectories.
 * Extends OUTPUT_DIRS from config.
 */
export const VIDEO_OUTPUT_DIRS = {
  runs: 'assets/marketing/video/runs', // Per-run working output (ignored)
  exports: 'assets/marketing/video/exports', // Final export artifacts (ignored)
} as const;

// ------------------------------------------------------------------------------------------------
// Video Export Options
// ------------------------------------------------------------------------------------------------

/**
 * Options for video export.
 */
export interface VideoExportOptions {
  /** Dry-run mode (no actual encoding) */
  dryRun?: boolean;
  /** Output directory */
  outputDir?: string;
  /** Overwrite existing files */
  overwrite?: boolean;
  /** Encoding profile */
  profile?: EncodingProfile;
  /** Video duration in seconds */
  duration?: number;
  /** Caption overlay */
  caption?: VideoCaption;
  /** Custom safe area (overrides ratio default) */
  safeArea?: VideoSafeArea;
  /** Input source (image path or glob pattern) */
  inputSource?: string;
  /** Custom process executor (for testing) */
  executor?: ProcessExecutor;
}

// ------------------------------------------------------------------------------------------------
// Video Export Result
// ------------------------------------------------------------------------------------------------

/**
 * Result of a video export operation.
 */
export interface VideoExportResult {
  /** Unique run ID */
  runId: string;
  /** Whether all exports succeeded */
  success: boolean;
  /** Export results per ratio */
  exports: VideoExportOutput[];
  /** Preflight result */
  preflight: Awaited<ReturnType<typeof runPreflight>>;
  /** Errors encountered */
  errors: string[];
  /** Elapsed time in ms */
  elapsedMs: number;
}

/**
 * Individual video export output.
 */
export interface VideoExportOutput {
  /** Output ratio */
  ratio: VideoRatio;
  /** Output file path */
  outputPath?: string;
  /** Encoding result */
  encodeResult?: EncodeResult;
  /** FFmpeg command (for dry-run) */
  command?: string;
}

// ------------------------------------------------------------------------------------------------
// Main Export Function
// ------------------------------------------------------------------------------------------------

/**
 * Export videos for all three ratios (9:16, 1:1, 16:9).
 *
 * @param inputSource - Input image or image sequence
 * @param options - Export options
 * @returns Export result with all three ratio outputs
 */
export async function exportVideos(
  inputSource: string,
  options: VideoExportOptions = {},
): Promise<VideoExportResult> {
  const startTime = Date.now();
  const runId = `video-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const {
    dryRun = false,
    outputDir = VIDEO_OUTPUT_DIRS.exports,
    overwrite = false,
    profile = EncodingProfileSchema.SOCIAL,
    duration = 15,
    caption,
    safeArea,
    executor = new NodeProcessExecutor(),
  } = options;

  const errors: string[] = [];
  const exports: VideoExportOutput[] = [];

  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Run preflight check
  let preflight;
  try {
    preflight = await runPreflight(executor, {
      skipAndroid: true, // Video encoding doesn't need Android
      skipPlaywright: true, // We'll use pre-captured frames
    });
  } catch (error) {
    return {
      runId,
      success: false,
      exports: [],
      preflight: {} as Awaited<ReturnType<typeof runPreflight>>,
      errors: [`Preflight failed: ${error instanceof Error ? error.message : String(error)}`],
      elapsedMs: Date.now() - startTime,
    };
  }

  // Check FFmpeg availability
  if (!preflight.ffmpegAvailable) {
    return {
      runId,
      success: false,
      exports: [],
      preflight,
      errors: ['FFmpeg not available - video encoding requires FFmpeg'],
      elapsedMs: Date.now() - startTime,
    };
  }

  // Export for each ratio
  const ratios = [VideoRatioSchema.VERTICAL, VideoRatioSchema.SQUARE, VideoRatioSchema.HORIZONTAL];

  for (const ratio of ratios) {
    const ratioResult = await exportSingleRatio(ratio, inputSource, {
      dryRun,
      outputDir,
      overwrite,
      profile,
      duration,
      caption,
      safeArea,
      executor,
    });
    exports.push(ratioResult);

    if (!ratioResult.encodeResult?.success) {
      errors.push(`Failed to export ${ratio}: ${ratioResult.encodeResult?.errors.join(', ')}`);
    }
  }

  return {
    runId,
    success: errors.length === 0,
    exports,
    preflight,
    errors,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Export a single ratio.
 */
async function exportSingleRatio(
  ratio: VideoRatio,
  inputSource: string,
  options: VideoExportOptions,
): Promise<VideoExportOutput> {
  const {
    dryRun,
    outputDir = VIDEO_OUTPUT_DIRS.exports,
    overwrite,
    profile,
    duration,
    caption,
    safeArea,
    executor,
  } = options;

  // Resolve safe area
  const resolvedSafeArea = safeArea ?? getVideoSafeArea(ratio);

  // Build output spec
  const output = buildVideoOutput(
    ratio,
    profile ?? EncodingProfileSchema.SOCIAL,
    outputDir,
    'video',
    duration ?? 15,
  );

  if (dryRun) {
    // Build command without executing
    const request: EncodeRequest = {
      inputSource,
      output,
      safeArea: resolvedSafeArea,
      caption,
      executor,
    };
    const command = buildEncodeCommand(request);
    return { ratio, command };
  }

  // Execute encoding
  const request: EncodeRequest = {
    inputSource,
    output,
    safeArea: resolvedSafeArea,
    caption,
    overwrite,
    executor,
  };

  const encodeResult = await encodeVideo(request);

  return {
    ratio,
    outputPath: encodeResult.outputPath,
    encodeResult,
  };
}

// ------------------------------------------------------------------------------------------------
// Per-Platform Metadata
// ------------------------------------------------------------------------------------------------

/**
 * Platform-specific video metadata for manifest.
 */
export interface VideoPlatformMetadata {
  /** Platform (apple-app-store, google-play, social) */
  platform: string;
  /** Video dimensions */
  dimensions: { width: number; height: number };
  /** Aspect ratio string */
  aspectRatio: string;
  /** Minimum duration in seconds */
  minDuration: number;
  /** Maximum duration in seconds */
  maxDuration: number;
  /** Required codec */
  codec: string;
}

/**
 * Platform metadata for Apple App Store video previews.
 */
export const APPLE_VIDEO_SPECS: Record<VideoRatio, VideoPlatformMetadata> = {
  [VideoRatioSchema.VERTICAL]: {
    platform: 'apple-app-store',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL],
    aspectRatio: '9:16',
    minDuration: 15,
    maxDuration: 30,
    codec: 'H.264',
  },
  [VideoRatioSchema.SQUARE]: {
    platform: 'apple-app-store',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.SQUARE],
    aspectRatio: '1:1',
    minDuration: 15,
    maxDuration: 30,
    codec: 'H.264',
  },
  [VideoRatioSchema.HORIZONTAL]: {
    platform: 'apple-app-store',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.HORIZONTAL],
    aspectRatio: '16:9',
    minDuration: 15,
    maxDuration: 30,
    codec: 'H.264',
  },
};

/**
 * Platform metadata for Google Play video trailers.
 */
export const GOOGLE_PLAY_VIDEO_SPECS: Record<VideoRatio, VideoPlatformMetadata> = {
  [VideoRatioSchema.VERTICAL]: {
    platform: 'google-play',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.VERTICAL],
    aspectRatio: '9:16',
    minDuration: 10,
    maxDuration: 120,
    codec: 'H.264',
  },
  [VideoRatioSchema.SQUARE]: {
    platform: 'google-play',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.SQUARE],
    aspectRatio: '1:1',
    minDuration: 10,
    maxDuration: 120,
    codec: 'H.264',
  },
  [VideoRatioSchema.HORIZONTAL]: {
    platform: 'google-play',
    dimensions: VIDEO_DIMENSIONS[VideoRatioSchema.HORIZONTAL],
    aspectRatio: '16:9',
    minDuration: 10,
    maxDuration: 120,
    codec: 'H.264',
  },
};

// ------------------------------------------------------------------------------------------------
// Dry Run
// ------------------------------------------------------------------------------------------------

/**
 * Run dry-run to show planned encoding commands.
 */
export async function runVideoDryRun(
  inputSource: string,
  options: Omit<VideoExportOptions, 'dryRun'> = {},
): Promise<{ commands: Record<VideoRatio, string>; errors: string[] }> {
  const executor = options.executor ?? new NodeProcessExecutor();

  // Check preflight first
  const preflight = await runPreflight(executor, {
    skipAndroid: true,
    skipPlaywright: true,
  });

  if (!preflight.ffmpegAvailable) {
    return {
      commands: {} as Record<VideoRatio, string>,
      errors: ['FFmpeg not available'],
    };
  }

  const ratios = [VideoRatioSchema.VERTICAL, VideoRatioSchema.SQUARE, VideoRatioSchema.HORIZONTAL];

  const commands: Partial<Record<VideoRatio, string>> = {};
  const errors: string[] = [];

  for (const ratio of ratios) {
    try {
      const safeArea = options.safeArea ?? getVideoSafeArea(ratio);
      const output = buildVideoOutput(
        ratio,
        options.profile ?? EncodingProfileSchema.SOCIAL,
        options.outputDir ?? VIDEO_OUTPUT_DIRS.exports,
        'video',
        options.duration ?? 15,
      );

      const request: EncodeRequest = {
        inputSource,
        output,
        safeArea,
        caption: options.caption,
        executor,
      };

      commands[ratio] = buildEncodeCommand(request);
    } catch (error) {
      errors.push(
        `Failed to build command for ${ratio}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return {
    commands: commands as Record<VideoRatio, string>,
    errors,
  };
}

// ------------------------------------------------------------------------------------------------
// Format Output
// ------------------------------------------------------------------------------------------------

/**
 * Format video export result for display.
 */
export function formatVideoExportResult(result: VideoExportResult): string {
  const lines: string[] = [];

  lines.push('=== Video Export Result ===');
  lines.push(`Run ID: ${result.runId}`);
  lines.push(`Overall: ${result.success ? 'SUCCESS' : 'FAILED'}`);
  lines.push(`Elapsed: ${result.elapsedMs}ms`);
  lines.push('');

  lines.push('Preflight:');
  lines.push(`  FFmpeg: ${result.preflight.ffmpegAvailable ? '✓' : '✗'}`);
  lines.push(`  FFprobe: ${result.preflight.ffprobeAvailable ? '✓' : '✗'}`);
  lines.push('');

  lines.push('Exports:');
  for (const exp of result.exports) {
    lines.push(`  ${exp.ratio}:`);
    if (exp.outputPath) {
      lines.push(`    Output: ${exp.outputPath}`);
    }
    if (exp.encodeResult) {
      lines.push(`    Status: ${exp.encodeResult.success ? 'SUCCESS' : 'FAILED'}`);
      lines.push(`    Time: ${exp.encodeResult.elapsedMs}ms`);
      if (exp.encodeResult.metadata) {
        lines.push(`    Duration: ${exp.encodeResult.metadata.duration.toFixed(2)}s`);
        lines.push(`    Size: ${(exp.encodeResult.metadata.sizeBytes / 1024).toFixed(1)}KB`);
      }
    }
    if (exp.command) {
      lines.push(`    Command: ${exp.command}`);
    }
  }

  if (result.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const error of result.errors) {
      lines.push(`  - ${error}`);
    }
  }

  return lines.join('\n');
}

// ------------------------------------------------------------------------------------------------
// CLI Entry Point
// ------------------------------------------------------------------------------------------------

/**
 * Main CLI entry point.
 */
export async function main(args: string[]): Promise<number> {
  const dryRun = args.includes('--dry-run');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(`
Video Export CLI

Usage:
  node scripts/marketing/video/index.js [options]

Options:
  --dry-run       Show FFmpeg commands without encoding
  --input <path>  Input image or sequence (required for real run)
  --output <dir>  Output directory (default: assets/marketing/video/exports)
  --profile <p>   Encoding profile: app-store, social, minimal (default: social)
  --duration <s>   Video duration in seconds (default: 15)
  --help, -h      Show this help

Environment Variables:
  FFMPEG_PATH     Path to ffmpeg (default: search PATH)
  FFPROBE_PATH    Path to ffprobe (default: search PATH)

Examples:
  # Dry run with default input
  node scripts/marketing/video/index.js --dry-run

  # Export with custom input
  node scripts/marketing/video/index.js --input assets/marketing/captures/frame.png
`);
    return 0;
  }

  // Get input source
  const inputIndex = args.indexOf('--input');
  const inputSource =
    inputIndex >= 0 ? args[inputIndex + 1] : 'assets/marketing/captures/frame.png';

  // Get output directory
  const outputIndex = args.indexOf('--output');
  const outputDir = outputIndex >= 0 ? args[outputIndex + 1] : VIDEO_OUTPUT_DIRS.exports;

  // Get profile
  const profileIndex = args.indexOf('--profile');
  const profile =
    profileIndex >= 0 ? (args[profileIndex + 1] as EncodingProfile) : EncodingProfileSchema.SOCIAL;

  // Get duration
  const durationIndex = args.indexOf('--duration');
  const duration = durationIndex >= 0 ? parseInt(args[durationIndex + 1], 10) : 15;

  console.log('Running video export...');
  console.log(`Input: ${inputSource}`);
  console.log(`Output: ${outputDir}`);
  console.log(`Profile: ${profile}`);
  console.log(`Duration: ${duration}s`);
  console.log('');

  const result = await exportVideos(inputSource, {
    dryRun,
    outputDir,
    profile,
    duration,
    caption: DEFAULT_CAPTION,
  });

  console.log(formatVideoExportResult(result));

  return result.success ? 0 : 1;
}

// Allow running as CLI script
if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
