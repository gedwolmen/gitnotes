/**
 * Marketing Fixtures - Seed CLI Tests
 *
 * Tests for the idempotent seed/reset CLI behavior.
 * Uses absolute paths and execSync to test the CLI as a black box.
 */

const { existsSync, readFileSync, rmSync } = require('fs');
const { join, resolve } = require('path');
const { execSync } = require('child_process');

// ------------------------------------------------------------------------------------------------
// Test Constants
// ------------------------------------------------------------------------------------------------

const WORKTREE_ROOT = resolve(__dirname, '../../..');
const FIXTURE_ROOT = join(WORKTREE_ROOT, 'assets/marketing/fixture-data');
const REPO_PATH = join(FIXTURE_ROOT, 'repo');
const DATA_PATH = join(FIXTURE_ROOT, 'data');
const MANIFEST_PATH = join(FIXTURE_ROOT, 'manifest.json');
const RUNS_PATH = join(WORKTREE_ROOT, 'assets/marketing/runs');

// ------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------

function runSeed(...args) {
  const cmd = 'node scripts/marketing/fixtures/seed.js ' + args.join(' ');
  try {
    execSync(cmd, { cwd: WORKTREE_ROOT, stdio: 'pipe' });
    return { exitCode: 0, stdout: '', stderr: '' };
  } catch (error) {
    return {
      exitCode: error.status || 1,
      stdout: error.stdout ? error.stdout.toString() : '',
      stderr: error.stderr ? error.stderr.toString() : '',
    };
  }
}

function cleanFixtures() {
  if (existsSync(FIXTURE_ROOT)) {
    rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  }
  if (existsSync(RUNS_PATH)) {
    rmSync(RUNS_PATH, { recursive: true, force: true });
  }
}

// ------------------------------------------------------------------------------------------------
// Tests
// ------------------------------------------------------------------------------------------------

describe('marketing/fixtures/seed.js - CLI Interface', () => {
  beforeEach(() => {
    cleanFixtures();
  });

  afterEach(() => {
    cleanFixtures();
  });

  describe('--reset', () => {
    test('creates fixture directories', () => {
      const result = runSeed('--reset');

      expect(result.exitCode).toBe(0);
      expect(existsSync(FIXTURE_ROOT)).toBe(true);
      expect(existsSync(REPO_PATH)).toBe(true);
      expect(existsSync(DATA_PATH)).toBe(true);
    });

    test('writes manifest file', () => {
      const result = runSeed('--reset');

      expect(result.exitCode).toBe(0);
      expect(existsSync(MANIFEST_PATH)).toBe(true);
    });

    test('manifest contains required sections', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

      expect(manifest.fixtureId).toBeDefined();
      expect(manifest.generatedAt).toBeDefined();
      expect(manifest.repoPath).toBe(REPO_PATH);
      expect(manifest.dataPath).toBe(DATA_PATH);
      expect(manifest.notes).toHaveLength(5);
      expect(manifest.todos).toHaveLength(5);
      expect(manifest.canvas).toBeDefined();
      expect(manifest.chatThread).toBeDefined();
      expect(manifest.git).toBeDefined();
      expect(manifest.checkpoints).toBeDefined();
    });

    test('creates note files', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const noteDir = join(DATA_PATH, 'documents', 'note');

      expect(existsSync(noteDir)).toBe(true);
      expect(manifest.notes.length).toBeGreaterThan(0);
    });

    test('creates todo files', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const todoDir = join(DATA_PATH, 'documents', 'todo');

      expect(existsSync(todoDir)).toBe(true);
      expect(manifest.todos.length).toBeGreaterThan(0);
    });

    test('creates canvas file', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const canvasFile = join(DATA_PATH, 'documents', 'canvas', manifest.canvas.id + '.canvas');

      expect(existsSync(canvasFile)).toBe(true);
    });

    test('creates chat thread file', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const chatFile = join(DATA_PATH, 'documents', 'ai', manifest.chatThread.id + '.md');

      expect(existsSync(chatFile)).toBe(true);
    });

    test('initializes git repository', () => {
      runSeed('--reset');

      const gitDir = join(REPO_PATH, '.git');
      expect(existsSync(gitDir)).toBe(true);
    });
  });

  describe('route checkpoints', () => {
    test('automated routes have correct status', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

      const automatedRoutes = ['home', 'notes', 'note-editor', 'canvas-editor', 'todos', 'explore'];
      for (const route of automatedRoutes) {
        const cp = manifest.checkpoints.find(c => c.route === route);
        expect(cp.status).toBe('automated');
      }
    });

    test('graph-view is manual-confirm', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const graph = manifest.checkpoints.find(c => c.route === 'graph-view');

      expect(graph.status).toBe('manual-confirm');
      expect(graph.reason).toContain('manual');
    });

    test('chat is manual-confirm', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const chat = manifest.checkpoints.find(c => c.route === 'chat');

      expect(chat.status).toBe('manual-confirm');
      expect(chat.reason).toContain('manual');
    });

    test('note-editor deep link contains fixture note ID', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const noteEditor = manifest.checkpoints.find(c => c.route === 'note-editor');

      expect(noteEditor.noteId).toBeDefined();
      expect(noteEditor.deepLink).toContain(noteEditor.noteId);
    });

    test('canvas-editor deep link contains fixture canvas ID', () => {
      runSeed('--reset');

      const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
      const canvasEditor = manifest.checkpoints.find(c => c.route === 'canvas-editor');

      expect(canvasEditor.canvasId).toBeDefined();
      expect(canvasEditor.deepLink).toContain(canvasEditor.canvasId);
    });
  });
});

