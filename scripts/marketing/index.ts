/**
 * Marketing Asset Pipeline - Unified CLI
 *
 * Single entry point for all marketing asset generation commands.
 * Supports: preflight, capture, store, video, generate, dry-run, clean, manifest.
 *
 * Usage:
 *   node scripts/marketing/index.js <command> [options]
 *
 * Commands:
 *   preflight     Check host tool availability (xcrun, adb, ffmpeg, ffprobe)
 *   capture       Capture screenshots from iOS/Android simulators
 *   store         Export store-ready compositions
 *   video         Export video previews at multiple ratios
 *   generate      Run full pipeline (preflight → capture → store → video)
 *   clean         Remove generated marketing assets
 *   manifest      Validate manifest files
 *   studio        Open marketing studio (yarn --cwd marketing)
 *
 * Examples:
 *   node scripts/marketing/index.js preflight
 *   node scripts/marketing/index.js capture --dry-run
 *   node scripts/marketing/index.js generate --profile iphone-6.9-inch
 *   node scripts/marketing/index.js clean --dry-run
 */

import { existsSync, readdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { cwd } from 'process';

import { runPreflight, formatPreflightResult, NodeProcessExecutor } from './capture/preflight';
import type { ProcessExecutor } from './capture/types';
import { runCapture, runDryRun, formatDryRun } from './capture/index';
import { exportStore } from './store/export';
import { exportVideos } from './video/index';
import {
  OUTPUT_DIRS,
  OUTPUT_ROOT,
  type DeviceProfile,
  type Orientation,
  type Route,
} from './config';
import { readManifest, validateManifest, computeManifestChecksum } from './manifest';

// ------------------------------------------------------------------------------------------------
// Exit Codes
// ------------------------------------------------------------------------------------------------

const EXIT = {
  SUCCESS: 0,
  GENERAL_ERROR: 1,
  PREFLIGHT_FAILED: 2,
  MISSING_TOOL: 3,
  MISSING_INPUT: 4,
  INVALID_CONFIG: 5,
  CLEAN_FAILED: 6,
  MANIFEST_INVALID: 7,
} as const;

// ------------------------------------------------------------------------------------------------
// CLI Arguments Parser
// ------------------------------------------------------------------------------------------------

interface ParsedArgs {
  command: string;
  options: Record<string, string | boolean>;
  flags: string[];
  positional: string[];
}

function parseArgs(args: string[]): ParsedArgs {
  const command = args[0] ?? 'help';
  const options: Record<string, string | boolean> = {};
  const flags: string[] = [];
  const positional: string[] = [];

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        options[key] = next;
        i++;
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith('-')) {
      flags.push(arg.slice(1));
    } else {
      positional.push(arg);
    }
  }

  return { command, options, flags, positional };
}

// ------------------------------------------------------------------------------------------------
// Help Formatter
// ------------------------------------------------------------------------------------------------

function showHelp(): void {
  console.log(`
Marketing Asset Pipeline CLI

Usage:
  node scripts/marketing/index.js <command> [options]

Commands:
  preflight          Check host tool availability
  capture            Capture screenshots from simulators
  store              Export store-ready compositions
  video              Export video previews at multiple ratios
  generate           Run full pipeline (preflight → capture → store → video)
  clean              Remove generated marketing assets
  manifest <path>    Validate a manifest file
  studio             Open marketing studio (marketing/)

Global Options:
  --dry-run          Show what would happen without executing
  --help, -h        Show this help
  --verbose         Show detailed output

Preflight Options:
  --skip-android     Skip Android tool checks
  --skip-playwright  Skip Playwright checks

Capture Options:
  --device <profile> Device profile (iphone-6.9-inch, ipad-13-inch, android-phone, etc.)
  --route <route>   Route to capture (home, notes, note-editor, etc.)
  --orientation <o>  Orientation (portrait, landscape)
  --skip-ios         Skip iOS capture
  --skip-android     Skip Android capture
  --output <dir>     Output directory

Store Options:
  --store <type>     Store type (apple-app-store, google-play)
  --format <fmt>     Output format (png, jpeg)
  --theme <theme>    Theme (clean-light, dark-bold)
  --overwrite        Overwrite existing files

Video Options:
  --input <path>     Input image for video encoding
  --profile <prof>   Encoding profile (app-store, social, minimal)
  --duration <sec>  Video duration in seconds (default: 15)

Clean Options:
  --force            Skip safety confirmation
  --runs             Only clean runs/ directory
  --exports          Only clean exports/ directory
  --captures         Only clean captures/ directory
  --all              Clean all marketing output directories

Generate Options:
  --profile <p>      Device profile for generation
  --route <r>        Route for generation
  --skip-store       Skip store export
  --skip-video       Skip video export

Exit Codes:
  0   Success
  1   General error
  2   Preflight failed (missing tools)
  3   Missing tool
  4   Missing input
  5   Invalid configuration
  6   Clean failed (unsafe path)
  7   Manifest invalid

Examples:
  # Check what tools are available
  node scripts/marketing/index.js preflight

  # Dry run capture
  node scripts/marketing/index.js capture --dry-run

  # Capture for specific device
  node scripts/marketing/index.js capture --device iphone-6.9-inch --route home

  # Run full generation pipeline
  node scripts/marketing/index.js generate --profile iphone-6.9-inch

  # Clean all generated assets (dry run)
  node scripts/marketing/index.js clean --dry-run

  # Validate a manifest
  node scripts/marketing/index.js manifest assets/marketing/store/apple/run-xxx.manifest.json

Environment Variables:
  XCRUN_PATH        Path to xcrun (default: search PATH)
  ADB_PATH          Path to adb (default: search PATH)
  FFMPEG_PATH       Path to ffmpeg (default: search PATH)
  FFPROBE_PATH      Path to ffprobe (default: search PATH)
  PLAYWRIGHT_PATH   Path to playwright (default: search PATH)
`);
}

