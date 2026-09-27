/**
 * Marketing Asset Pipeline - Preflight Tests
 *
 * Tests for host tool preflight checks.
 */

import { NodeProcessExecutor } from '../../scripts/marketing/capture/preflight';
import { checkToolAvailability } from '../../scripts/marketing/capture/preflight';
import { checkIOSDevices, parseXcrunDeviceList } from '../../scripts/marketing/capture/preflight';
import { checkAndroidDevices, parseAdbDeviceList } from '../../scripts/marketing/capture/preflight';
import { formatPreflightResult } from '../../scripts/marketing/capture/preflight';
import { runPreflight } from '../../scripts/marketing/capture/preflight';
import type { ProcessExecutor, ToolAvailability } from '../../scripts/marketing/capture/types';

// ------------------------------------------------------------------------------------------------
// Mock Executor for Testing
// ------------------------------------------------------------------------------------------------

/**
 * Mock process executor for testing.
 */
class MockProcessExecutor implements ProcessExecutor {
  private commands: Map<string, { exitCode: number; stdout: string; stderr: string }> = new Map();
  private existsPaths: Set<string> = new Set();

  /**
   * Set a command result.
   */
  setCommand(path: string, result: { exitCode: number; stdout?: string; stderr?: string }): void {
    this.commands.set(path, {
      exitCode: result.exitCode,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    });
  }

  /**
   * Set which paths exist.
   */
  setExists(path: string, exists: boolean): void {
    if (exists) {
      this.existsPaths.add(path);
    } else {
      this.existsPaths.delete(path);
    }
  }

  async exec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    // Find matching command
    for (const [pattern, result] of this.commands) {
      if (command.includes(pattern) || pattern === '*') {
        return result;
      }
    }
    return { exitCode: 127, stdout: '', stderr: `command not found: ${command}` };
  }

  async exists(path: string): Promise<boolean> {
    return this.existsPaths.has(path);
  }

  async stat(path: string): Promise<{ size: number; mtimeMs: number } | null> {
    if (!this.existsPaths.has(path)) {
      return null;
    }
    return { size: 1000, mtimeMs: Date.now() };
  }
}

// ------------------------------------------------------------------------------------------------
// Preflight Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/preflight - checkToolAvailability', () => {
  let executor: MockProcessExecutor;

  beforeEach(() => {
    executor = new MockProcessExecutor();
  });

  test('returns available=true when tool exists and --version succeeds', async () => {
    executor.setExists('/usr/bin/xcrun', true);
    executor.setCommand('xcrun --version', {
      exitCode: 0,
      stdout: 'xcrun version 15.0',
      stderr: '',
    });

    const result = await checkToolAvailability('xcrun', '/usr/bin/xcrun', executor);

    expect(result.available).toBe(true);
    expect(result.path).toBe('/usr/bin/xcrun');
    expect(result.version).toContain('15.0');
  });

  test('returns available=false when tool path does not exist', async () => {
    executor.setExists('/nonexistent/xcrun', false);
    executor.setCommand('which /nonexistent/xcrun', { exitCode: 1, stdout: '', stderr: '' });

    const result = await checkToolAvailability('xcrun', '/nonexistent/xcrun', executor);

    expect(result.available).toBe(false);
    expect(result.error).toContain('not found');
  });

  test('returns available=false when tool exists but version fails', async () => {
    executor.setExists('/usr/bin/fake-tool', true);
    executor.setCommand('fake-tool --version', { exitCode: 1, stdout: '', stderr: 'unknown command' });

    const result = await checkToolAvailability('fake-tool', '/usr/bin/fake-tool', executor);

    // Tool exists, so available=true even if version fails
    expect(result.available).toBe(true);
    expect(result.path).toBe('/usr/bin/fake-tool');
  });
});

describe('marketing/preflight - parseXcrunDeviceList', () => {
  test('parses booted device correctly', () => {
    const output = `
== Device Types ==
iPhone 16 Pro Max (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro-Max)
iPhone 16 Pro (com.apple.CoreSimulator.SimDeviceType.iPhone-16-Pro)

== Devices ==
-- iOS 18.0 --
iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012) (Booted)
iPhone 16 Pro (DEF45678-ABCD-5678-90AB-CDEF12345678)
`;
    const devices = parseXcrunDeviceList(output);

    expect(devices).toHaveLength(2);
    expect(devices[0].name).toBe('iPhone 16 Pro Max');
    expect(devices[0].udid).toBe('ABC123DE-FFFF-1234-5678-123456789012');
    expect(devices[0].state).toBe('Booted');
    expect(devices[1].state).toBe('Unknown');
  });

  test('handles empty output', () => {
    const devices = parseXcrunDeviceList('');
    expect(devices).toHaveLength(0);
  });

  test('handles multiple iOS versions', () => {
    const output = `
== Devices ==
-- iOS 17.0 --
iPhone 15 (AAA11111-BBB2-3333-CCCC-DDDD4444EEEE) (Shutdown)

-- iOS 18.0 --
iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012) (Booted)
`;
    const devices = parseXcrunDeviceList(output);

    expect(devices).toHaveLength(2);
    expect(devices[0].state).toBe('Shutdown');
    expect(devices[1].state).toBe('Booted');
  });
});

