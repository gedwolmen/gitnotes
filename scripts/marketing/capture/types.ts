/**
 * Marketing Asset Pipeline - Capture Types
 *
 * Type definitions for iOS Simulator and Android Emulator capture adapters.
 * Defines capture requests, results, tool availability, and error types.
 *
 * References:
 * - xcrun simctl: Apple's command-line interface for iOS Simulator control
 * - adb: Android Debug Bridge for Android emulator/device control
 * - docs/wiki/screens.md: Deep link routes
 * - app.json: Bundle IDs and schemes (gitnotes only, not RevenueCat)
 */

import type { DeviceProfile, Orientation, Route } from '../config';

// ------------------------------------------------------------------------------------------------
// Tool Availability
// ------------------------------------------------------------------------------------------------

/**
 * Tool availability status from preflight checks.
 */
export interface ToolAvailability {
  /** Tool name */
  name: string;
  /** Whether the tool is available */
  available: boolean;
  /** Path to the tool if available */
  path?: string;
  /** Detected version string */
  version?: string;
  /** Error message if unavailable */
  error?: string;
}

/**
 * Host tool preflight result aggregate.
 */
export interface PreflightResult {
  /** Whether all required tools are available */
  allAvailable: boolean;
  /** Individual tool availability results */
  tools: ToolAvailability[];
  /** iOS-specific availability */
  ios?: {
    xcrunAvailable: boolean;
    bootedDeviceId?: string;
    bootedDeviceName?: string;
    simulators: string[];
  };
  /** Android-specific availability */
  android?: {
    adbAvailable: boolean;
    emulators: string[];
    runningEmulatorId?: string;
  };
  /** Marketing Playwright availability */
  playwrightAvailable: boolean;
  /** FFmpeg availability */
  ffmpegAvailable: boolean;
  /** FFprobe availability */
  ffprobeAvailable: boolean;
}

// ------------------------------------------------------------------------------------------------
// iOS Simulator Types
// ------------------------------------------------------------------------------------------------

/**
 * iOS Simulator device info from xcrun.
 */
export interface IOSSimulatorDevice {
  /** Device UDID */
  udid: string;
  /** Device name */
  name: string;
  /** Device state (e.g., "Booted", "Shutdown") */
  state: string;
  /** Device availability (e.g., "Available") */
  availability?: string;
}

/**
 * iOS capture request.
 */
export interface IOSCaptureRequest {
  /** Target device UDID or "booted" */
  deviceId: string;
  /** Deep link URL to open before capture */
  deepLink: string;
  /** Output path for the screenshot */
  outputPath: string;
  /** Device profile for dimensions */
  deviceProfile: DeviceProfile;
  /** Capture orientation */
  orientation: Orientation;
  /** Wait time after deep link (ms) */
  waitMs?: number;
  /** Timeout for capture command (ms) */
  timeoutMs?: number;
}

/**
 * iOS capture result.
 */
export interface IOSCaptureResult {
  /** Whether capture succeeded */
  success: boolean;
  /** Output file path if successful */
  outputPath?: string;
  /** Detected device ID */
  deviceId: string;
  /** Detected device name */
  deviceName?: string;
  /** Actual screenshot dimensions */
  dimensions?: { width: number; height: number };
  /** Error message if failed */
  error?: string;
  /** Commands executed */
  commands: string[];
  /** Execution time in ms */
  elapsedMs?: number;
}

// ------------------------------------------------------------------------------------------------
// Android Emulator Types
// ------------------------------------------------------------------------------------------------

/**
 * Android emulator device info from adb.
 */
export interface AndroidEmulatorDevice {
  /** Device serial */
  serial: string;
  /** Device state (e.g., "device", "offline") */
  state: string;
  /** Device product name */
  product?: string;
  /** Device model */
  model?: string;
  /** Device device name */
  device?: string;
}

/**
 * Android capture request.
 */
export interface AndroidCaptureRequest {
  /** Target emulator serial or pattern */
  deviceId: string;
  /** Deep link URL to open before capture */
  deepLink: string;
  /** Output path for the screenshot */
  outputPath: string;
  /** Device profile for dimensions */
  deviceProfile: DeviceProfile;
  /** Capture orientation */
  orientation: Orientation;
  /** Path to the APK (from existing build) */
  apkPath?: string;
  /** Wait time after deep link (ms) */
  waitMs?: number;
  /** Timeout for capture command (ms) */
  timeoutMs?: number;
}

/**
 * Android capture result.
 */
