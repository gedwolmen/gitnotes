import { writeFileSync, readFileSync, existsSync, mkdirSync, statSync } from 'fs';
import {
  computeChecksum,
  computeStringChecksum,
  serializeManifest,
  computeManifestChecksum,
  generateRunId,
  buildDeepLink,
  createSourceCapture,
  createOutputArtifact,
  buildManifest,
  writeManifest,
  readManifest,
  validateManifest,
  safeResolveOutputPath,
  OUTPUT_ROOT,
  type Manifest,
  type SourceCapture,
  type OutputArtifact,
} from '../../scripts/marketing/manifest';

// Mock fs module for tests
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
}));

const mockFs = jest.mocked({
  existsSync,
  writeFileSync,
  readFileSync,
  mkdirSync,
  statSync,
});

describe('marketing/manifest - computeStringChecksum', () => {
  test('computes consistent SHA-256 checksum for string input', () => {
    const input = 'hello world';
    const checksum1 = computeStringChecksum(input);
    const checksum2 = computeStringChecksum(input);
    expect(checksum1).toBe(checksum2);
    expect(checksum1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex length
  });

  test('different inputs produce different checksums', () => {
    const checksum1 = computeStringChecksum('hello');
    const checksum2 = computeStringChecksum('world');
    expect(checksum1).not.toBe(checksum2);
  });

  test('empty string produces known checksum', () => {
    const checksum = computeStringChecksum('');
    expect(checksum).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });
});

describe('marketing/manifest - computeChecksum', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('computes checksum from file contents', () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 11 } as jest.Mocked<typeof statSync> extends jest.Mock ? ReturnType<typeof statSync> : never);
    // When readFileSync is called, return 'hello world'
    (readFileSync as jest.Mock).mockReturnValueOnce(Buffer.from('hello world'));

    const checksum = computeChecksum('/path/to/file.txt');
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(mockFs.existsSync).toHaveBeenCalledWith('/path/to/file.txt');
  });

  test('throws when file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    expect(() => computeChecksum('/nonexistent/file.txt')).toThrow('Cannot compute checksum: file not found');
  });
});

describe('marketing/manifest - serializeManifest', () => {
  test('serializes manifest with sorted keys (deterministic)', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    };

    const serialized1 = serializeManifest(manifest);
    const serialized2 = serializeManifest(manifest);
    expect(serialized1).toBe(serialized2);
    expect(serialized1).toContain('"generatedAt"');
    expect(serialized1).toContain('"pipelineVersion"');
    expect(serialized1).toContain('"runId"');
    expect(serialized1).toContain('"sources"');
    expect(serialized1).toContain('"tools"');
    expect(serialized1).toContain('"artifacts"');
  });

  test('serializes nested objects with sorted keys', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [
        {
          route: 'home',
          device: 'iphone-6.9-inch',
          orientation: 'portrait',
          locale: 'en',
          deepLink: 'gitnotes://home',
          capturedAt: '2024-01-15T09:55:00.000Z',
        },
      ],
      artifacts: [],
      tools: [],
    };

    const serialized = serializeManifest(manifest);
    // Keys within source object should be alphabetically sorted
    const generatedAtIndex = serialized.indexOf('"generatedAt"');
    const runIdIndex = serialized.indexOf('"runId"');
    expect(generatedAtIndex).toBeLessThan(runIdIndex);
  });

  test('serializes arrays with sorted keys within each object', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [
        {
          relativePath: 'store/apple/home.png',
          format: 'png',
          width: 1290,
          height: 2796,
          checksum: 'abc123',
          sizeBytes: 1000,
          store: 'apple-app-store',
        },
      ],
      tools: [],
    };

    const serialized = serializeManifest(manifest);
    expect(serialized).toContain('"artifacts"');
    expect(serialized).toContain('"checksum"');
    expect(serialized).toContain('"format"');
    expect(serialized).toContain('"height"');
    expect(serialized).toContain('"relativePath"');
    expect(serialized).toContain('"sizeBytes"');
    expect(serialized).toContain('"store"');
    expect(serialized).toContain('"width"');
  });
});