// ------------------------------------------------------------------------------------------------
// Preflight Command
// ------------------------------------------------------------------------------------------------

async function cmdPreflight(
  options: Record<string, string | boolean>,
  executor: ProcessExecutor,
): Promise<number> {
  const skipAndroid = options['skip-android'] === true || options['skip-android'] === 'true';
  const skipPlaywright =
    options['skip-playwright'] === true || options['skip-playwright'] === 'true';
  const verbose = options['verbose'] === true;

  const result = await runPreflight(executor, {
    skipAndroid: skipAndroid as boolean,
    skipPlaywright: skipPlaywright as boolean,
    requireBootedDevice: false,
  });

  console.log(formatPreflightResult(result));

  if (verbose) {
    console.log('\n=== Detailed Tool Status ===');
    for (const tool of result.tools) {
      if (!tool.available) {
        console.log(`  ✗ ${tool.name}: ${tool.error ?? 'not found'}`);
      } else {
        console.log(`  ✓ ${tool.name}${tool.version ? ` (${tool.version})` : ''}`);
      }
    }
  }

  // Report each missing tool with nonzero exit and tool name
  const missing = result.tools.filter((t) => !t.available);
  if (missing.length > 0) {
    console.log('\nMissing tools:');
    for (const tool of missing) {
      console.log(`  - ${tool.name}: ${tool.error ?? 'not found'}`);
    }
    return EXIT.PREFLIGHT_FAILED;
  }

  if (!result.allAvailable) {
    return EXIT.PREFLIGHT_FAILED;
  }

  return EXIT.SUCCESS;
}

// ------------------------------------------------------------------------------------------------
// Capture Command
// ------------------------------------------------------------------------------------------------

async function cmdCapture(
  options: Record<string, string | boolean>,
  executor: ProcessExecutor,
): Promise<number> {
  const dryRun = options['dry-run'] === true;
  const device = (options['device'] as string) ?? 'iphone-6.9-inch';
  const route = (options['route'] as string) ?? 'home';
  const outputDir = (options['output'] as string) ?? OUTPUT_DIRS.captures;
  const skipIOS = options['skip-ios'] === true || options['skip-ios'] === 'true';
  const skipAndroid = options['skip-android'] === true || options['skip-android'] === 'true';

  if (dryRun) {
    const result = await runDryRun({
      executor,
      devices: [device as DeviceProfile],
      routes: [route as Route],
      outputDir,
      skipAndroid: skipAndroid as boolean,
    });
    console.log(formatDryRun(result));
    return result.preflightPassed ? EXIT.SUCCESS : EXIT.PREFLIGHT_FAILED;
  }

  const result = await runCapture({
    executor,
    outputDir,
    skipIOS: skipIOS as boolean,
    skipAndroid: skipAndroid as boolean,
  });

  console.log(`\nCapture complete.`);
  console.log(`Outputs: ${result.outputs.length}`);
  for (const output of result.outputs) {
    console.log(`  ${output}`);
  }

  if (result.errors.length > 0) {
    console.log(`\nErrors: ${result.errors.length}`);
    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
    return EXIT.GENERAL_ERROR;
  }

  return result.success ? EXIT.SUCCESS : EXIT.GENERAL_ERROR;
}