export interface AndroidCaptureResult {
  /** Whether capture succeeded */
  success: boolean;
  /** Output file path if successful */
  outputPath?: string;
  /** Detected device serial */
  deviceId: string;
  /** Error message if failed */
  error?: string;
  /** Commands executed */
  commands: string[];
  /** Execution time in ms */
  elapsedMs?: number;
}

// ------------------------------------------------------------------------------------------------
// Capture Request/Router
// ------------------------------------------------------------------------------------------------

/**
 * Unified capture request that routes to iOS or Android.
 */
export interface CaptureRequest {
  /** Target platform */
  platform: 'ios' | 'android';
  /** Capture request details */
  request: IOSCaptureRequest | AndroidCaptureRequest;
}

/**
 * Unified capture result.
 */
export type CaptureResult = IOSCaptureResult | AndroidCaptureResult;

// ------------------------------------------------------------------------------------------------
// Route Handling
// ------------------------------------------------------------------------------------------------

/**
 * Capture-capable route information.
 * graph-view and chat require manual confirmation (no deep link/testID).
 */
export interface CaptureRoute {
  route: Route;
  /** Deep link URL */
  deepLink: string;
  /** Whether this route supports automated capture */
  automated: boolean;
  /** Note ID for note-editor routes */
  noteId?: string;
  /** Canvas ID for canvas-editor routes */
  canvasId?: string;
  /** Thread ID for chat-thread routes */
  threadId?: string;
  /** Reason if not automated */
  reason?: string;
}

// ------------------------------------------------------------------------------------------------
// Error Classes
// ------------------------------------------------------------------------------------------------

/**
 * Base error for capture operations.
 */
export class CaptureError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

/**
 * Preflight check failed.
 */
export class PreflightError extends CaptureError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'PREFLIGHT_FAILED', context);
    this.name = 'PreflightError';
  }
}

/**
 * Tool not found error.
 */
export class ToolNotFoundError extends CaptureError {
  constructor(toolName: string, searchPath?: string) {
    super(`Tool not found: ${toolName}`, 'TOOL_NOT_FOUND', { toolName, searchPath });
    this.name = 'ToolNotFoundError';
  }
}

/**
 * Device not found error.
 */
export class DeviceNotFoundError extends CaptureError {
  constructor(deviceId: string, platform: 'ios' | 'android') {
    super(`Device not found: ${deviceId}`, 'DEVICE_NOT_FOUND', { deviceId, platform });
    this.name = 'DeviceNotFoundError';
  }
}

/**
 * Capture command failed error.
 */
export class CaptureCommandError extends CaptureError {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stdout: string,
    public readonly stderr: string,
    context?: Record<string, unknown>,
  ) {
    super(message, 'CAPTURE_COMMAND_FAILED', { exitCode, stdout, stderr, ...context });
    this.name = 'CaptureCommandError';
  }
}

/**
 * Output file validation error.
 */
export class OutputValidationError extends CaptureError {
  constructor(
    message: string,
    public readonly outputPath: string,
  ) {
    super(message, 'OUTPUT_VALIDATION_FAILED', { outputPath });
    this.name = 'OutputValidationError';
  }
}

// ------------------------------------------------------------------------------------------------
// Dry Run
// ------------------------------------------------------------------------------------------------

/**
 * Dry run result showing what would be executed.
 */
export interface DryRunResult {
  /** Whether preflight passed */
  preflightPassed: boolean;
  /** Planned iOS capture if applicable */
  iosCapture?: {
    deviceId: string;
    deepLink: string;
    outputPath: string;
    commands: string[];
  };
  /** Planned Android capture if applicable */
  androidCapture?: {
    deviceId: string;
    deepLink: string;
    outputPath: string;
    commands: string[];
  };
  /** Missing tools or devices */
  missing: string[];
  /** Warnings */
  warnings: string[];
}

// ------------------------------------------------------------------------------------------------
// Executor Interface (for test injection)
// ------------------------------------------------------------------------------------------------

/**
 * Host process executor interface.
 * Allows injecting mock executors for testing.
 */
export interface ProcessExecutor {
  /**
   * Execute a command and return the result.
   */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  /**
   * Check if a path exists.
   */
  exists(path: string): Promise<boolean>;

  /**
   * Read file stats.
   */
  stat(path: string): Promise<{ size: number; mtimeMs: number } | null>;
}

/**
 * Options for command execution.
 */
export interface ExecOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether to capture stdout/stderr */
  capture?: boolean;
}

/**
 * Result of command execution.
 */
export interface ExecResult {
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Whether the command timed out */
  timedOut?: boolean;
}
