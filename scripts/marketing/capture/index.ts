/**
 * Marketing Asset Pipeline - Capture Orchestration
 *
 * Unified capture interface for iOS Simulator and Android Emulator screenshots.
 * Supports dry-run mode and output validation.
 *
 * References:
 * - scripts/marketing/config.ts: Device profiles and dimensions
 * - scripts/marketing/manifest.ts: Output manifest and checksums
 * - docs/wiki/screens.md: Deep link routes
 * - app.json: Bundle ID and scheme (gitnotes only)
 */

import { resolve } from 'path';

import type {
  CaptureResult,
  DryRunResult,
  IOSCaptureRequest,
  AndroidCaptureRequest,
  PreflightResult,
} from './types';
import { PreflightError } from './types';

import { runPreflight, formatPreflightResult, NodeProcessExecutor } from './preflight';
import { captureIOS, buildIOSCommands } from './ios-simctl';
import { captureAndroid, buildAndroidCommands, findAPKPath } from './android-adb';

import { OUTPUT_DIRS, type DeviceProfile, type Orientation, type Route } from '../config';

import { generateRunId, buildDeepLink } from '../manifest';

// ------------------------------------------------------------------------------------------------
// Capture Options
// ------------------------------------------------------------------------------------------------

/**
 * Options for capture orchestration.
 */
export interface CaptureOptions {
  /** Dry-run mode (no actual capture) */
  dryRun?: boolean;
  /** Output directory (default: assets/marketing/captures) */
  outputDir?: string;
  /** Overwrite existing files */
  overwrite?: boolean;
  /** Skip iOS capture */
  skipIOS?: boolean;
  /** Skip Android capture */
  skipAndroid?: boolean;
  /** Only capture these routes */
  routes?: Route[];
  /** Only capture for these devices */
  devices?: DeviceProfile[];
  /** Wait time after deep link (ms) */
  waitMs?: number;
  /** Custom process executor (for testing) */
  executor?: import('./types').ProcessExecutor;
}

/**
 * Full capture result with metadata.
 */
export interface CaptureRunResult {
  /** Unique run ID */
  runId: string;
  /** Whether all captures succeeded */
  success: boolean;
  /** iOS capture results */
  ios?: CaptureResult;
  /** Android capture results */
  android?: CaptureResult;
  /** Preflight result */
  preflight: PreflightResult;
  /** Output paths */
  outputs: string[];
  /** Errors encountered */
  errors: string[];
  /** Commands executed */
  commands: string[];
  /** Elapsed time in ms */
  elapsedMs: number;
}

// ------------------------------------------------------------------------------------------------
// Capture Orchestration
// ------------------------------------------------------------------------------------------------

/**
 * Run preflight and capture for a single route.
 */
export async function captureRoute(
  route: Route,
  options: {
    platform: 'ios' | 'android';
    device: DeviceProfile;
    orientation: Orientation;
    executor: import('./types').ProcessExecutor;
    dryRun?: boolean;
    outputDir?: string;
    waitMs?: number;
    noteId?: string;
    canvasId?: string;
  },
): Promise<{ result: CaptureResult; deepLink: string; outputPath: string }> {
  const {
    platform,
    device,
    orientation,
    executor,
    dryRun = false,
    outputDir,
    waitMs,
    noteId,
    canvasId,
  } = options;

  // Build deep link
  const params: Record<string, string> = {};
  if (noteId) params.noteId = noteId;
  if (canvasId) params.canvasId = canvasId;
  const deepLink = buildDeepLink(route, params);

  // Build output path
  const filename = `${device}-${route}-${orientation}-${Date.now()}.png`;
  const outputPath = resolve(outputDir ?? OUTPUT_DIRS.captures, filename);

  if (platform === 'ios') {
    const request: IOSCaptureRequest = {
      deviceId: 'booted',
      deepLink,
      outputPath,
      deviceProfile: device,
      orientation,
      waitMs,
    };

    if (dryRun) {
      const { commands } = buildIOSCommands(request);
      return {
        result: {
          success: true,
          deviceId: 'booted',
          commands,
        },
        deepLink,
        outputPath,
      };
    }

    const result = await captureIOS(request, executor);
    return { result, deepLink, outputPath };
  } else {
    const request: AndroidCaptureRequest = {
      deviceId: 'emulator',
      deepLink,
      outputPath,
      deviceProfile: device,
      orientation,
      waitMs,
    };

    if (dryRun) {
      const { commands } = buildAndroidCommands(request);
      return {
        result: {
          success: true,
          deviceId: 'emulator',
          commands,
        },
        deepLink,
        outputPath,
      };
    }

    const result = await captureAndroid(request, executor);
    return { result, deepLink, outputPath };
  }
}

/**
 * Run full capture workflow.
 */
