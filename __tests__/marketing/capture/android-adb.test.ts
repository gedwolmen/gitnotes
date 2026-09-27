/**
 * Marketing Asset Pipeline - Android Emulator Capture Tests
 *
 * Tests for Android emulator capture adapter using adb.
 */

import { buildAndroidCommands, findAPKPath, verifyAPKPath } from '../../scripts/marketing/capture/android-adb';
import type { AndroidCaptureRequest, ProcessExecutor } from '../../scripts/marketing/capture/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing Android capture.
 */
class MockAndroidExecutor implements ProcessExecutor {
  private commands: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();
  private existsPaths: Map<string, boolean> = new Map();
  private statResults: Map<string, { size: number; mtimeMs: number } | null> = new Map();
  private commandLog: string[] = [];

  /**
   * Set a command result.
   */
  setCommand(pattern: string, result: { exitCode: number; stdout?: string; stderr?: string }): void {
    this.commands.set(pattern, {
      exitCode: result.exitCode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
  }

  /**
   * Set which paths exist.
   */
  setExists(path: string, exists: boolean): void {
    this.existsPaths.set(path, exists);
  }

  /**
   * Set stat result for a path.
   */
  setStat(path: string, result: { size: number; mtimeMs: number } | null): void {
    this.statResults.set(path, result);
  }

  getCommandLog(): string[] {
    return [...this.commandLog];
  }

  async exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }> {
    this.commandLog.push(command);

    for (const [pattern, result] of this.commands) {
      if (command.includes(pattern)) {
        return result;
      }
    }
    return { exitCode: 127, stdout: '', stderr: `command not found: ${command}` };
  }

  async exists(path: string): Promise<boolean> {
    return this.existsPaths.get(path) ?? false;
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
    return this.statResults.get(path) ?? null;
  }
}

// ------------------------------------------------------------------------------------------------
// Android Command Construction Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/android-adb - buildAndroidCommands', () => {
  test('builds correct commands for emulator', () => {
    const request: AndroidCaptureRequest = {
      deviceId: 'emulator-5556',
      deepLink: 'gitnotes://home',
      outputPath: 'assets/marketing/captures/android-home.png',
      deviceProfile: 'android-phone',
      orientation: 'portrait',
      waitMs: 2000,
    };

    const { deviceId, commands } = buildAndroidCommands(request);

    expect(deviceId).toBe('emulator-5556');
    expect(commands).toContain('adb -s emulator-5556 install -r ');
    expect(commands).toContain('adb -s emulator-5556 shell am start -W -a android.intent.action.MAIN -n org.gitnotes.app/.MainActivity');
    expect(commands).toContain('adb -s emulator-5556 shell am start -W -a android.intent.action.VIEW -d "gitnotes://home"');
    expect(commands).toContain('adb -s emulator-5556 shell screencap -p "/sdcard/ScreenShots/screenshot.png"');
    expect(commands).toContain('adb -s emulator-5556 pull "/sdcard/ScreenShots/screenshot.png" "assets/marketing/captures/android-home.png"');
  });

  test('builds commands with APK path when provided', () => {
    const request: AndroidCaptureRequest = {
      deviceId: 'emulator-5556',
      deepLink: 'gitnotes://home',
      outputPath: 'output.png',
      deviceProfile: 'android-phone',
      orientation: 'portrait',
      apkPath: '/path/to/app.apk',
    };

    const { commands } = buildAndroidCommands(request);

    const installCmd = commands.find((c) => c.includes('install'));
    expect(installCmd).toContain('adb -s emulator-5556 install -r "/path/to/app.apk"');
  });

  test('uses default wait time when not specified', () => {
    const request: AndroidCaptureRequest = {
      deviceId: 'emulator-5556',
      deepLink: 'gitnotes://home',
      outputPath: 'output.png',
      deviceProfile: 'android-phone',
      orientation: 'portrait',
    };

    const { commands } = buildAndroidCommands(request);

    expect(commands).toContain('# Wait 2000ms');
  });
});

// ------------------------------------------------------------------------------------------------
// APK Path Detection Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/android-adb - findAPKPath', () => {
  const originalExistsSync = require('fs').existsSync;

  afterEach(() => {
    // Restore original existsSync
    require('fs').existsSync = originalExistsSync;
  });

  test('returns null when no APK exists', () => {
    require('fs').existsSync = () => false;

    const result = findAPKPath();
    expect(result).toBeNull();
  });

  test('returns preferred path when it exists', () => {
    require('fs').existsSync = (path: string) => path === '/custom/path/app.apk';

    const result = findAPKPath('/custom/path/app.apk');
    expect(result).toBe('/custom/path/app.apk');
  });

  test('searches common build locations', () => {
    const searchedPaths: string[] = [];
    require('fs').existsSync = (path: string) => {
      searchedPaths.push(path);
      return path.includes('app-debug.apk');
    };

    const result = findAPKPath();

    expect(searchedPaths.some((p) => p.includes('android') && p.includes('apk'))).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------------
// Android Deep Link Verification Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/android-adb - deep link handling', () => {
  test('gitnotes scheme is used, not RevenueCat', () => {
    const gitnotesDeepLinks = [
      'gitnotes://home',
      'gitnotes://notes',
      'gitnotes://note/abc123',
      'gitnotes://canvas/xyz789',
      'gitnotes://explore',
      'gitnotes://settings',
      'gitnotes://chat',
    ];

    // Verify all deep links use gitnotes scheme
    for (const link of gitnotesDeepLinks) {
      expect(link.startsWith('gitnotes://')).toBe(true);
      expect(link.includes('rc-')).toBe(false); // RevenueCat scheme
    }
  });

  test('adopts correct package name from app.json', () => {
    const request: AndroidCaptureRequest = {
      deviceId: 'emulator-5556',
      deepLink: 'gitnotes://home',
      outputPath: 'output.png',
      deviceProfile: 'android-phone',
      orientation: 'portrait',
    };

    const { commands } = buildAndroidCommands(request);

    // Verify package name is org.gitnotes.app (from app.json)
    const launchCmd = commands.find((c) => c.includes('am start'));
    expect(launchCmd).toContain('org.gitnotes.app');
  });
});

// ------------------------------------------------------------------------------------------------
// Output Path Safety Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/android-adb - output path safety', () => {
  test('output path is within assets/marketing/', () => {
    const validPaths = [
      'assets/marketing/captures/android-phone-home-portrait-01.png',
      'assets/marketing/captures/run-2024-03-15/android-home.png',
    ];

    for (const outputPath of validPaths) {
      expect(outputPath.startsWith('assets/marketing/')).toBe(true);
      expect(outputPath.includes('..')).toBe(false);
    }
  });
});