// ------------------------------------------------------------------------------------------------
// Store Command
// ------------------------------------------------------------------------------------------------

async function cmdStore(
  options: Record<string, string | boolean>,
  _executor: ProcessExecutor,
): Promise<number> {
  const dryRun = options['dry-run'] === true;
  const storeType = (options['store'] as string) ?? 'apple-app-store';
  const format = (options['format'] as string) ?? 'png';
  const themeName = (options['theme'] as string) ?? 'clean-light';
  const overwrite = options['overwrite'] === true;
  const outputDir = (options['output'] as string) ?? OUTPUT_DIRS.store;
  const device = (options['device'] as string) ?? 'iphone-6.9-inch';
  const orientation = (options['orientation'] as string) ?? 'portrait';

  if (dryRun) {
    console.log('=== Dry Run: Store Export ===');
    console.log(`Store: ${storeType}`);
    console.log(`Format: ${format}`);
    console.log(`Theme: ${themeName}`);
    console.log(`Output: ${outputDir}`);
    console.log(`Overwrite: ${overwrite}`);
    console.log('\nNote: Store export requires source captures from capture command.');
    return EXIT.SUCCESS;
  }

  // Import themes dynamically
  const { THEME_CLEAN_LIGHT, THEME_DARK_BOLD } = await import('./store/themes');
  const themes: Record<string, typeof THEME_CLEAN_LIGHT> = {
    'clean-light': THEME_CLEAN_LIGHT,
    'dark-bold': THEME_DARK_BOLD,
  };
  const theme = themes[themeName];
  if (!theme) {
    console.error(`Unknown theme: ${themeName}`);
    console.error(`Available themes: ${Object.keys(themes).join(', ')}`);
    return EXIT.INVALID_CONFIG;
  }

  // Build slides from captures
  const capturesDir = OUTPUT_DIRS.captures;
  if (!existsSync(capturesDir)) {
    console.error(`No captures found at ${capturesDir}. Run 'capture' command first.`);
    return EXIT.MISSING_INPUT;
  }

  // Get all capture files
  let captureFiles: string[] = [];
  try {
    captureFiles = readdirSync(capturesDir).filter((f) => f.endsWith('.png') || f.endsWith('.jpg'));
  } catch {
    // Directory might be empty or inaccessible
  }

  if (captureFiles.length === 0) {
    console.error(`No capture files found in ${capturesDir}. Run 'capture' command first.`);
    return EXIT.MISSING_INPUT;
  }

  console.log(`Found ${captureFiles.length} capture files.`);
  console.log(`Exporting to ${outputDir}...`);

  // For now, export using first available capture
  const sampleCapture = captureFiles[0];

  try {
    const result = await exportStore({
      store: storeType as 'apple-app-store' | 'google-play',
      slides: [
        {
          id: `store-${Date.now()}`,
          layout: 'hero',
          device: device as DeviceProfile,
          orientation: orientation as Orientation,
          sourcePath: sampleCapture,
          headline: 'GitNotēs',
          index: 1,
        },
      ],
      theme,
      outputDir,
      format: format as 'png' | 'jpeg',
      sourceCapturesDir: capturesDir,
      overwrite,
    });

    if (result.success) {
      console.log(`\nExport complete. ${result.artifacts.length} artifacts.`);
      for (const artifact of result.artifacts) {
        console.log(`  ${artifact}`);
      }
      return EXIT.SUCCESS;
    } else {
      console.error(`\nExport failed:`);
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      return EXIT.GENERAL_ERROR;
    }
  } catch (error) {
    console.error(`Export error: ${error instanceof Error ? error.message : String(error)}`);
    return EXIT.GENERAL_ERROR;
  }
}

// ------------------------------------------------------------------------------------------------
// Video Command
// ------------------------------------------------------------------------------------------------

