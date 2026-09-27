/**
 * Marketing Asset Pipeline - Video Types
 *
 * Typed contracts for video capture, encoding, and validation.
 * Defines video ratios, dimensions, encoding settings, and output specs.
 *
 * References:
 * - Apple App Store video specs: https://developer.apple.com/help/app-store-connect/reference/app-preview-specifications/
 * - Google Play video specs: https://support.google.com/googleplay/android-developer/answer/9866151
 * - Todo 5 composition/timeline contracts (scripts/marketing/store/)
 */

import type { ProcessExecutor } from '../capture/types';

// ------------------------------------------------------------------------------------------------
// Video Ratio Schema
// ------------------------------------------------------------------------------------------------

/**
 * Supported video aspect ratios for social media exports.
 */
export const VideoRatioSchema = {
  /** Vertical video (9:16) - TikTok, Instagram Reels, YouTube Shorts */
  VERTICAL: '9:16',
  /** Square video (1:1) - Instagram Feed */
  SQUARE: '1:1',
  /** Horizontal video (16:9) - YouTube, Twitter */
  HORIZONTAL: '16:9',
} as const;

export type VideoRatio = (typeof VideoRatioSchema)[keyof typeof VideoRatioSchema];

// ------------------------------------------------------------------------------------------------
// Video Dimensions
// ------------------------------------------------------------------------------------------------

/**
 * Exact pixel dimensions per video ratio.
 * These are deterministic and match the output of the composition pipeline.
 *
 * 9:16 (Vertical): 1080x1920 (common social vertical)
 * 1:1 (Square): 1080x1080
 * 16:9 (Horizontal): 1920x1080
 */
export const VIDEO_DIMENSIONS: Record<VideoRatio, { width: number; height: number }> = {
  [VideoRatioSchema.VERTICAL]: { width: 1080, height: 1920 },
  [VideoRatioSchema.SQUARE]: { width: 1080, height: 1080 },
  [VideoRatioSchema.HORIZONTAL]: { width: 1920, height: 1080 },
} as const;

// ------------------------------------------------------------------------------------------------
// Encoding Profile
// ------------------------------------------------------------------------------------------------

/**
 * Video encoding profile presets.
 */
export const EncodingProfileSchema = {
  /** High quality for App Store preview */
  APP_STORE: 'app-store',
  /** Standard quality for social media */
  SOCIAL: 'social',
  /** Maximum compression for small files */
  MINIMAL: 'minimal',
} as const;

export type EncodingProfile = (typeof EncodingProfileSchema)[keyof typeof EncodingProfileSchema];

// ------------------------------------------------------------------------------------------------
// Encoding Settings
// ------------------------------------------------------------------------------------------------

/**
 * H.264 encoding settings.
 */
export interface H264Settings {
  /** Codec profile (baseline, main, high) */
  profile: 'baseline' | 'main' | 'high';
  /** Codec level (3.1, 4.0, 5.0) */
  level: string;
  /** Bitrate in kbps */
  bitrate: number;
  /** Maximum bitrate in kbps (for CBR) */
  maxBitrate?: number;
  /** Frame rate */
  fps: number;
  /** Keyframe interval (in frames) */
  gop: number;
}

/**
 * AAC audio encoding settings.
 */
export interface AACSettings {
  /** Audio bitrate in kbps */
  bitrate: number;
  /** Sample rate in Hz */
  sampleRate: number;
  /** Number of audio channels */
  channels: number;
}

/**
 * Combined encoding settings for a profile.
 */
export interface EncodingSettings {
  /** H.264 video settings */
  video: H264Settings;
  /** AAC audio settings */
  audio: AACSettings;
  /** Pixel format */
  pixelFormat: string;
  /** Video container format */
  container: 'mp4' | 'mov';
}

/**
 * Preset encoding settings per profile.
 */
