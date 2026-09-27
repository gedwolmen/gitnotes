/**
 * Marketing Asset Pipeline - iOS Simulator Capture Adapter
 *
 * Capture screenshots from iOS Simulator using xcrun simctl.
 * Uses exact commands:
 *   xcrun simctl openurl booted <url>
 *   xcrun simctl io booted screenshot <path>
 *
 * References:
 * - xcrun simctl: Apple's iOS Simulator control CLI
 * - app.json: bundle ID (com.xavantra.gitnotes) and scheme (gitnotes://)
 */

import { dirname, resolve } from 'path';

import { mkdirSync } from 'fs';
import { spawn } from 'child_process';

import type {
  IOSCaptureRequest,
  IOSCaptureResult,
  ProcessExecutor,
  IOSSimulatorDevice,
} from './types';
import { checkIOSDevices } from './preflight';

import { ENV_PATHS } from './preflight';

// ------------------------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------------------------

/** Default wait time after opening URL (ms) */
const DEFAULT_WAIT_MS = 2000;

/** Minimum valid screenshot size (bytes) */
const MIN_SCREENSHOT_SIZE = 1000;

/** Maximum wait time for boot (ms) */
const MAX_BOOT_WAIT_MS = 5000;

// ------------------------------------------------------------------------------------------------
// iOS Simulator Capture
// ------------------------------------------------------------------------------------------------

/**
 * Capture a screenshot from iOS Simulator.
 *
 * @param request - Capture request
 * @param executor - Process executor (for test injection)
 * @returns Capture result
 */
export async function captureIOS(
  request: IOSCaptureRequest,
  executor: ProcessExecutor,
): Promise<IOSCaptureResult> {
  const startTime = Date.now();
  const commands: string[] = [];

  // Resolve xcrun path
  const xcrunPath = ENV_PATHS.xcrun;

  // Determine target device
  let deviceId = request.deviceId;
  let deviceName = 'unknown';

  if (deviceId === 'booted') {
    // Find booted device
    const { bootedDevice } = await checkIOSDevices(xcrunPath, executor);

    if (!bootedDevice) {
      return {
        success: false,
        deviceId: 'booted',
        error:
          'No booted iOS Simulator found. Boot a device with: xcrun simctl boot "iPhone 16 Pro Max"',
        commands,
      };
    }

    deviceId = bootedDevice.udid;
    deviceName = bootedDevice.name;
    commands.push(`# Found booted device: ${deviceName} (${deviceId})`);
  } else {
    // Verify device exists
    const { devices } = await checkIOSDevices(xcrunPath, executor);
    const device = devices.find((d) => d.udid === deviceId || d.name === deviceId);

    if (!device) {
      return {
        success: false,
        deviceId,
        error: `Device not found: ${deviceId}. Available devices: ${devices.map((d) => d.name).join(', ')}`,
        commands,
      };
    }

    deviceName = device.name;
  }

  commands.push(`xcrun simctl status_bar ${deviceId} nutrition enable`);

  // Open deep link using detached spawn to avoid exec hang
  // xcrun simctl openurl blocks until the app terminates on iOS 26.5+
  const deepLinkArgs = ['simctl', 'openurl', deviceId, request.deepLink];
  commands.push(`xcrun ${deepLinkArgs.join(' ')}`);

  const waitMs = request.waitMs ?? DEFAULT_WAIT_MS;

  try {
    const child = spawn('xcrun', deepLinkArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Wait for app to load
    commands.push(`# Waiting ${waitMs}ms for app to load...`);
    await sleep(waitMs);
  } catch (error) {
    return {
      success: false,
      deviceId,
      deviceName,
      error: `Failed to open deep link: ${error instanceof Error ? error.message : String(error)}`,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }

  // Capture screenshot using detached spawn to avoid exec hang on iOS 26.5+
  const screenshotPath = resolve(request.outputPath);

  // Ensure output directory exists
  const outputDir = dirname(screenshotPath);
  try {
    mkdirSync(outputDir, { recursive: true });
  } catch {
    // Ignore - may already exist
  }

  const screenshotArgs = ['simctl', 'io', deviceId, 'screenshot', screenshotPath];
  commands.push(`xcrun ${screenshotArgs.join(' ')}`);

  try {
    const child = spawn('xcrun', screenshotArgs, {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    // Wait for screenshot to complete
    await sleep(1000);

    // Validate output file
    const stats = await executor.stat(screenshotPath);

    if (!stats) {
      return {
        success: false,
        deviceId,
        deviceName,
        error: `Screenshot file not created at ${screenshotPath}`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    if (stats.size < MIN_SCREENSHOT_SIZE) {
      return {
        success: false,
        deviceId,
        deviceName,
        outputPath: screenshotPath,
        error: `Screenshot file too small (${stats.size} bytes) - likely invalid`,
        commands,
        elapsedMs: Date.now() - startTime,
      };
    }

    return {
      success: true,
      outputPath: screenshotPath,
      deviceId,
      deviceName,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      deviceId,
      deviceName,
      error: `Screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`,
      commands,
      elapsedMs: Date.now() - startTime,
    };
  }
}

/**
 * Build exact commands that would be executed (for dry-run).
 */
export function buildIOSCommands(request: IOSCaptureRequest): {
  deviceId: string;
  commands: string[];
} {
  const commands: string[] = [];
  const deviceId = request.deviceId === 'booted' ? '<booted-device-udid>' : request.deviceId;

  commands.push(`xcrun simctl status_bar ${deviceId} nutrition enable`);
  commands.push(`xcrun simctl openurl ${deviceId} "${request.deepLink}"`);
  commands.push(`# Wait ${request.waitMs ?? DEFAULT_WAIT_MS}ms`);
  commands.push(`xcrun simctl io ${deviceId} screenshot "${request.outputPath}"`);

  return { deviceId, commands };
}

/**
 * Get list of available iOS simulators.
 */
export async function listIOSDevices(executor: ProcessExecutor): Promise<IOSSimulatorDevice[]> {
  const xcrunPath = ENV_PATHS.xcrun;
  const { devices } = await checkIOSDevices(xcrunPath, executor);
  return devices;
}

/**
 * Wait for a specific device to boot.
 */
export async function waitForBoot(
  deviceId: string,
  executor: ProcessExecutor,
  maxWaitMs: number = MAX_BOOT_WAIT_MS,
): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 500;

  while (Date.now() - startTime < maxWaitMs) {
    const { devices, bootedDevice } = await checkIOSDevices(ENV_PATHS.xcrun, executor);

    if (bootedDevice && (bootedDevice.udid === deviceId || bootedDevice.name === deviceId)) {
      return true;
    }

    // Check if device exists
    const device = devices.find((d) => d.udid === deviceId || d.name === deviceId);
    if (device && device.state === 'Booted') {
      return true;
    }

    await sleep(pollInterval);
  }

  return false;
}

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