describe('marketing/manifest - computeManifestChecksum', () => {
  test('identical manifests produce identical checksums', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    };

    const checksum1 = computeManifestChecksum(manifest);
    const checksum2 = computeManifestChecksum(manifest);
    expect(checksum1).toBe(checksum2);
  });

  test('different manifests produce different checksums', () => {
    const manifest1: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    };

    const manifest2: Manifest = {
      runId: 'run-456',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    };

    expect(computeManifestChecksum(manifest1)).not.toBe(computeManifestChecksum(manifest2));
  });
});

describe('marketing/manifest - generateRunId', () => {
  test('generates unique run IDs', () => {
    const id1 = generateRunId();
    const id2 = generateRunId();
    expect(id1).not.toBe(id2);
  });

  test('run ID starts with "run-" prefix', () => {
    const id = generateRunId();
    expect(id.startsWith('run-')).toBe(true);
  });

  test('run ID contains timestamp-like segment', () => {
    const id = generateRunId();
    // Format: run-YYYY-MM-DDTHH-MM-SS-xxxxxx
    expect(id).toMatch(/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-[a-z0-9]+$/);
  });
});

describe('marketing/manifest - buildDeepLink', () => {
  test('home route builds correct deep link', () => {
    expect(buildDeepLink('home')).toBe('gitnotes://home');
  });

  test('notes route builds correct deep link', () => {
    expect(buildDeepLink('notes')).toBe('gitnotes://notes');
  });

  test('note-editor without params uses home', () => {
    expect(buildDeepLink('note-editor')).toBe('gitnotes://home');
  });

  test('note-editor with noteId builds correct deep link', () => {
    expect(buildDeepLink('note-editor', { noteId: 'abc123' })).toBe('gitnotes://note/abc123');
  });

  test('canvas-editor with canvasId builds correct deep link', () => {
    expect(buildDeepLink('canvas-editor', { canvasId: 'canvas456' })).toBe('gitnotes://canvas/canvas456');
  });

  test('chat-thread with threadId builds correct deep link', () => {
    expect(buildDeepLink('chat-thread', { threadId: 'thread789' })).toBe('gitnotes://chat/thread789');
  });

  test('explore route builds correct deep link', () => {
    expect(buildDeepLink('explore')).toBe('gitnotes://explore');
  });

  test('chat route builds correct deep link', () => {
    expect(buildDeepLink('chat')).toBe('gitnotes://chat');
  });

  test('settings route builds correct deep link', () => {
    expect(buildDeepLink('settings')).toBe('gitnotes://settings');
  });

  test('graph-view defaults to home (no direct deep link)', () => {
    expect(buildDeepLink('graph-view')).toBe('gitnotes://home');
  });
});

describe('marketing/manifest - createSourceCapture', () => {
  test('creates source capture with required fields', () => {
    const capture = createSourceCapture('home', 'iphone-6.9-inch', 'portrait', 'en');

    expect(capture.route).toBe('home');
    expect(capture.device).toBe('iphone-6.9-inch');
    expect(capture.orientation).toBe('portrait');
    expect(capture.locale).toBe('en');
    expect(capture.deepLink).toBe('gitnotes://home');
    expect(capture.capturedAt).toBeDefined();
  });

  test('uses provided capturedAt timestamp', () => {
    const capture = createSourceCapture('notes', 'ipad-13-inch', 'landscape', 'en', '2024-01-15T10:00:00.000Z');
    expect(capture.capturedAt).toBe('2024-01-15T10:00:00.000Z');
  });

  test('defaults to en locale', () => {
    const capture = createSourceCapture('home', 'android-phone', 'portrait');
    expect(capture.locale).toBe('en');
  });
});