export const ENCODING_PRESETS: Record<EncodingProfile, EncodingSettings> = {
  [EncodingProfileSchema.APP_STORE]: {
    video: {
      profile: 'high',
      level: '4.0',
      bitrate: 16000,
      maxBitrate: 20000,
      fps: 30,
      gop: 60,
    },
    audio: {
      bitrate: 256,
      sampleRate: 44100,
      channels: 2,
    },
    pixelFormat: 'yuv420p',
    container: 'mp4',
  },
  [EncodingProfileSchema.SOCIAL]: {
    video: {
      profile: 'main',
      level: '3.1',
      bitrate: 8000,
      maxBitrate: 10000,
      fps: 30,
      gop: 30,
    },
    audio: {
      bitrate: 128,
      sampleRate: 44100,
      channels: 2,
    },
    pixelFormat: 'yuv420p',
    container: 'mp4',
  },
  [EncodingProfileSchema.MINIMAL]: {
    video: {
      profile: 'baseline',
      level: '3.1',
      bitrate: 4000,
      fps: 30,
      gop: 30,
    },
    audio: {
      bitrate: 96,
      sampleRate: 44100,
      channels: 1,
    },
    pixelFormat: 'yuv420p',
    container: 'mp4',
  },
};

// ------------------------------------------------------------------------------------------------
// Video Output Spec
// ------------------------------------------------------------------------------------------------

/**
 * Video output specification.
 */
export interface VideoOutputSpec {
  /** Output ratio */
  ratio: VideoRatio;
  /** Output dimensions */
  dimensions: { width: number; height: number };
  /** Encoding profile */
  profile: EncodingProfile;
  /** Duration in seconds (fixed for deterministic output) */
  duration: number;
  /** Output filename pattern */
  filename: string;
  /** Output directory */
  outputDir: string;
}

// ------------------------------------------------------------------------------------------------
// Caption / Safe Area
// ------------------------------------------------------------------------------------------------

/**
 * Safe area insets for text overlay on video.
 * Prevents captions from being cut off by device UI or platform UI.
 */
export interface VideoSafeArea {
  /** Top inset in pixels */
  top: number;
  /** Bottom inset in pixels */
  bottom: number;
  /** Left inset in pixels */
  left: number;
  /** Right inset in pixels */
  right: number;
  /** Platform-specific multiplier (for high DPI) */
  scale: number;
}

/**
 * Safe area presets per ratio.
 * These are conservative defaults based on common platform requirements.
 */
export const VIDEO_SAFE_AREAS: Record<VideoRatio, VideoSafeArea> = {
  [VideoRatioSchema.VERTICAL]: {
    top: 120,
    bottom: 120,
    left: 40,
    right: 40,
    scale: 1,
  },
  [VideoRatioSchema.SQUARE]: {
    top: 80,
    bottom: 80,
    left: 40,
    right: 40,
    scale: 1,
  },
  [VideoRatioSchema.HORIZONTAL]: {
    top: 60,
    bottom: 60,
    left: 40,
    right: 40,
    scale: 1,
  },
};

// ------------------------------------------------------------------------------------------------
// Caption Overlay
// ------------------------------------------------------------------------------------------------

/**
 * Caption overlay specification for video.
 */
export interface VideoCaption {
  /** Caption text */
  text: string;
  /** Position within safe area */
  position: 'top' | 'center' | 'bottom';
  /** Font size relative to video height */
  fontSizeRatio: number;
  /** Font weight */
  fontWeight: number;
  /** Text color (CSS color) */
  color: string;
  /** Background color (optional, for readability) */
  backgroundColor?: string;
  /** Padding around text */
  padding: number;
  /** Vertical offset within safe area */
  verticalOffset: number;
}

/**
 * Default caption presets.
 */
export const DEFAULT_CAPTION: VideoCaption = {
  text: 'GitNotēs',
  position: 'bottom',
  fontSizeRatio: 0.05,
  fontWeight: 700,
  color: '#FFFFFF',
  backgroundColor: 'rgba(0,0,0,0.6)',
  padding: 16,
  verticalOffset: 0,
};

// ------------------------------------------------------------------------------------------------
// Video Validation Result
// ------------------------------------------------------------------------------------------------

/**
 * Video metadata from ffprobe.
 */
export interface VideoMetadata {
  /** Duration in seconds */
  duration: number;
  /** Frame rate (as fraction string) */
  fps: string;
  /** Frame rate (as decimal) */
  fpsDecimal: number;
  /** Video width in pixels */
  width: number;
  /** Video height in pixels */
  height: number;
  /** Video codec name */
  videoCodec: string;
  /** Audio codec name */
  audioCodec: string;
  /** Video bitrate in kbps */
  videoBitrate: number;
  /** Audio bitrate in kbps */
  audioBitrate: number;
  /** Number of streams */
  numStreams: number;
  /** File size in bytes */
  sizeBytes: number;
  /** Container format */
  format: string;
}