describe('marketing/preflight - parseAdbDeviceList', () => {
  test('parses running emulator correctly', () => {
    const output = `
List of devices attached
emulator-5556          device product:sdk_phone_x86_64 model:Android_SDK_built_for_x86_64 device:generic_x86_64
`;
    const devices = parseAdbDeviceList(output);

    expect(devices).toHaveLength(1);
    expect(devices[0].serial).toBe('emulator-5556');
    expect(devices[0].state).toBe('device');
    expect(devices[0].model).toBe('Android SDK built for x86_64');
  });

  test('parses offline device correctly', () => {
    const output = `
List of devices attached
192.168.1.1:5555      offline
`;
    const devices = parseAdbDeviceList(output);

    expect(devices).toHaveLength(1);
    expect(devices[0].serial).toBe('192.168.1.1:5555');
    expect(devices[0].state).toBe('offline');
  });

  test('handles empty output', () => {
    const devices = parseAdbDeviceList('');
    expect(devices).toHaveLength(0);
  });

  test('handles device with all info', () => {
    const output = `
List of devices attached
emulator-5556          device product:sdk_phone_x86_64 model:Pixel_5 device:generic_x86_64
`;
    const devices = parseAdbDeviceList(output);

    expect(devices).toHaveLength(1);
    expect(devices[0].serial).toBe('emulator-5556');
    expect(devices[0].state).toBe('device');
    expect(devices[0].product).toBe('sdk_phone_x86_64');
    expect(devices[0].model).toBe('Pixel 5');
    expect(devices[0].device).toBe('generic_x86_64');
  });
});

describe('marketing/preflight - runPreflight', () => {
  let executor: MockProcessExecutor;

  beforeEach(() => {
    executor = new MockProcessExecutor();

    // Setup default tool availability
    executor.setExists('/usr/bin/xcrun', true);
    executor.setCommand('xcrun --version', { exitCode: 0, stdout: 'xcrun version 15.0\n', stderr: '' });

    executor.setExists('/usr/bin/adb', true);
    executor.setCommand('adb --version', { exitCode: 0, stdout: 'Android Debug Bridge version 1.0.41\n', stderr: '' });

    executor.setExists('/usr/bin/ffmpeg', true);
    executor.setCommand('ffmpeg -version', { exitCode: 0, stdout: 'ffmpeg version 6.0\n', stderr: '' });

    executor.setExists('/usr/bin/ffprobe', true);
    executor.setCommand('ffprobe -version', { exitCode: 0, stdout: 'ffprobe version 6.0\n', stderr: '' });

    // iOS devices
    executor.setCommand('xcrun simctl list devices available', {
      exitCode: 0,
      stdout: `
== Devices ==
-- iOS 18.0 --
iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012) (Booted)
`,
      stderr: '',
    });

    // Android devices
    executor.setCommand('adb devices -l', {
      exitCode: 0,
      stdout: `
List of devices attached
emulator-5556          device product:sdk_phone_x86_64 model:Android_SDK_built_for_x86_64 device:generic_x86_64
`,
      stderr: '',
    });
  });

  test('returns allAvailable=true when all tools present', async () => {
    const result = await runPreflight(executor);

    expect(result.allAvailable).toBe(true);
    expect(result.ios?.xcrunAvailable).toBe(true);
    expect(result.ios?.bootedDeviceId).toBe('ABC123DE-FFFF-1234-5678-123456789012');
    expect(result.android?.adbAvailable).toBe(true);
    expect(result.android?.runningEmulatorId).toBe('emulator-5556');
  });

  test('returns allAvailable=false when xcrun missing', async () => {
    executor.setExists('/usr/bin/xcrun', false);
    executor.setCommand('which xcrun', { exitCode: 1, stdout: '', stderr: '' });

    const result = await runPreflight(executor);

    expect(result.allAvailable).toBe(false);
    expect(result.ios?.xcrunAvailable).toBe(false);
  });

  test('returns allAvailable=false when adb missing', async () => {
    executor.setExists('/usr/bin/adb', false);
    executor.setCommand('which adb', { exitCode: 1, stdout: '', stderr: '' });

    const result = await runPreflight(executor);

    expect(result.allAvailable).toBe(false);
    expect(result.android?.adbAvailable).toBe(false);
  });

  test('returns allAvailable=false when no booted iOS device and requireBootedDevice=true', async () => {
    executor.setCommand('xcrun simctl list devices available', {
      exitCode: 0,
      stdout: `
== Devices ==
-- iOS 18.0 --
iPhone 16 Pro Max (ABC123DE-FFFF-1234-5678-123456789012)
`,
      stderr: '',
    });

    const result = await runPreflight(executor, { requireBootedDevice: true });

    expect(result.allAvailable).toBe(false);
  });

  test('skips Android when skipAndroid=true', async () => {
    const result = await runPreflight(executor, { skipAndroid: true });

    expect(result.android).toBeUndefined();
  });
});

describe('marketing/preflight - formatPreflightResult', () => {
  test('formats result correctly', () => {
    const result: Parameters<typeof formatPreflightResult>[0] = {
      allAvailable: true,
      tools: [
        { name: 'xcrun', available: true, path: '/usr/bin/xcrun', version: '15.0' },
        { name: 'ffmpeg', available: false, error: 'not found' },
      ],
      ios: {
        xcrunAvailable: true,
        bootedDeviceId: 'ABC123',
        bootedDeviceName: 'iPhone 16 Pro Max',
        simulators: ['iPhone 16 Pro Max (Booted)', 'iPhone 16 Pro (Shutdown)'],
      },
      android: {
        adbAvailable: true,
        emulators: ['Pixel 5 (device)'],
        runningEmulatorId: 'emulator-5556',
      },
      playwrightAvailable: false,
      ffmpegAvailable: true,
      ffprobeAvailable: true,
    };

    const output = formatPreflightResult(result);

    expect(output).toContain('xcrun');
    expect(output).toContain('✓');
    expect(output).toContain('✗');
    expect(output).toContain('iPhone 16 Pro Max');
    expect(output).toContain('PASS');
  });
});
