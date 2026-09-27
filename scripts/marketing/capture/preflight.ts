/**
 * Marketing Asset Pipeline - Host Tool Preflight
 *
 * Explicit checks for required host tools:
 * - xcrun simctl (iOS Simulator)
 * - adb (Android Debug Bridge)
 * - ffmpeg (video encoding)
 * - ffprobe (media metadata)
 * - playwright (browser automation for marketing)
 *
 * All tool paths are injectable via environment variables for CI/testing:
 * - XCRUN_PATH: path to xcrun (default: search PATH)
 * - ADB_PATH: path to adb (default: search PATH)
 * - FFMPEG_PATH: path to ffmpeg (default: search PATH)
 * - FFPROBE_PATH: path to ffprobe (default: search PATH)
 * - PLAYWRIGHT_PATH: path to playwright binary (default: marketing/node_modules/.bin/playwright)
 */

import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { cwd } from 'process';

import type {
  PreflightResult,
  ToolAvailability,
  IOSSimulatorDevice,
  AndroidEmulatorDevice,
  ProcessExecutor,
  ExecResult,
} from './types';
import { PreflightError, ToolNotFoundError } from './types';

// ------------------------------------------------------------------------------------------------
// Environment Variable Defaults
// ------------------------------------------------------------------------------------------------

/** Environment variable names for tool paths */
export const ENV_PATHS = {
  xcrun: process.env.XCRUN_PATH ?? 'xcrun',
  adb: process.env.ADB_PATH ?? 'adb',
  ffmpeg: process.env.FFMPEG_PATH ?? 'ffmpeg',
  ffprobe: process.env.FFPROBE_PATH ?? 'ffprobe',
  playwright: process.env.PLAYWRIGHT_PATH ?? '',
} as const;

// ------------------------------------------------------------------------------------------------
// Default Executor (Node.js child_process)
// ------------------------------------------------------------------------------------------------

/**
 * Default process executor using Node.js built-ins.
 */
export class NodeProcessExecutor implements ProcessExecutor {
  private readonly execOptions: { path?: string };

  constructor(execPath?: string) {
    this.execOptions = execPath ? { path: execPath } : {};
  }

  async exec(
    command: string,
    options: {
      cwd?: string;
      env?: Record<string, string>;
      timeoutMs?: number;
      capture?: boolean;
    } = {},
  ): Promise<ExecResult> {
    const childProcess = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(childProcess.exec);

    const cwd = options.cwd ?? process.cwd();
    const env = { ...process.env, ...options.env };

    try {
      const result = await execAsync(command, {
        cwd,
        env,
        timeout: options.timeoutMs ? Math.floor(options.timeoutMs / 1000) : undefined,
      });
      return {
        exitCode: 0,
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
      };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error) {
        const execError = error as {
          code: number;
          stdout?: string;
          stderr?: string;
          killed?: boolean;
        };
        return {
          exitCode: execError.code,
          stdout: execError.stdout ?? '',
          stderr: execError.stderr ?? '',
          timedOut: execError.killed,
        };
      }
      throw error;
    }
  }

  async exists(path: string): Promise<boolean> {
    return existsSync(path);
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
    try {
      const { statSync } = await import('fs');
      const stats = statSync(path);
      const mtimeMs = typeof stats.mtimeMs === 'number' ? stats.mtimeMs : stats.mtime.getTime();
      return { size: stats.size, mtimeMs };
    } catch {
      return null;
    }
  }
}

// ------------------------------------------------------------------------------------------------
// Tool Availability Checkers
// ------------------------------------------------------------------------------------------------

/**
 * Check if a tool is available in PATH or at a specific path.
 */