async function cmdVideo(
  options: Record<string, string | boolean>,
  executor: ProcessExecutor,
): Promise<number> {
  const dryRun = options['dry-run'] === true;
  const inputSource = (options['input'] as string) ?? join(OUTPUT_DIRS.captures, 'frame.png');
  const outputDir = (options['output'] as string) ?? OUTPUT_DIRS.exports;
  const profile = (options['profile'] as string) ?? 'social';
  const duration = parseInt((options['duration'] as string) ?? '15', 10);

  // Check if input exists
  if (!existsSync(inputSource)) {
    console.error(`Input file not found: ${inputSource}`);
    console.error(`Run 'capture' command first to create source images.`);
    return EXIT.MISSING_INPUT;
  }

  if (dryRun) {
    const { runVideoDryRun } = await import('./video/index');
    const result = await runVideoDryRun(inputSource, {
      executor,
      outputDir,
    });

    console.log('=== Dry Run: Video Export ===');
    console.log(`Input: ${inputSource}`);
    console.log(`Output: ${outputDir}`);
    console.log(`Profile: ${profile}`);
    console.log(`Duration: ${duration}s`);
    console.log('\nFFmpeg Commands:');

    if (result.errors.length > 0) {
      for (const error of result.errors) {
        console.error(`  - ${error}`);
      }
      return EXIT.MISSING_TOOL;
    }

    for (const [ratio, cmd] of Object.entries(result.commands)) {
      console.log(`\n  ${ratio}:`);
      console.log(`    ${cmd}`);
    }

    return EXIT.SUCCESS;
  }

  const result = await exportVideos(inputSource, {
    executor,
    outputDir,
    profile: profile as 'app-store' | 'social' | 'minimal',
    duration,
  });

  const { formatVideoExportResult } = await import('./video/index');
  console.log(formatVideoExportResult(result));

  return result.success ? EXIT.SUCCESS : EXIT.GENERAL_ERROR;
}

// ------------------------------------------------------------------------------------------------
// Generate Command
// ------------------------------------------------------------------------------------------------

async function cmdGenerate(
  options: Record<string, string | boolean>,
  executor: ProcessExecutor,
): Promise<number> {
  const dryRun = options['dry-run'] === true;
  const profile = (options['profile'] as string) ?? 'iphone-6.9-inch';
  const route = (options['route'] as string) ?? 'home';
  const skipStore = options['skip-store'] === true;
  const skipVideo = options['skip-video'] === true;

  console.log('=== Marketing Asset Generation ===');
  console.log(`Profile: ${profile}`);
  console.log(`Route: ${route}`);
  console.log(`Dry run: ${dryRun}`);
  console.log('');

  // Step 1: Preflight
  console.log('Step 1: Running preflight...');
  const preflight = await runPreflight(executor, {
    requireBootedDevice: !dryRun,
  });

  if (!preflight.allAvailable) {
    console.error('\nPreflight failed. Missing tools:');
    for (const tool of preflight.tools) {
      if (!tool.available) {
        console.error(`  - ${tool.name}: ${tool.error ?? 'not found'}`);
      }
    }
    return EXIT.PREFLIGHT_FAILED;
  }
  console.log('Preflight passed.\n');

  if (dryRun) {
    console.log('(Dry run - skipping actual capture)');
    return EXIT.SUCCESS;
  }

  // Step 2: Capture
  console.log('Step 2: Capturing screenshots...');
  const captureResult = await runCapture({
    executor,
    devices: [profile as DeviceProfile],
    routes: [route as Route],
  });

  if (captureResult.outputs.length === 0) {
    console.warn('No captures generated. Check device availability.');
  } else {
    console.log(`Captured ${captureResult.outputs.length} screenshots.\n`);
  }

  // Step 3: Store Export
  if (!skipStore) {
    console.log('Step 3: Exporting store assets...');
    const { THEME_CLEAN_LIGHT } = await import('./store/themes');

    const capturesDir = OUTPUT_DIRS.captures;
    let captureFiles: string[] = [];
    try {
      captureFiles = readdirSync(capturesDir).filter(
        (f) => f.endsWith('.png') || f.endsWith('.jpg'),
      );
    } catch {
      // Ignore
    }

    if (captureFiles.length > 0) {
      const sampleCapture = captureFiles[0];
      const storeResult = await exportStore({
        store: 'apple-app-store',
        slides: [
          {
            id: `gen-${Date.now()}`,
            layout: 'hero',
            device: profile as DeviceProfile,
            orientation: 'portrait',
            sourcePath: sampleCapture,
            headline: 'GitNotēs',
            index: 1,
          },
        ],
        theme: THEME_CLEAN_LIGHT,
        outputDir: OUTPUT_DIRS.store,
        format: 'png',
        sourceCapturesDir: capturesDir,
      });

      if (storeResult.success) {
        console.log(`Store export complete. ${storeResult.artifacts.length} artifacts.`);
      } else {
        console.warn('Store export completed with errors:');
        for (const error of storeResult.errors) {
          console.warn(`  - ${error}`);
        }
      }
    } else {
      console.warn('No captures found for store export.');
    }
  }

  // Step 4: Video Export
  if (!skipVideo) {
    console.log('\nStep 4: Exporting video assets...');
    const inputSource = join(OUTPUT_DIRS.captures, captureResult.outputs[0] ?? 'frame.png');

    if (existsSync(inputSource)) {
      const videoResult = await exportVideos(inputSource, {
        executor,
      });

      if (videoResult.success) {
        console.log(`Video export complete. ${videoResult.exports.length} ratios.`);
      } else {
        console.warn('Video export completed with errors:');
        for (const error of videoResult.errors) {
          console.warn(`  - ${error}`);
        }
      }
    } else {
      console.warn('No capture source for video export.');
    }
  }

  console.log('\n=== Generation Complete ===');
  return EXIT.SUCCESS;
}