describe('marketing/manifest - buildManifest', () => {
  test('builds manifest with required fields', () => {
    const sources: SourceCapture[] = [
      createSourceCapture('home', 'iphone-6.9-inch', 'portrait', 'en', '2024-01-15T09:55:00.000Z'),
    ];

    const artifacts: OutputArtifact[] = [
      {
        relativePath: 'store/apple/home-portrait.png',
        format: 'png',
        width: 1290,
        height: 2796,
        checksum: 'abc123def456',
        sizeBytes: 245000,
        store: 'apple-app-store',
      },
    ];

    const manifest = buildManifest({
      runId: 'run-2024-01-15-abc123',
      sources,
      artifacts,
    });

    expect(manifest.runId).toBe('run-2024-01-15-abc123');
    expect(manifest.sources).toHaveLength(1);
    expect(manifest.artifacts).toHaveLength(1);
    expect(manifest.pipelineVersion).toBe('1.0.0');
    expect(manifest.generatedAt).toBeDefined();
    expect(manifest.tools).toBeDefined();
  });

  test('includes optional gitCommit when provided', () => {
    const manifest = buildManifest({
      runId: 'run-123',
      sources: [],
      artifacts: [],
      gitCommit: 'abc123def456',
    });

    expect(manifest.gitCommit).toBe('abc123def456');
  });

  test('includes optional notes when provided', () => {
    const manifest = buildManifest({
      runId: 'run-123',
      sources: [],
      artifacts: [],
      notes: ['Note about this run', 'Another note'],
    });

    expect(manifest.notes).toEqual(['Note about this run', 'Another note']);
  });
});

describe('marketing/manifest - writeManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
  });

  test('writes manifest to file', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    };

    writeManifest(manifest, 'assets/marketing/runs/run-123/manifest.json');

    expect(mockFs.mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('assets/marketing/runs/run-123'),
      { recursive: true }
    );
    const writeCall = mockFs.writeFileSync.mock.calls[0];
    expect(writeCall[0]).toContain('manifest.json');
    expect(typeof writeCall[1]).toBe('string');
  });
});

describe('marketing/manifest - readManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('reads and parses manifest file', () => {
    const manifestContent = JSON.stringify({
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [],
      tools: [],
    });

    mockFs.existsSync.mockReturnValue(true);
    (readFileSync as jest.Mock).mockReturnValueOnce(manifestContent);

    const manifest = readManifest('assets/marketing/runs/run-123/manifest.json');
    expect(manifest).not.toBeNull();
    expect(manifest!.runId).toBe('run-123');
  });

  test('returns null when file does not exist', () => {
    mockFs.existsSync.mockReturnValue(false);
    const manifest = readManifest('nonexistent/manifest.json');
    expect(manifest).toBeNull();
  });
});

describe('marketing/manifest - validateManifest', () => {
  test('returns empty array for valid manifest', () => {
    const manifest: Manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [
        {
          route: 'home',
          device: 'iphone-6.9-inch',
          orientation: 'portrait',
          locale: 'en',
          deepLink: 'gitnotes://home',
          capturedAt: '2024-01-15T09:55:00.000Z',
        },
      ],
      artifacts: [
        {
          relativePath: 'store/apple/home.png',
          format: 'png',
          width: 1290,
          height: 2796,
          checksum: 'abc123',
          sizeBytes: 1000,
          store: 'apple-app-store',
        },
      ],
      tools: [
        { name: 'node', version: '20.18.0' },
      ],
    };

    const errors = validateManifest(manifest);
    expect(errors).toHaveLength(0);
  });

  test('returns errors for missing required fields', () => {
    const errors = validateManifest({});
    expect(errors).toContain('runId must be a string');
    expect(errors).toContain('generatedAt must be a string');
    expect(errors).toContain('pipelineVersion must be a string');
    expect(errors).toContain('sources must be an array');
    expect(errors).toContain('artifacts must be an array');
    expect(errors).toContain('tools must be an array');
  });

  test('returns errors for invalid source entry', () => {
    const manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [{ route: 'home' }], // missing required fields
      artifacts: [],
      tools: [],
    };

    const errors = validateManifest(manifest);
    expect(errors.some((e) => e.includes('sources[0]'))).toBe(true);
  });

  test('returns errors for invalid artifact entry', () => {
    const manifest = {
      runId: 'run-123',
      generatedAt: '2024-01-15T10:00:00.000Z',
      pipelineVersion: '1.0.0',
      sources: [],
      artifacts: [{ relativePath: 'test.png' }], // missing required fields
      tools: [],
    };

    const errors = validateManifest(manifest);
    expect(errors.some((e) => e.includes('artifacts[0]'))).toBe(true);
  });

  test('returns errors for null manifest', () => {
    const errors = validateManifest(null);
    expect(errors).toContain('Manifest must be an object');
  });
});

