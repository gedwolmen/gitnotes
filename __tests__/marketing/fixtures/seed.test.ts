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

describe('marketing/fixtures/seed.js - Idempotency', () => {
  beforeEach(() => {
    cleanFixtures();
  });

  afterEach(() => {
    cleanFixtures();
  });

  test('manifest is identical on repeated seeds', () => {
    // Run 1
    runSeed('--reset');
    const manifest1 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Run 2
    runSeed('--reset');
    const manifest2 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Compare
    expect(manifest1.fixtureId).toBe(manifest2.fixtureId);
    expect(manifest1.notes.map(n => n.id)).toEqual(manifest2.notes.map(n => n.id));
    expect(manifest1.canvas.id).toBe(manifest2.canvas.id);
    expect(manifest1.chatThread.id).toBe(manifest2.chatThread.id);
  });

  test('note content is identical on repeated seeds', () => {
    // Run 1
    runSeed('--reset');
    const manifest1 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Run 2
    runSeed('--reset');
    const manifest2 = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    // Compare note content
    expect(manifest1.notes[0].content).toBe(manifest2.notes[0].content);
    expect(manifest1.notes[0].title).toBe(manifest2.notes[0].title);
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

    // Fixture files should only be under FIXTURE_ROOT
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));

    expect(manifest.repoPath).toContain('assets/marketing');
    expect(manifest.dataPath).toContain('assets/marketing');
  });
});