// ------------------------------------------------------------------------------------------------
// Clean Command
// ------------------------------------------------------------------------------------------------

interface CleanOptions {
  dryRun?: boolean;
  force?: boolean;
  runs?: boolean;
  exports?: boolean;
  captures?: boolean;
  all?: boolean;
}

function getCleanTargets(options: CleanOptions): string[] {
  const targets: string[] = [];

  // If specific targets are specified, only clean those
  if (options.runs) {
    targets.push(OUTPUT_DIRS.runs);
  }
  if (options.exports) {
    targets.push(OUTPUT_DIRS.exports);
  }
  if (options.captures) {
    targets.push(OUTPUT_DIRS.captures);
  }

  // Default: all directories
  if (options.all || targets.length === 0) {
    targets.push(OUTPUT_DIRS.runs);
    targets.push(OUTPUT_DIRS.exports);
    targets.push(OUTPUT_DIRS.captures);
    // Also clean store/social subdirectories
    targets.push(join(OUTPUT_DIRS.store, 'apple'));
    targets.push(join(OUTPUT_DIRS.store, 'google-play'));
    targets.push(OUTPUT_DIRS.social);
  }

  return targets;
}

async function cmdClean(
  options: Record<string, string | boolean>,
  _executor: ProcessExecutor,
): Promise<number> {
  const dryRun = options['dry-run'] === true;
  const force = options['force'] === true;
  const runs = options['runs'] === true;
  const exports = options['exports'] === true;
  const captures = options['captures'] === true;
  const all = options['all'] === true;

  const cleanOptions: CleanOptions = { dryRun, force, runs, exports, captures, all };
  const targets = getCleanTargets(cleanOptions);

  // Safety check: ensure all targets are within OUTPUT_ROOT
  const marketingRoot = resolve(cwd(), 'assets/marketing');

  for (const target of targets) {
    const absoluteTarget = resolve(cwd(), target);
    const normalizedTarget = absoluteTarget.replace(/\\/g, '/');
    const normalizedRoot = marketingRoot.replace(/\\/g, '/');

    if (!normalizedTarget.startsWith(normalizedRoot + '/') && normalizedTarget !== normalizedRoot) {
      console.error(`\nUnsafe path rejected: ${target}`);
      console.error(`Clean can only remove files under ${OUTPUT_ROOT}/`);
      return EXIT.CLEAN_FAILED;
    }
  }

  console.log('=== Marketing Asset Clean ===');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  let totalFiles = 0;
  let totalSize = 0;

  for (const target of targets) {
    const absoluteTarget = resolve(cwd(), target);

    if (!existsSync(absoluteTarget)) {
      console.log(`  ${target}/: (does not exist, skipping)`);
      continue;
    }

    try {
      const stats = getDirectoryStats(absoluteTarget);
      if (stats.fileCount === 0) {
        console.log(`  ${target}/: (empty, skipping)`);
        continue;
      }

      console.log(`  ${target}/:`);
      console.log(`    ${stats.fileCount} files, ${formatBytes(stats.totalSize)}`);

      if (dryRun) {
        console.log('    (would delete)');
      } else {
        rmSync(absoluteTarget, { recursive: true, force: true });
        console.log('    (deleted)');
      }

      totalFiles += stats.fileCount;
      totalSize += stats.totalSize;
    } catch (error) {
      console.error(
        `  ${target}/: Error - ${error instanceof Error ? error.message : String(error)}`,
      );
      return EXIT.CLEAN_FAILED;
    }
  }

  console.log('');
  console.log(`Total: ${totalFiles} files, ${formatBytes(totalSize)}`);
  console.log(`\nClean ${dryRun ? 'would remove' : 'removed'} all marketing run outputs.`);
  console.log('Manifest files in exports/ are preserved.');

  return EXIT.SUCCESS;
}

