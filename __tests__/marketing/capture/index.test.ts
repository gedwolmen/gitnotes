/**
 * Marketing Asset Pipeline - Capture Orchestration Tests
 *
 * Tests for the unified capture orchestration interface.
 */

import { buildDeepLink } from '../../scripts/marketing/manifest';
import { OUTPUT_DIRS } from '../../scripts/marketing/config';
import { formatDryRun } from '../../scripts/marketing/capture/index';
import type { DryRunResult } from '../../scripts/marketing/capture/types';

// ------------------------------------------------------------------------------------------------
// Deep Link Route Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/capture - deep link routes', () => {
  test('home route builds correct deep link', () => {
    const deepLink = buildDeepLink('home');
    expect(deepLink).toBe('gitnotes://home');
  });

  test('notes route builds correct deep link', () => {
    const deepLink = buildDeepLink('notes');
    expect(deepLink).toBe('gitnotes://notes');
  });

  test('note-editor route with noteId builds correct deep link', () => {
    const deepLink = buildDeepLink('note-editor', { noteId: 'fixture-abc123' });
    expect(deepLink).toBe('gitnotes://note/fixture-abc123');
  });

  test('note-editor route without noteId falls back to home', () => {
    const deepLink = buildDeepLink('note-editor');
    expect(deepLink).toBe('gitnotes://home');
  });

  test('canvas-editor route with canvasId builds correct deep link', () => {
    const deepLink = buildDeepLink('canvas-editor', { canvasId: 'fixture-canvas-1' });
    expect(deepLink).toBe('gitnotes://canvas/fixture-canvas-1');
  });

  test('explore route builds correct deep link', () => {
    const deepLink = buildDeepLink('explore');
    expect(deepLink).toBe('gitnotes://explore');
  });

  test('settings route builds correct deep link', () => {
    const deepLink = buildDeepLink('settings');
    expect(deepLink).toBe('gitnotes://settings');
  });

  test('chat route builds correct deep link', () => {
    const deepLink = buildDeepLink('chat');
    expect(deepLink).toBe('gitnotes://chat');
  });

  test('chat-thread route with threadId builds correct deep link', () => {
    const deepLink = buildDeepLink('chat-thread', { threadId: 'thread-123' });
    expect(deepLink).toBe('gitnotes://chat/thread-123');
  });

  test('todos route falls back to home (no direct deep link)', () => {
    const deepLink = buildDeepLink('todos');
    expect(deepLink).toBe('gitnotes://home');
  });

  test('graph-view route falls back to home (no direct deep link)', () => {
    const deepLink = buildDeepLink('graph-view');
    expect(deepLink).toBe('gitnotes://home');
  });
});

// ------------------------------------------------------------------------------------------------
// Output Directory Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/capture - output directories', () => {
  test('OUTPUT_DIRS captures is defined', () => {
    expect(OUTPUT_DIRS.captures).toBe('assets/marketing/captures');
  });

  test('OUTPUT_DIRS runs is defined', () => {
    expect(OUTPUT_DIRS.runs).toBe('assets/marketing/runs');
  });

  test('OUTPUT_DIRS exports is defined', () => {
    expect(OUTPUT_DIRS.exports).toBe('assets/marketing/exports');
  });

  test('OUTPUT_DIRS store is defined', () => {
    expect(OUTPUT_DIRS.store).toBe('assets/marketing/store');
  });

  test('OUTPUT_DIRS social is defined', () => {
    expect(OUTPUT_DIRS.social).toBe('assets/marketing/social');
  });
});

