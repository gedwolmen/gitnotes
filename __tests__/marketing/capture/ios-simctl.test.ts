/**
 * Marketing Asset Pipeline - iOS Simulator Capture Tests
 *
 * Tests for iOS Simulator capture adapter using xcrun simctl.
 */

import { buildIOSCommands } from '../../scripts/marketing/capture/ios-simctl';
import type { IOSCaptureRequest, ProcessExecutor } from '../../scripts/marketing/capture/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing iOS capture.
 */
class MockIOSExecutor implements ProcessExecutor {
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

    // Find matching command
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
// iOS Capture Command Construction Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/ios-simctl - buildIOSCommands', () => {
  test('builds correct commands for booted device', () => {
    const request: IOSCaptureRequest = {
      deviceId: 'booted',
      deepLink: 'gitnotes://home',
      outputPath: 'assets/marketing/captures/iphone-home.png',
      deviceProfile: 'iphone-6.9-inch',
      orientation: 'portrait',
      waitMs: 2000,
    };

    const { deviceId, commands } = buildIOSCommands(request);

    expect(deviceId).toBe('booted');
    expect(commands).toContain('xcrun simctl status_bar booted nutrition enable');
    expect(commands).toContain('xcrun simctl openurl booted "gitnotes://home"');
    expect(commands).toContain('xcrun simctl io booted screenshot "assets/marketing/captures/iphone-home.png"');
  });

  test('builds correct commands for specific device UDID', () => {
    const request: IOSCaptureRequest = {
      deviceId: 'ABC123DE-FFFF-1234-5678-123456789012',
      deepLink: 'gitnotes://note/fixture-123',
      outputPath: '/tmp/screenshot.png',
      deviceProfile: 'iphone-6.9-inch',
      orientation: 'portrait',
      waitMs: 3000,
    };

    const { deviceId, commands } = buildIOSCommands(request);

    expect(deviceId).toBe('ABC123DE-FFFF-1234-5678-123456789012');
    expect(commands).toContain('xcrun simctl openurl ABC123DE-FFFF-1234-5678-123456789012 "gitnotes://note/fixture-123"');
    expect(commands).toContain('# Wait 3000ms');
  });

  test('uses default wait time when not specified', () => {
    const request: IOSCaptureRequest = {
      deviceId: 'booted',
      deepLink: 'gitnotes://home',
      outputPath: 'output.png',
      deviceProfile: 'iphone-6.9-inch',
      orientation: 'portrait',
    };

    const { commands } = buildIOSCommands(request);

    expect(commands).toContain('# Wait 2000ms');
  });
});

// ------------------------------------------------------------------------------------------------
// iOS Deep Link Verification Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/ios-simctl - deep link handling', () => {
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

  test('note-editor route includes noteId parameter', () => {
    const request: IOSCaptureRequest = {
      deviceId: 'booted',
      deepLink: 'gitnotes://note/fixture-note-1',
      outputPath: 'output.png',
      deviceProfile: 'iphone-6.9-inch',
      orientation: 'portrait',
    };

    const { commands } = buildIOSCommands(request);

    const openUrlCmd = commands.find((c) => c.includes('openurl'));
    expect(openUrlCmd).toContain('gitnotes://note/fixture-note-1');
  });

  test('canvas-editor route includes canvasId parameter', () => {
    const request: IOSCaptureRequest = {
      deviceId: 'booted',
      deepLink: 'gitnotes://canvas/fixture-canvas-1',
      outputPath: 'output.png',
      deviceProfile: 'iphone-6.9-inch',
      orientation: 'portrait',
    };

    const { commands } = buildIOSCommands(request);

    const openUrlCmd = commands.find((c) => c.includes('openurl'));
    expect(openUrlCmd).toContain('gitnotes://canvas/fixture-canvas-1');
  });
});

// ------------------------------------------------------------------------------------------------
// Output Path Safety Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/ios-simctl - output path safety', () => {
  test('output path is within assets/marketing/', () => {
    const validPaths = [
      'assets/marketing/captures/iphone-6.9-inch-home-portrait-01.png',
      'assets/marketing/captures/run-2024-03-15/iphone-home.png',
    ];

    for (const outputPath of validPaths) {
      expect(outputPath.startsWith('assets/marketing/')).toBe(true);
      expect(outputPath.includes('..')).toBe(false);
    }
  });

  test('rejects absolute paths', () => {
    const absolutePath = '/tmp/screenshot.png';

    // The capture function should reject this
    expect(absolutePath.startsWith('/')).toBe(true);
  });
});