function getDirectoryStats(dir: string): { fileCount: number; totalSize: number } {
  let fileCount = 0;
  let totalSize = 0;

  if (!existsSync(dir)) {
    return { fileCount: 0, totalSize: 0 };
  }

  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = join(dir, item.name);
    if (item.isDirectory()) {
      const subStats = getDirectoryStats(fullPath);
      fileCount += subStats.fileCount;
      totalSize += subStats.totalSize;
    } else if (item.isFile()) {
      try {
        const { statSync } = require('fs');
        const stats = statSync(fullPath);
        fileCount++;
        totalSize += stats.size;
      } catch {
        // Ignore inaccessible files
      }
    }
  }

  return { fileCount, totalSize };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// ------------------------------------------------------------------------------------------------
// Manifest Command
// ------------------------------------------------------------------------------------------------

async function cmdManifest(
  options: Record<string, string | boolean>,
  positional: string[],
): Promise<number> {
  const manifestPath = positional[0] as string | undefined;

  if (!manifestPath) {
    console.error('Manifest path required:');
    console.error('  node scripts/marketing/index.js manifest <path>');
    return EXIT.GENERAL_ERROR;
  }

  if (!existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    return EXIT.MISSING_INPUT;
  }

  try {
    const manifest = readManifest(manifestPath);
    if (!manifest) {
      console.error(`Failed to parse manifest: ${manifestPath}`);
      return EXIT.MANIFEST_INVALID;
    }

    // Validate manifest structure
    const errors = validateManifest(manifest);
    if (errors.length > 0) {
      console.error(`Manifest validation failed:`);
      for (const error of errors) {
        console.error(`  - ${error}`);
      }
      return EXIT.MANIFEST_INVALID;
    }

    // Compute checksum
    const checksum = computeManifestChecksum(manifest);

    console.log('=== Manifest Validation ===');
    console.log(`Path: ${manifestPath}`);
    console.log(`Run ID: ${manifest.runId}`);
    console.log(`Generated: ${manifest.generatedAt}`);
    console.log(`Pipeline: ${manifest.pipelineVersion}`);
    console.log(`Sources: ${manifest.sources.length}`);
    console.log(`Artifacts: ${manifest.artifacts.length}`);
    console.log(`Tools: ${manifest.tools.length}`);
    if (manifest.gitCommit) {
      console.log(`Git: ${manifest.gitCommit}`);
    }
    console.log(`Checksum: ${checksum}`);
    console.log('\nValidation: PASSED');

    return EXIT.SUCCESS;
  } catch (error) {
    console.error(
      `Error reading manifest: ${error instanceof Error ? error.message : String(error)}`,
    );
    return EXIT.MANIFEST_INVALID;
  }
}

// ------------------------------------------------------------------------------------------------
// Studio Command
// ------------------------------------------------------------------------------------------------

async function cmdStudio(): Promise<number> {
  console.log('Opening marketing studio...');
  console.log('Run the following commands:');
  console.log('');
  console.log('  # Start the studio dev server');
  console.log('  yarn --cwd marketing dev');
  console.log('');
  console.log('  # Build for production');
  console.log('  yarn --cwd marketing build');
  console.log('');
  console.log('  # Run tests');
  console.log('  yarn --cwd marketing test');
  console.log('');
  console.log('See marketing/README.md for more details.');

  return EXIT.SUCCESS;
}

// ------------------------------------------------------------------------------------------------
// Main Entry Point
// ------------------------------------------------------------------------------------------------

export async function main(args: string[]): Promise<number> {
  const { command, options, positional } = parseArgs(args);

  // Create default executor
  const executor = new NodeProcessExecutor();

  // Route to command
  switch (command) {
    case 'preflight':
      return cmdPreflight(options, executor);

    case 'capture':
      return cmdCapture(options, executor);

    case 'store':
      return cmdStore(options, executor);

    case 'video':
      return cmdVideo(options, executor);

    case 'generate':
      return cmdGenerate(options, executor);

    case 'clean':
      return cmdClean(options, executor);

    case 'manifest':
      return cmdManifest(options, positional);

    case 'studio':
      return cmdStudio();

    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      return EXIT.SUCCESS;
  }
}

// Allow running as CLI script
if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exit(code);
    })
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(EXIT.GENERAL_ERROR);
    });
}