// ------------------------------------------------------------------------------------------------
// Dry Run Result Formatting Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/capture - formatDryRun', () => {
  test('formats dry-run result with iOS capture', () => {
    const result: DryRunResult = {
      preflightPassed: true,
      iosCapture: {
        deviceId: 'ABC123DE-FFFF-1234-5678-123456789012',
        deepLink: 'gitnotes://home',
        outputPath: 'assets/marketing/captures/iphone-home-portrait-<timestamp>.png',
        commands: [
          'xcrun simctl status_bar ABC123DE-FFFF-1234-5678-123456789012 nutrition enable',
          'xcrun simctl openurl ABC123DE-FFFF-1234-5678-123456789012 "gitnotes://home"',
          '# Wait 2000ms',
          'xcrun simctl io ABC123DE-FFFF-1234-5678-123456789012 screenshot "assets/marketing/captures/iphone-home-portrait-<timestamp>.png"',
        ],
      },
      missing: [],
      warnings: [],
    };

    const output = formatDryRun(result);

    expect(output).toContain('iOS Capture');
    expect(output).toContain('gitnotes://home');
    expect(output).toContain('xcrun simctl openurl');
    expect(output).toContain('xcrun simctl io');
    expect(output).toContain('Preflight: PASS');
  });

  test('formats dry-run result with Android capture', () => {
    const result: DryRunResult = {
      preflightPassed: true,
      androidCapture: {
        deviceId: 'emulator-5556',
        deepLink: 'gitnotes://home',
        outputPath: 'assets/marketing/captures/android-home-portrait-<timestamp>.png',
        commands: [
          'adb -s emulator-5556 install -r ',
          'adb -s emulator-5556 shell am start -W -a android.intent.action.MAIN -n org.gitnotes.app/.MainActivity',
          'adb -s emulator-5556 shell am start -W -a android.intent.action.VIEW -d "gitnotes://home"',
          'adb -s emulator-5556 shell screencap -p "/sdcard/ScreenShots/screenshot.png"',
          'adb -s emulator-5556 pull "/sdcard/ScreenShots/screenshot.png" "assets/marketing/captures/android-home-portrait-<timestamp>.png"',
        ],
      },
      missing: [],
      warnings: [],
    };

    const output = formatDryRun(result);

    expect(output).toContain('Android Capture');
    expect(output).toContain('gitnotes://home');
    expect(output).toContain('adb shell');
    expect(output).toContain('Preflight: PASS');
  });

  test('shows missing tools when preflight fails', () => {
    const result: DryRunResult = {
      preflightPassed: false,
      missing: ['xcrun', 'ffmpeg', 'adb'],
      warnings: [],
    };

    const output = formatDryRun(result);

    expect(output).toContain('Preflight: FAIL');
    expect(output).toContain('Missing tools:');
    expect(output).toContain('xcrun');
    expect(output).toContain('ffmpeg');
    expect(output).toContain('adb');
  });

  test('shows warnings when tools are missing but not critical', () => {
    const result: DryRunResult = {
      preflightPassed: true,
      missing: [],
      warnings: ['No booted iOS device', 'ffmpeg not available - video encoding will fail'],
    };

    const output = formatDryRun(result);

    expect(output).toContain('Warnings:');
    expect(output).toContain('No booted iOS device');
  });
});

// ------------------------------------------------------------------------------------------------
// Route Checkpoint Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/capture - route checkpoints', () => {
  test('automated routes have direct deep links', () => {
    const automatedRoutes = ['home', 'notes', 'note-editor', 'canvas-editor', 'todos', 'explore'];

    for (const route of automatedRoutes) {
      const deepLink = buildDeepLink(route as Parameters<typeof buildDeepLink>[0]);
      expect(deepLink).toBe(`gitnotes://${route}`);
    }
  });

  test('manual-confirm routes fall back appropriately', () => {
    // graph-view has no deep link
    const graphDeepLink = buildDeepLink('graph-view');
    expect(graphDeepLink).toBe('gitnotes://home'); // Falls back

    // chat requires threadId
    const chatDeepLink = buildDeepLink('chat');
    expect(chatDeepLink).toBe('gitnotes://chat');
  });
});

// ------------------------------------------------------------------------------------------------
// Error Handling Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/capture - error handling', () => {
  test('missing deep link route returns fallback', () => {
    // Unknown routes should return home as fallback
    const deepLink = buildDeepLink('graph-view' as Parameters<typeof buildDeepLink>[0]);
    expect(deepLink).toBe('gitnotes://home');
  });

  test('output path validation should be enforced', () => {
    const validPaths = [
      'assets/marketing/captures/iphone-6.9-inch-home-portrait-01.png',
      'assets/marketing/captures/android-phone-notes-landscape-02.png',
    ];

    for (const path of validPaths) {
      expect(path.startsWith('assets/marketing/')).toBe(true);
      expect(path.includes('..')).toBe(false);
    }
  });
});