/**
 * Video validation result.
 */
export interface VideoValidationResult {
  /** Whether validation passed */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Extracted metadata (if available) */
  metadata?: VideoMetadata;
}

// ------------------------------------------------------------------------------------------------
// Encoding Request
// ------------------------------------------------------------------------------------------------

/**
 * Video encoding request.
 */
export interface EncodeRequest {
  /** Input source (PNG sequence glob pattern or single image) */
  inputSource: string;
  /** Output specification */
  output: VideoOutputSpec;
  /** Caption overlay (optional) */
  caption?: VideoCaption;
  /** Safe area for caption placement */
  safeArea: VideoSafeArea;
  /** Overwrite existing file */
  overwrite?: boolean;
  /** Custom encoding settings (overrides profile) */
  encodingSettings?: Partial<EncodingSettings>;
  /** Executor for running ffmpeg (test injection) */
  executor?: ProcessExecutor;
}

// ------------------------------------------------------------------------------------------------
// Encoding Result
// ------------------------------------------------------------------------------------------------

/**
 * Video encoding result.
 */
export interface EncodeResult {
  /** Whether encoding succeeded */
  success: boolean;
  /** Output file path if successful */
  outputPath?: string;
  /** Encoding errors */
  errors: string[];
  /** Commands executed */
  commands: string[];
  /** Execution time in ms */
  elapsedMs: number;
  /** Extracted metadata (if successful) */
  metadata?: VideoMetadata;
  /** SHA-256 checksum of output file */
  checksum?: string;
}

// ------------------------------------------------------------------------------------------------
// Error Types
// ------------------------------------------------------------------------------------------------

/**
 * Video encoding error.
 */
export class VideoEncodeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'VideoEncodeError';
  }
}

/**
 * Video validation error.
 */
export class VideoValidationError extends Error {
  constructor(
    message: string,
    public readonly outputPath: string,
    public readonly metadata?: VideoMetadata,
  ) {
    super(message);
    this.name = 'VideoValidationError';
  }
}

/**
 * FFmpeg not found error.
 */
export class FFmpegNotFoundError extends VideoEncodeError {
  constructor(searchPath?: string) {
    super('FFmpeg not found. Install with: brew install ffmpeg', 'FFMPEG_NOT_FOUND', {
      searchPath,
    });
    this.name = 'FFmpegNotFoundError';
  }
}

/**
 * FFprobe not found error.
 */
export class FFprobeNotFoundError extends VideoEncodeError {
  constructor(searchPath?: string) {
    super('FFprobe not found. Install with: brew install ffmpeg', 'FFPROBE_NOT_FOUND', {
      searchPath,
    });
    this.name = 'FFprobeNotFoundError';
  }
}

/**
 * Encoding interrupted error.
 */
export class EncodingInterruptedError extends VideoEncodeError {
  constructor(outputPath: string) {
    super('Encoding was interrupted', 'ENCODING_INTERRUPTED', { outputPath });
    this.name = 'EncodingInterruptedError';
  }
}

// ------------------------------------------------------------------------------------------------
// Helper Functions
// ------------------------------------------------------------------------------------------------

/**
 * Get dimensions for a video ratio.
 */
export function getVideoDimensions(ratio: VideoRatio): { width: number; height: number } {
  return VIDEO_DIMENSIONS[ratio];
}

/**
 * Get safe area for a video ratio.
 */
export function getVideoSafeArea(ratio: VideoRatio): VideoSafeArea {
  return VIDEO_SAFE_AREAS[ratio];
}

/**
 * Build a video output specification.
 */
export function buildVideoOutput(
  ratio: VideoRatio,
  profile: EncodingProfile,
  outputDir: string,
  basename: string,
  duration: number = 15,
): VideoOutputSpec {
  const dimensions = getVideoDimensions(ratio);
  const ext = ENCODING_PRESETS[profile].container;
  const filename = `${basename}-${ratio.replace(':', 'x')}-${profile}.${ext}`;

  return {
    ratio,
    dimensions,
    profile,
    duration,
    filename,
    outputDir,
  };
}

/**
 * Validate video dimensions match expected ratio.
 */
export function validateVideoRatio(
  width: number,
  height: number,
  expectedRatio: VideoRatio,
): boolean {
  const dims = VIDEO_DIMENSIONS[expectedRatio];
  return dims.width === width && dims.height === height;
}