describe('marketing/manifest - safeResolveOutputPath', () => {
  test('resolves path within assets/marketing/', () => {
    const resolved = safeResolveOutputPath('store/apple/home.png');
    expect(resolved).toContain('assets/marketing');
    expect(resolved).toContain('store/apple/home.png');
  });

  test('resolves path with custom base directory', () => {
    const resolved = safeResolveOutputPath('exports/video.mp4', '/custom/base');
    expect(resolved).toContain('/custom/base');
    expect(resolved).toContain('exports/video.mp4');
  });

  test('throws when path escapes root', () => {
    expect(() => safeResolveOutputPath('../outside.png')).toThrow('Path escape detected');
    expect(() => safeResolveOutputPath('store/../../../etc/passwd')).toThrow('Path escape detected');
  });

  test('throws for absolute path', () => {
    expect(() => safeResolveOutputPath('/tmp/output.png')).toThrow('Path escape detected');
  });
});

describe('marketing/manifest - createOutputArtifact', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 12345 } as jest.Mocked<typeof statSync> extends jest.Mock ? ReturnType<typeof statSync> : never);
    (readFileSync as jest.Mock).mockReturnValue(Buffer.from('fake image data'));
  });

  test('records correct iPad landscape dimensions (2732x2048)', () => {
    const artifact = createOutputArtifact(
      '/assets/marketing/store/ipad-13-inch-explore-landscape-01.png',
      '/assets/marketing/store',
      'ipad-13-inch',
      'landscape',
      'png',
      'apple-app-store',
    );

    expect(artifact.width).toBe(2732);
    expect(artifact.height).toBe(2048);
    expect(artifact.relativePath).toBe('ipad-13-inch-explore-landscape-01.png');
    expect(artifact.format).toBe('png');
    expect(artifact.store).toBe('apple-app-store');
  });

  test('records correct iPhone portrait dimensions (1290x2796)', () => {
    const artifact = createOutputArtifact(
      '/assets/marketing/store/iphone-69-inch-home-portrait-01.png',
      '/assets/marketing/store',
      'iphone-6.9-inch',
      'portrait',
      'png',
      'apple-app-store',
    );

    expect(artifact.width).toBe(1290);
    expect(artifact.height).toBe(2796);
  });

  test('records correct Android phone landscape dimensions (2340x1080)', () => {
    const artifact = createOutputArtifact(
      '/assets/marketing/store/android-phone-notes-landscape-01.jpg',
      '/assets/marketing/store',
      'android-phone',
      'landscape',
      'jpeg',
      'google-play',
    );

    expect(artifact.width).toBe(2340);
    expect(artifact.height).toBe(1080);
    expect(artifact.store).toBe('google-play');
  });

  test('records correct Android 10-inch tablet portrait dimensions (1600x2560)', () => {
    const artifact = createOutputArtifact(
      '/assets/marketing/store/android-10-inch-tablet-home-portrait-01.png',
      '/assets/marketing/store',
      'android-10-inch-tablet',
      'portrait',
      'png',
      'google-play',
    );

    expect(artifact.width).toBe(1600);
    expect(artifact.height).toBe(2560);
  });

  test('records correct Android 7-inch tablet landscape dimensions (1920x1080)', () => {
    const artifact = createOutputArtifact(
      '/assets/marketing/store/android-7-inch-tablet-notes-landscape-01.png',
      '/assets/marketing/store',
      'android-7-inch-tablet',
      'landscape',
      'png',
      'google-play',
    );

    expect(artifact.width).toBe(1920);
    expect(artifact.height).toBe(1080);
  });

  test('requires device and orientation parameters (no hardcoded fallbacks)', () => {
    const artifact = createOutputArtifact(
      '/path/to/file.png',
      '/path',
      'ipad-13-inch',
      'landscape',
      'png',
      'apple-app-store',
    );
    expect(artifact.width).toBe(2732);
    expect(artifact.height).toBe(2048);
  });
});

describe('marketing/manifest - OUTPUT_ROOT', () => {
  test('OUTPUT_ROOT is assets/marketing', () => {
    expect(OUTPUT_ROOT).toBe('assets/marketing');
  });
});