async function checkToolAvailability(
  name: string,
  toolPath: string,
  executor: ProcessExecutor,
): Promise<ToolAvailability> {
  // Check if path exists as a file
  const exists = await executor.exists(toolPath);

  if (!exists) {
    // Try to find in PATH by running `which`
    try {
      const result = await executor.exec(`which ${toolPath}`, { capture: true });
      if (result.exitCode === 0 && result.stdout.trim()) {
        return {
          name,
          available: true,
          path: result.stdout.trim(),
        };
      }
    } catch {
      // ignore
    }
    return {
      name,
      available: false,
      error: `not found: ${toolPath}`,
    };
  }

  // Get version info
  try {
    const versionResult = await executor.exec(`${toolPath} --version`, { capture: true });
    const version = parseVersionOutput(name, versionResult.stdout + versionResult.stderr);
    return {
      name,
      available: true,
      path: toolPath,
      version,
    };
  } catch {
    return {
      name,
      available: true,
      path: toolPath,
    };
  }
}

/**
 * Parse version string from tool output.
 */
function parseVersionOutput(toolName: string, output: string): string | undefined {
  const lines = output.split('\n').slice(0, 3);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      // Return first non-empty line as version hint
      return trimmed;
    }
  }
  return undefined;
}

/**
 * Check iOS Simulator devices using xcrun simctl.
 */
export async function checkIOSDevices(
  xcrunPath: string,
  executor: ProcessExecutor,
): Promise<{ devices: IOSSimulatorDevice[]; bootedDevice?: IOSSimulatorDevice }> {
  try {
    const result = await executor.exec(`${xcrunPath} simctl list devices available`, {
      capture: true,
    });

    if (result.exitCode !== 0) {
      return { devices: [] };
    }

    const devices = parseXcrunDeviceList(result.stdout);
    const booted = devices.find((d) => d.state === 'Booted');

    return { devices, bootedDevice: booted };
  } catch {
    return { devices: [] };
  }
}

/**
 * Parse xcrun simctl device list output.
 * Format:
 *   == Device Types ==
 *   iPhone 16 Pro Max (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max)
 *   ...
 *
 *   == Devices ==
 *   -- iOS 18.0 --
 *   iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012) (Booted)
 *   ...
 */
function parseXcrunDeviceList(output: string): IOSSimulatorDevice[] {
  const devices: IOSSimulatorDevice[] = [];
  const lines = output.split('\n');
  let inDevices = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '== Devices ==') {
      inDevices = true;
      continue;
    }

    if (trimmed === '== Device Types ==') {
      inDevices = false;
      continue;
    }

    if (inDevices && trimmed.startsWith('-- ')) {
      // Section header like "-- iOS 18.0 --"
      continue;
    }

    if (inDevices && trimmed) {
      // Line like: iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012) (Booted)
      const match = trimmed.match(/^(.+?)\s+\(([A-F0-9-]+)\)(?:\s+\(([^)]+)\))?/);
      if (match) {
        const [, name, udid, state] = match;
        devices.push({
          name: name.trim(),
          udid: udid.trim(),
          state: state?.trim() ?? 'Unknown',
        });
      }
    }
  }

  return devices;
}

/**
 * Check Android emulators and devices using adb.
 */
export async function checkAndroidDevices(
  adbPath: string,
  executor: ProcessExecutor,
): Promise<{ devices: AndroidEmulatorDevice[]; runningDevice?: AndroidEmulatorDevice }> {
  try {
    const result = await executor.exec(`${adbPath} devices -l`, { capture: true });

    if (result.exitCode !== 0) {
      return { devices: [] };
    }

    const devices = parseAdbDeviceList(result.stdout);
    const running = devices.find((d) => d.state === 'device');

    return { devices, runningDevice: running };
  } catch {
    return { devices: [] };
  }
}

/**
 * Parse adb devices output.
 * Format:
 *   List of devices attached
 *   emulator-5556          device product:sdk_phone_x86_64 model:Android_SDK_built_for_x86_64 device:generic_x86_64
 *   192.168.1.1:5555      offline
 */