export async function runCapture(options: CaptureOptions = {}): Promise<CaptureRunResult> {
  const startTime = Date.now();
  const runId = generateRunId();

  const {
    dryRun = false,
    outputDir = OUTPUT_DIRS.captures,
    skipIOS = false,
    skipAndroid = false,
    executor = new NodeProcessExecutor(),
  } = options;

  const errors: string[] = [];
  const outputs: string[] = [];
  const commands: string[] = [];

  // Run preflight
  let preflight: PreflightResult;
  try {
    preflight = await runPreflight(executor, {
      skipAndroid,
      requireBootedDevice: !dryRun,
    });
  } catch (error) {
    throw new PreflightError(
      `Preflight failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (dryRun) {
    // In dry-run mode, just show what would happen
    const missing: string[] = [];
    const warnings: string[] = [];

    if (!preflight.ios?.xcrunAvailable) {
      missing.push('xcrun (iOS capture unavailable)');
    } else if (!preflight.ios.bootedDeviceId) {
      warnings.push('No booted iOS device - capture will fail unless device is booted');
    }

    if (!preflight.android?.adbAvailable) {
      missing.push('adb (Android capture unavailable)');
    } else if (!preflight.android.runningEmulatorId) {
      warnings.push('No running Android emulator - capture will fail unless emulator is started');
    }

    if (!preflight.ffmpegAvailable) {
      warnings.push('ffmpeg not available - video encoding will fail');
    }

    if (!preflight.ffprobeAvailable) {
      warnings.push('ffprobe not available - video validation will fail');
    }

    return {
      runId,
      success: missing.length === 0,
      preflight,
      outputs: [],
      errors: missing,
      commands: [],
      elapsedMs: Date.now() - startTime,
    };
  }

  // Real capture mode
  let iosResult: CaptureResult | undefined;
  let androidResult: CaptureResult | undefined;

  // iOS capture
  if (!skipIOS && preflight.ios?.bootedDeviceId) {
    try {
      const iosCapture = await captureRoute('home', {
        platform: 'ios',
        device: 'iphone-6.9-inch',
        orientation: 'portrait',
        executor,
        outputDir,
        waitMs: options.waitMs,
      });

      iosResult = iosCapture.result;
      if (iosResult.success && iosResult.outputPath) {
        outputs.push(iosResult.outputPath);
      } else if (iosResult.error) {
        errors.push(`iOS: ${iosResult.error}`);
      }
    } catch (error) {
      errors.push(`iOS capture error: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else if (!skipIOS) {
    errors.push('iOS capture skipped: no booted device or xcrun unavailable');
  }

  // Android capture
  if (!skipAndroid && preflight.android?.runningEmulatorId) {
    const apkPath = findAPKPath();

    if (!apkPath) {
      errors.push(
        'Android capture skipped: no APK found. Build with `yarn android` or `eas build --profile development --platform android`',
      );
    } else {
      try {
        const androidCapture = await captureRoute('home', {
          platform: 'android',
          device: 'android-phone',
          orientation: 'portrait',
          executor,
          outputDir,
          waitMs: options.waitMs,
        });

        androidResult = androidCapture.result;
        if (androidResult.success && androidResult.outputPath) {
          outputs.push(androidResult.outputPath);
        } else if (androidResult.error) {
          errors.push(`Android: ${androidResult.error}`);
        }
      } catch (error) {
        errors.push(
          `Android capture error: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  } else if (!skipAndroid) {
    errors.push('Android capture skipped: no running emulator or adb unavailable');
  }

  const success = errors.length === 0 && outputs.length > 0;

  return {
    runId,
    success,
    preflight,
    ios: iosResult,
    android: androidResult,
    outputs,
    errors,
    commands,
    elapsedMs: Date.now() - startTime,
  };
}

/**
 * Run dry-run and return planned actions.
 */
export async function runDryRun(
  options: Omit<CaptureOptions, 'dryRun'> = {},
): Promise<DryRunResult> {
  const executor = options.executor ?? new NodeProcessExecutor();

  const preflight = await runPreflight(executor, {
    skipAndroid: options.skipAndroid,
    requireBootedDevice: false,
  });

  const missing: string[] = [];
  const warnings: string[] = [];

  if (!preflight.ios?.xcrunAvailable) {
    missing.push('xcrun');
  }

  if (!preflight.ffmpegAvailable) {
    missing.push('ffmpeg');
  }

  if (!preflight.ffprobeAvailable) {
    missing.push('ffprobe');
  }

  if (!preflight.playwrightAvailable) {
    missing.push('playwright');
  }

  if (!preflight.android?.adbAvailable) {
    missing.push('adb');
  }

  const result: DryRunResult = {
    preflightPassed: missing.length === 0,
    missing,
    warnings,
  };

  // Add iOS capture plan if xcrun is available
  if (preflight.ios?.xcrunAvailable) {
    const device = options.devices?.[0] ?? 'iphone-6.9-inch';
    const route = options.routes?.[0] ?? 'home';
    const orientation = options.devices?.includes('ipad-13-inch') ? 'landscape' : 'portrait';

    const deepLink = buildDeepLink(route);
    const outputDir = options.outputDir ?? OUTPUT_DIRS.captures;
    const filename = `${device}-${route}-${orientation}-<timestamp>.png`;
    const outputPath = resolve(outputDir, filename);

    const request: IOSCaptureRequest = {
      deviceId: preflight.ios.bootedDeviceId ?? 'booted',
      deepLink,
      outputPath,
      deviceProfile: device,
      orientation,
      waitMs: options.waitMs,
    };

    const { commands } = buildIOSCommands(request);
    result.iosCapture = {
      deviceId: preflight.ios.bootedDeviceId ?? 'booted',
      deepLink,
      outputPath,
      commands,
    };
  }

  // Add Android capture plan if adb is available
  if (preflight.android?.adbAvailable) {
    const device = options.devices?.find((d) => d.startsWith('android')) ?? 'android-phone';
    const route = options.routes?.[0] ?? 'home';
    const orientation = 'portrait';

    const deepLink = buildDeepLink(route);
    const outputDir = options.outputDir ?? OUTPUT_DIRS.captures;
    const filename = `${device}-${route}-${orientation}-<timestamp>.png`;
    const outputPath = resolve(outputDir, filename);

    const apkPath = findAPKPath();

    const request: AndroidCaptureRequest = {
      deviceId: preflight.android.runningEmulatorId ?? 'emulator',
      deepLink,
      outputPath,
      deviceProfile: device,
      orientation,
      apkPath: apkPath ?? undefined,
      waitMs: options.waitMs,
    };

    const { commands } = buildAndroidCommands(request);
    result.androidCapture = {
      deviceId: preflight.android.runningEmulatorId ?? 'emulator',
      deepLink,
      outputPath,
      commands,
    };
  }

  return result;
}

/**
 * Format dry-run result for display.
 */
export function formatDryRun(result: DryRunResult): string {
  const lines: string[] = [];

  lines.push('=== Dry Run: Marketing Capture ===');
  lines.push('');
  lines.push(`Preflight: ${result.preflightPassed ? 'PASS' : 'FAIL'}`);

  if (result.missing.length > 0) {
    lines.push('');
    lines.push('Missing tools:');
    for (const tool of result.missing) {
      lines.push(`  - ${tool}`);
    }
  }

  if (result.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const warning of result.warnings) {
      lines.push(`  - ${warning}`);
    }
  }

  if (result.iosCapture) {
    lines.push('');
    lines.push('=== iOS Capture ===');
    lines.push(`Device: ${result.iosCapture.deviceId}`);
    lines.push(`Deep Link: ${result.iosCapture.deepLink}`);
    lines.push(`Output: ${result.iosCapture.outputPath}`);
    lines.push('Commands:');
    for (const cmd of result.iosCapture.commands) {
      lines.push(`  ${cmd}`);
    }
  }

  if (result.androidCapture) {
    lines.push('');
    lines.push('=== Android Capture ===');
    lines.push(`Device: ${result.androidCapture.deviceId}`);
    lines.push(`Deep Link: ${result.androidCapture.deepLink}`);
    lines.push(`Output: ${result.androidCapture.outputPath}`);
    lines.push('Commands:');
    for (const cmd of result.androidCapture.commands) {
      lines.push(`  ${cmd}`);
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
Marketing Capture CLI

Usage:
  node scripts/marketing/capture/index.js [options]

Options:
  --dry-run       Show what would be captured without capturing
  --help, -h      Show this help

Environment Variables:
  XCRUN_PATH      Path to xcrun (default: search PATH)
  ADB_PATH        Path to adb (default: search PATH)
  FFMPEG_PATH     Path to ffmpeg (default: search PATH)
  FFPROBE_PATH    Path to ffprobe (default: search PATH)

Examples:
  # Dry run to see what would be captured
  node scripts/marketing/capture/index.js --dry-run

  # Run preflight check
  node scripts/marketing/capture/index.js
`);
    return 0;
  }

  if (dryRun) {
    const result = await runDryRun();
    console.log(formatDryRun(result));
    return result.preflightPassed ? 0 : 1;
  }

  // Run full capture
  console.log('Running marketing capture...');

  const result = await runCapture();

  console.log(`\nPreflight result:\n${formatPreflightResult(result.preflight)}`);

  if (result.ios) {
    console.log(`\niOS capture: ${result.ios.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.ios.error) console.log(`  Error: ${result.ios.error}`);
  }

  if (result.android) {
    console.log(`\nAndroid capture: ${result.android.success ? 'SUCCESS' : 'FAILED'}`);
    if (result.android.error) console.log(`  Error: ${result.android.error}`);
  }

  console.log(`\nOutputs: ${result.outputs.length}`);
  for (const output of result.outputs) {
    console.log(`  ${output}`);
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors: ${result.errors.length}`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log(`\nElapsed: ${result.elapsedMs}ms`);

  return result.success ? 0 : 1;
}

// Allow running as CLI script
if (require.main === module) {
  main(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