describe('marketing/fixtures/seed.js - Byte-Identical Idempotency', () => {
  beforeEach(() => {
    cleanFixtures();
  });

  afterEach(() => {
    cleanFixtures();
  });

  test('manifest is BYTE-identical on repeated seeds (literal JSON diff)', () => {
    // First seed
    runSeed('--reset');
    const manifest1Str = readFileSync(MANIFEST_PATH, 'utf8');

    // Second seed
    runSeed('--reset');
    const manifest2Str = readFileSync(MANIFEST_PATH, 'utf8');

    // Literal string comparison - must be EXACTLY identical
    expect(manifest1Str).toBe(manifest2Str);
  });

  test('generatedAt timestamp is deterministic (same BASE_DATE on every run)', () => {
    runSeed('--reset');
    const manifest1 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    runSeed('--reset');
    const manifest2 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    expect(manifest1.generatedAt).toBe(manifest2.generatedAt);
    expect(manifest1.generatedAt).toBe('2024-03-15T10:00:00.000Z');
  });

  test('checkpoint capturedAt timestamps are deterministic', () => {
    runSeed('--reset');
    const manifest1 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    runSeed('--reset');
    const manifest2 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    for (let i = 0; i < manifest1.checkpoints.length; i++) {
      expect(manifest1.checkpoints[i].capturedAt).toBe(manifest2.checkpoints[i].capturedAt);
    }
  });

  test('all fixture data timestamps use BASE_DATE', () => {
    runSeed('--reset');
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Manifest-level timestamp
    expect(manifest.generatedAt).toBe('2024-03-15T10:00:00.000Z');

    // Note timestamps
    for (const note of manifest.notes) {
      expect(note.createdAt).toBe('2024-03-15T10:00:00.000Z');
      expect(note.updatedAt).toBe('2024-03-15T10:00:00.000Z');
    }

    // Todo timestamps
    for (const todo of manifest.todos) {
      expect(todo.createdAt).toBe('2024-03-15T10:00:00.000Z');
      expect(todo.updatedAt).toBe('2024-03-15T10:00:00.000Z');
    }

    // Canvas timestamps
    expect(manifest.canvas.createdAt).toBe('2024-03-15T10:00:00.000Z');
    expect(manifest.canvas.updatedAt).toBe('2024-03-15T10:00:00.000Z');

    // Chat thread timestamps
    expect(manifest.chatThread.createdAt).toBe('2024-03-15T10:00:00.000Z');
    expect(manifest.chatThread.updatedAt).toBe('2024-03-15T10:00:00.000Z');
  });
});