function parseAdbDeviceList(output: string): AndroidEmulatorDevice[] {
  const devices: AndroidEmulatorDevice[] = [];
  const lines = output.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('List of devices')) {
      continue;
    }

    // emulator-5556          device product:sdk_phone_x86_64 model:Android_SDK_built_for_x86_64 device:generic_x86_64
    const match = trimmed.match(/^([^\s]+)\s+(\w+)(?:\s+(.+))?/);
    if (match) {
      const [, serial, state, details = ''] = match;
      const info: AndroidEmulatorDevice = { serial, state };

      // Parse details: product:xxx model:xxx device:xxx
      const productMatch = details.match(/product:(\S+)/);
      const modelMatch = details.match(/model:(\S+)/);
      const deviceMatch = details.match(/device:(\S+)/);

      if (productMatch) info.product = productMatch[1];
      if (modelMatch) info.model = modelMatch[1].replace(/_/g, ' ');
      if (deviceMatch) info.device = deviceMatch[1];

      devices.push(info);
    }
  }

  return devices;
}

/**
 * Check if marketing Playwright is available.
 */
async function checkPlaywright(
  playwrightPath: string,
  executor: ProcessExecutor,
): Promise<ToolAvailability> {
  // If explicit path provided, check it
  if (playwrightPath && playwrightPath !== 'playwright') {
    const exists = await executor.exists(playwrightPath);
    if (!exists) {
      return {
        name: 'playwright',
        available: false,
        error: `not found: ${playwrightPath}`,
      };
    }
    return {
      name: 'playwright',
      available: true,
      path: playwrightPath,
    };
  }

  // Try marketing/node_modules/.bin/playwright
  const rootDir = cwd();
  const marketingPlaywright = join(rootDir, 'marketing', 'node_modules', '.bin', 'playwright');
  const exists = await executor.exists(marketingPlaywright);
  if (exists) {
    return {
      name: 'playwright',
      available: true,
      path: marketingPlaywright,
    };
  }

  // Try system playwright
  try {
    const result = await executor.exec('which playwright', { capture: true });
    if (result.exitCode === 0 && result.stdout.trim()) {
      return {
        name: 'playwright',
        available: true,
        path: result.stdout.trim(),
      };
    }
  } catch {
    // ignore
  }

  return {
    name: 'playwright',
    available: false,
    error: 'playwright not found in marketing/node_modules/.bin/ or PATH',
  };
}

// ------------------------------------------------------------------------------------------------
// Main Preflight Function
// ------------------------------------------------------------------------------------------------

/**
 * Run full host tool preflight check.
 *
 * @param executor - Process executor (for test injection)
 * @param options - Preflight options
 * @returns Preflight result with all tool availability
 * @throws PreflightError if critical tools are missing
 */
export async function runPreflight(
  executor: ProcessExecutor,
  options: {
    skipAndroid?: boolean;
    skipPlaywright?: boolean;
    requireBootedDevice?: boolean;
  } = {},
): Promise<PreflightResult> {
  const { skipAndroid = false, skipPlaywright = false, requireBootedDevice = false } = options;

  const tools: ToolAvailability[] = [];

  // Check xcrun
  const xcrunResult = await checkToolAvailability('xcrun', ENV_PATHS.xcrun, executor);
  tools.push(xcrunResult);

  // Check FFmpeg
  const ffmpegResult = await checkToolAvailability('ffmpeg', ENV_PATHS.ffmpeg, executor);
  tools.push(ffmpegResult);

  // Check FFprobe
  const ffprobeResult = await checkToolAvailability('ffprobe', ENV_PATHS.ffprobe, executor);
  tools.push(ffprobeResult);

  // Check Playwright
  const playwrightResult = await checkPlaywright(ENV_PATHS.playwright, executor);
  if (!skipPlaywright) {
    tools.push(playwrightResult);
  }

  // iOS device check
  let iosInfo: PreflightResult['ios'] | undefined;
  if (xcrunResult.available && xcrunResult.path) {
    const { devices, bootedDevice } = await checkIOSDevices(xcrunResult.path, executor);
    iosInfo = {
      xcrunAvailable: true,
      bootedDeviceId: bootedDevice?.udid,
      bootedDeviceName: bootedDevice?.name,
      simulators: devices.map((d) => `${d.name} (${d.state})`),
    };
  } else {
    iosInfo = {
      xcrunAvailable: false,
      simulators: [],
    };
  }

  // Android device check
  let androidInfo: PreflightResult['android'] | undefined;
  if (!skipAndroid) {
    const adbResult = await checkToolAvailability('adb', ENV_PATHS.adb, executor);
    tools.push(adbResult);

    if (adbResult.available && adbResult.path) {
      const { devices, runningDevice } = await checkAndroidDevices(adbResult.path, executor);
      androidInfo = {
        adbAvailable: true,
        emulators: devices.map((d) => `${d.model ?? d.serial} (${d.state})`),
        runningEmulatorId: runningDevice?.serial,
      };
    } else {
      androidInfo = {
        adbAvailable: false,
        emulators: [],
      };
    }
  }

  // Determine overall availability
  const allAvailable =
    xcrunResult.available &&
    ffmpegResult.available &&
    ffprobeResult.available &&
    (!requireBootedDevice ||
      iosInfo?.bootedDeviceId != null ||
      androidInfo?.runningEmulatorId != null);

  return {
    allAvailable,
    tools,
    ios: iosInfo,
    android: androidInfo,
    playwrightAvailable: playwrightResult.available,
    ffmpegAvailable: ffmpegResult.available,
    ffprobeAvailable: ffprobeResult.available,
  };
}

