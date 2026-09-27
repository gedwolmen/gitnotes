/**
 * Marketing Asset Pipeline - Android Emulator Capture Adapter
 *
 * Capture screenshots from Android Emulator using adb.
 * Uses existing APK from Gradle build path.
 *
 * Prerequisites (from scripts/build-rust.sh):
 * - Rust must be built for Android targets (cargo-ndk)
 * - APK must be built via: yarn android or eas build
 *
 * References:
 * - adb: Android Debug Bridge
 * - app.json: package name (org.gitnotes.app) and scheme (gitnotes://)
 * - eas.json: development profile with APK build type
 */

import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';

import { mkdirSync } from 'fs';

import type {
  AndroidCaptureRequest,
  AndroidCaptureResult,
  ProcessExecutor,
  AndroidEmulatorDevice,
} from './types';
import { checkAndroidDevices } from './preflight';

import { ENV_PATHS } from './preflight';

// ------------------------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------------------------

/** Default wait time after opening URL (ms) */
const DEFAULT_WAIT_MS = 2000;

/** Default capture timeout (ms) */
const DEFAULT_TIMEOUT_MS = 30000;

/** Minimum valid screenshot size (bytes) */
const MIN_SCREENSHOT_SIZE = 1000;

/** Default Android package name */
const DEFAULT_PACKAGE = 'org.gitnotes.app';

/** Default launch activity */
const DEFAULT_LAUNCH_ACTIVITY = '.MainActivity';

// ------------------------------------------------------------------------------------------------
// Known APK Paths
// ------------------------------------------------------------------------------------------------

/**
 * Find the APK path from common build locations.
 * Returns first existing APK found.
 */