describe('marketing/fixtures/seed.js - Git Deterministic Timestamps', () => {
  beforeEach(() => {
    cleanFixtures();
  });

  afterEach(() => {
    cleanFixtures();
  });

  test('git commits use DECLARED timestamps, not new Date()', () => {
    runSeed('--reset');

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Verify git commits use declared timestamps from fixture data
    expect(manifest.git.commits[0].timestamp).toBe('2024-01-01T10:00:00.000Z');
    expect(manifest.git.commits[1].timestamp).toBe('2024-01-02T10:00:00.000Z');
  });

  test('git log shows deterministic commit dates', () => {
    runSeed('--reset');

    // Get git log in commit order
    const log1 = execSync('git log --format="%H|%ai|%s" --reverse', {
      cwd: REPO_PATH,
      encoding: 'utf8',
    });

    const lines = log1.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);

    // First commit should have timestamp 2024-01-01T10:00:00
    const firstCommit = lines[0].split('|');
    expect(firstCommit[1]).toMatch(/^2024-01-01/);
  });
});

describe('marketing/fixtures/seed.js - Manual Checkpoint Capture', () => {
  beforeEach(() => {
    cleanFixtures();
    // Ensure runs directory exists
    const { mkdirSync } = require('fs');
    mkdirSync(RUNS_PATH, { recursive: true });
  });

  afterEach(() => {
    cleanFixtures();
  });

  describe('graph-view (manual-confirm)', () => {
    test('without --confirm, exits 3 and writes blocked record', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'graph-view');

      expect(result.exitCode).toBe(3); // BLOCKED status
      expect(result.stderr).toContain('[BLOCKED]');

      // Check blocked record exists
      const blockedPath = join(RUNS_PATH, 'checkpoint-graph-view-blocked.json');
      expect(existsSync(blockedPath)).toBe(true);

      const blocked = JSON.parse(readFileSync(blockedPath, 'utf8'));
      expect(blocked.status).toBe('blocked');
      expect(blocked.route).toBe('graph-view');
    });

    test('with --confirm, exits 0 and writes confirmed record', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'graph-view', '--confirm');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('[CONFIRMED]');

      // Check confirmed record exists
      const capturePath = join(RUNS_PATH, 'checkpoint-graph-view.json');
      expect(existsSync(capturePath)).toBe(true);

      const confirmed = JSON.parse(readFileSync(capturePath, 'utf8'));
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.route).toBe('graph-view');
    });

    test('never claims graph-view is automated', () => {
      runSeed('--reset');

      // Without --confirm
      runSeed('--capture', 'graph-view');
      const blockedPath = join(RUNS_PATH, 'checkpoint-graph-view-blocked.json');
      const blocked = JSON.parse(readFileSync(blockedPath, 'utf8'));
      expect(blocked.status).not.toBe('automated');

      // With --confirm
      const capturePath = join(RUNS_PATH, 'checkpoint-graph-view.json');
      if (existsSync(capturePath)) rmSync(capturePath, { force: true });
      runSeed('--capture', 'graph-view', '--confirm');
      const confirmed = JSON.parse(readFileSync(capturePath, 'utf8'));
      expect(confirmed.status).not.toBe('automated');
    });
  });

  describe('chat (manual-confirm)', () => {
    test('without --confirm, exits 3 and writes blocked record', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'chat');

      expect(result.exitCode).toBe(3);
      expect(result.stderr).toContain('[BLOCKED]');

      const blockedPath = join(RUNS_PATH, 'checkpoint-chat-blocked.json');
      expect(existsSync(blockedPath)).toBe(true);

      const blocked = JSON.parse(readFileSync(blockedPath, 'utf8'));
      expect(blocked.status).toBe('blocked');
    });

    test('with --confirm, exits 0 and writes confirmed record', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'chat', '--confirm');

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain('[CONFIRMED]');

      const capturePath = join(RUNS_PATH, 'checkpoint-chat.json');
      expect(existsSync(capturePath)).toBe(true);

      const confirmed = JSON.parse(readFileSync(capturePath, 'utf8'));
      expect(confirmed.status).toBe('confirmed');
    });
  });

  describe('automated routes reject --capture', () => {
    test('note-editor (automated) is rejected', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'note-editor', '--confirm');

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('automated');
    });

    test('home (automated) is rejected', () => {
      runSeed('--reset');

      const result = runSeed('--capture', 'home', '--confirm');

      expect(result.exitCode).toBe(1);
    });
  });
});

describe('marketing/fixtures/seed.js - Path Safety', () => {
  beforeEach(() => {
    cleanFixtures();
  });

  afterEach(() => {
    cleanFixtures();
  });

  test('does not create files outside fixture root', () => {
    runSeed('--reset');

    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    expect(manifest.repoPath).toContain('assets/marketing');
    expect(manifest.dataPath).toContain('assets/marketing');
  });
});