/**
 * Assert preflight passes, throw PreflightError if not.
 */
export async function assertPreflight(
  executor: ProcessExecutor,
  options?: {
    skipAndroid?: boolean;
    skipPlaywright?: boolean;
    requireBootedDevice?: boolean;
  },
): Promise<PreflightResult> {
  const result = await runPreflight(executor, options);

  if (!result.allAvailable) {
    const missing: string[] = [];

    for (const tool of result.tools) {
      if (!tool.available) {
        missing.push(`${tool.name}: ${tool.error ?? 'not found'}`);
      }
    }

    if (options?.requireBootedDevice) {
      if (!result.ios?.bootedDeviceId && !result.android?.runningEmulatorId) {
        missing.push('no booted iOS device or running Android emulator');
      }
    }

    throw new PreflightError(`Preflight failed: ${missing.join('; ')}`, { missing });
  }

  return result;
}

/**
 * Format preflight result for display.
 */
export function formatPreflightResult(result: PreflightResult): string {
  const lines: string[] = [];

  lines.push('=== Host Tool Preflight ===');
  lines.push('');

  for (const tool of result.tools) {
    const status = tool.available ? '✓' : '✗';
    const path = tool.path ? ` (${tool.path})` : '';
    const version = tool.version ? ` - ${tool.version}` : '';
    const error = tool.error ? ` - ${tool.error}` : '';
    lines.push(`  ${status} ${tool.name}${path}${version}${error}`);
  }

  lines.push('');
  lines.push('=== iOS Simulator ===');
  if (result.ios) {
    lines.push(`  xcrun available: ${result.ios.xcrunAvailable}`);
    if (result.ios.bootedDeviceId) {
      lines.push(`  Booted: ${result.ios.bootedDeviceName} (${result.ios.bootedDeviceId})`);
    } else {
      lines.push('  Booted: none');
    }
    lines.push(
      `  Simulators: ${result.ios.simulators.length > 0 ? result.ios.simulators.join(', ') : 'none'}`,
    );
  }

  lines.push('');
  lines.push('=== Android ===');
  if (result.android) {
    lines.push(`  adb available: ${result.android.adbAvailable}`);
    if (result.android.runningEmulatorId) {
      lines.push(`  Running: ${result.android.runningEmulatorId}`);
    } else {
      lines.push('  Running: none');
    }
    lines.push(
      `  Emulators: ${result.android.emulators.length > 0 ? result.android.emulators.join(', ') : 'none'}`,
    );
  }

  lines.push('');
  lines.push(`Overall: ${result.allAvailable ? 'PASS' : 'FAIL'}`);

  return lines.join('\n');
}