export function findAPKPath(preferredPath?: string): string | null {
  // If explicitly provided, check it first
  if (preferredPath && existsSync(preferredPath)) {
    return preferredPath;
  }

  const candidatePaths = [
    // EAS development build
    join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk'),
    // Local gradle build
    join(
      process.cwd(),
      'android',
      'app',
      'build',
      'outputs',
      'apk',
      'development',
      'debug',
      'app-development-debug.apk',
    ),
    // Alternative debug location
    join(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app.apk'),
  ];

  for (const path of candidatePaths) {
    if (existsSync(path)) {
      return path;
    }
  }

  return null;
}

/**
 * Verify APK path is valid.
 */
export async function verifyAPKPath(apkPath: string, executor: ProcessExecutor): Promise<boolean> {
  // Check file exists
  if (!existsSync(apkPath)) {
    return false;
  }

  // Try to get APK info via aapt
  try {
    const result = await executor.exec(`aapt dump badging "${apkPath}" 2>&1 | head -1`, {
      timeoutMs: 5000,
    });
    return result.exitCode === 0;
  } catch {
    // aapt may not be available, just check file exists
    return true;
  }
}

// ------------------------------------------------------------------------------------------------
// Android Capture
// ------------------------------------------------------------------------------------------------

/**
 * Capture a screenshot from Android Emulator.
 *
 * @param request - Capture request
 * @param executor - Process executor (for test injection)
 * @returns Capture result
 */
export async function captureAndroid(
  request: AndroidCaptureRequest,
  executor: ProcessExecutor,
): Promise<AndroidCaptureResult> {
  const startTime = Date.now();
  const commands: string[] = [];

  // Resolve adb path
  const adbPath = ENV_PATHS.adb;

  // Determine target device
  let deviceId = request.deviceId;

  if (!deviceId || deviceId === 'emulator') {
    // Find running emulator
    const { runningDevice } = await checkAndroidDevices(adbPath, executor);

    if (!runningDevice) {
      return {
        success: false,
        deviceId: deviceId ?? 'emulator',
        error: 'No running Android emulator found. Start an emulator or check ADB connection.',
        commands,
      };
    }

    deviceId = runningDevice.serial;
  } else {
    // Verify device exists and is running
    const { devices } = await checkAndroidDevices(adbPath, executor);
    const device = devices.find((d) => d.serial === deviceId || d.model?.includes(deviceId));

    if (!device || device.state !== 'device') {
      const available = devices.map((d) => `${d.serial} (${d.state})`).join(', ');
      return {
        success: false,
        deviceId,
        error: `Device not found or not running: ${deviceId}. Available: ${available || 'none'}`,
        commands,
      };
    }
  }

  commands.push(`# Target: ${deviceId}`);

  // Optionally install APK if provided
  if (request.apkPath) {
    if (!existsSync(request.apkPath)) {
      return {
        success: false,
        deviceId,
        error: `APK not found: ${request.apkPath}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    const installCmd = `${adbPath} -s ${deviceId} install -r "${request.apkPath}"`;
    commands.push(installCmd);

    try {
      const installResult = await executor.exec(installCmd, { timeoutMs: 60000 });

      if (installResult.exitCode !== 0) {
        return {
          success: false,
          deviceId,
          error: `APK install failed: ${installResult.stderr}`,
          commands,
          elapsedMs: Date.now() - startTime,
        };
      }
    } catch (error) {
      return {
        success: false,
        deviceId,
        error: `APK install failed: ${error instanceof Error ? error.message : String(error)}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }
  }

  // Clear app data and relaunch (optional, for clean state)
  const clearCmd = `${adbPath} -s ${deviceId} shell pm clear ${DEFAULT_PACKAGE}`;
  commands.push(`# ${clearCmd}`);

  // Launch the app
  const launchCmd = `${adbPath} -s ${deviceId} shell am start -W -a android.intent.action.MAIN -n ${DEFAULT_PACKAGE}/${DEFAULT_LAUNCH_ACTIVITY}`;
  commands.push(launchCmd);

  try {
    const launchResult = await executor.exec(launchCmd, { timeoutMs: DEFAULT_TIMEOUT_MS });

    if (launchResult.exitCode !== 0) {
      return {
        success: false,
        deviceId,
        error: `App launch failed: ${launchResult.stderr}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Wait for app to load
    const waitMs = request.waitMs ?? DEFAULT_WAIT_MS;
    commands.push(`# Waiting ${waitMs}ms for app to load...`);
    await sleep(waitMs);
  } catch (error) {
    return {
      success: false,
      deviceId,
      error: `App launch failed: ${error instanceof Error ? error.message : String(error)}`,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Open deep link
  const deepLinkCmd = `${adbPath} -s ${deviceId} shell am start -W -a android.intent.action.VIEW -d "${request.deepLink}"`;
  commands.push(deepLinkCmd);

  try {
    const deepLinkResult = await executor.exec(deepLinkCmd, { timeoutMs: DEFAULT_TIMEOUT_MS });

    if (deepLinkResult.exitCode !== 0) {
      return {
        success: false,
        deviceId,
        error: `Deep link failed: ${deepLinkResult.stderr}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Wait for navigation
    await sleep(request.waitMs ?? DEFAULT_WAIT_MS);
  } catch (error) {
    return {
      success: false,
      deviceId,
      error: `Deep link failed: ${error instanceof Error ? error.message : String(error)}`,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Capture screenshot
  const screenshotPath = resolve(request.outputPath);

  // Ensure output directory exists
  const outputDir = dirname(screenshotPath);
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {
    // Ignore - may already exist
  }

  // Android screenshots are saved to /sdcard/Screenshots/ on the device, then pulled
  const remotePath = '/sdcard/ScreenShots/screenshot.png';

  // Take screenshot on device
  const captureCmd = `${adbPath} -s ${deviceId} shell screencap -p "${remotePath}"`;
  commands.push(captureCmd);

  try {
    const captureResult = await executor.exec(captureCmd, {
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (captureResult.exitCode !== 0) {
      return {
        success: false,
        deviceId,
        error: `Screenshot capture failed: ${captureResult.stderr}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Pull screenshot to local path
    const pullCmd = `${adbPath} -s ${deviceId} pull "${remotePath}" "${screenshotPath}"`;
    commands.push(pullCmd);

    const pullResult = await executor.exec(pullCmd, {
      timeoutMs: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    if (pullResult.exitCode !== 0) {
      return {
        success: false,
        deviceId,
        error: `Screenshot pull failed: ${pullResult.stderr}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Validate output file
    const stats = await executor.stat(screenshotPath);

    if (!stats) {
      return {
        success: false,
        deviceId,
        error: `Screenshot file not created at ${screenshotPath}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    if (stats.size < MIN_SCREENSHOT_SIZE) {
      return {
        success: false,
        deviceId,
        outputPath: screenshotPath,
        error: `Screenshot file too small (${stats.size} bytes) - likely invalid`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    // Clean up remote screenshot
    const cleanupCmd = `${adbPath} -s ${deviceId} shell rm "${remotePath}"`;
    executor.exec(cleanupCmd, { timeoutMs: 5000 }).catch(() => {
      // Ignore cleanup errors
    });

    return {
      success: true,
      outputPath: screenshotPath,
      deviceId,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      deviceId,
      error: `Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }
}

/**
 * Build exact commands that would be executed (for dry-run).
 */
export function buildAndroidCommands(request: AndroidCaptureRequest): {
  deviceId: string;
  commands: string[];
} {
  const commands: string[] = [];
  const deviceId = request.deviceId || '<running-emulator-serial>';

  if (request.apkPath) {
    commands.push(`${ENV_PATHS.adb} -s ${deviceId} install -r "${request.apkPath}"`);
  }

  commands.push(`${ENV_PATHS.adb} -s ${deviceId} shell pm clear ${DEFAULT_PACKAGE}`);
  commands.push(
    `${ENV_PATHS.adb} -s ${deviceId} shell am start -W -a android.intent.action.MAIN -n ${DEFAULT_PACKAGE}/${DEFAULT_LAUNCH_ACTIVITY}`,
  );
  commands.push(`# Wait ${request.waitMs ?? DEFAULT_WAIT_MS}ms`);
  commands.push(
    `${ENV_PATHS.adb} -s ${deviceId} shell am start -W -a android.intent.action.VIEW -d "${request.deepLink}"`,
  );
  commands.push(
    `${ENV_PATHS.adb} -s ${deviceId} shell screencap -p "/sdcard/ScreenShots/screenshot.png"`,
  );
  commands.push(
    `${ENV_PATHS.adb} -s ${deviceId} pull "/sdcard/ScreenShots/screenshot.png" "${request.outputPath}"`,
  );
  commands.push(`${ENV_PATHS.adb} -s ${deviceId} shell rm "/sdcard/ScreenShots/screenshot.png"`);

  return { deviceId, commands };
}

/**
 * Get list of available Android devices/emulators.
 */
export async function listAndroidDevices(
  executor: ProcessExecutor,
): Promise<AndroidEmulatorDevice[]> {
  const { devices } = await checkAndroidDevices(ENV_PATHS.adb, executor);
  return devices;
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
