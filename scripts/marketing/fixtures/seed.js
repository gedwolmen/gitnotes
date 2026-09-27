#!/usr/bin/env node
/**
 * Marketing Asset Pipeline - Fixture Seed CLI
 *
 * Idempotent reset and seed of deterministic marketing fixtures.
 * Creates a disposable fixture repository and data root for marketing captures.
 *
 * Usage:
 *   node scripts/marketing/fixtures/seed.js --reset    # Reset and reseed
 *   node scripts/marketing/fixtures/seed.js --status  # Show fixture status
 *   node scripts/marketing/fixtures/seed.js --verify  # Verify idempotency (byte-identical)
 *   node scripts/marketing/fixtures/seed.js --capture <route> [--confirm]  # Capture checkpoint
 *
 * Exit codes:
 *   0 - Success
 *   1 - General error
 *   2 - Missing prerequisites
 *   3 - Manual checkpoint blocked (requires --confirm for graph-view, chat)
 */

// ------------------------------------------------------------------------------------------------
// Deterministic ID Generation (seeded, not random)
// ------------------------------------------------------------------------------------------------

function fixtureId(seed, suffix) {
  const base = 'fixture-' + seed + (suffix ? '-' + suffix : '');
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return 'fixture-' + Math.abs(hash).toString(36) + '-' + seed;
}

// ------------------------------------------------------------------------------------------------
// Deterministic Base Date (fixed for reproducible manifests)
// ------------------------------------------------------------------------------------------------

const BASE_DATE = '2024-03-15T10:00:00.000Z';

// ------------------------------------------------------------------------------------------------
// Serializers
// ------------------------------------------------------------------------------------------------

function serializeNote(note) {
  const lines = [
    '---',
    'id: ' + note.id,
    'title: ' + note.title,
    'type: note',
    'tags: [' + note.tags.join(', ') + ']',
  ];

  if (note.folderPath) lines.push('folder: ' + note.folderPath);
  if (note.color) lines.push('color: ' + note.color);
  if (note.isPinned) lines.push('isPinned: true');
  lines.push('createdAt: ' + note.createdAt);
  lines.push('updatedAt: ' + note.updatedAt);
  lines.push('---', '');

  return lines.join('\n') + note.content;
}

function serializeTodo(todo) {
  const lines = [
    '---',
    'id: ' + todo.id,
    'type: todo',
    'text: ' + todo.text,
    'completed: ' + todo.completed,
  ];

  if (todo.dueDate) lines.push('dueDate: ' + todo.dueDate);
  lines.push('priority: ' + todo.priority);
  lines.push('tags: [' + todo.tags.join(', ') + ']');
  if (todo.notes) lines.push('notes: ' + todo.notes);
  if (todo.linkedNoteId) lines.push('linkedNoteId: ' + todo.linkedNoteId);
  lines.push('status: ' + todo.status);
  lines.push('createdAt: ' + todo.createdAt);
  lines.push('updatedAt: ' + todo.updatedAt);
  lines.push('---');

  return lines.join('\n');
}

function serializeCanvas(canvas) {
  return JSON.stringify(canvas, null, 2);
}

function serializeChat(thread) {
  const lines = [
    '---',
    'id: ' + thread.id,
    'title: ' + thread.title,
    'repoOwner: ' + thread.repoOwner,
    'repoName: ' + thread.repoName,
    'branch: ' + thread.branch,
    'filePath: ' + thread.filePath,
    'createdAt: ' + thread.createdAt,
    'updatedAt: ' + thread.updatedAt,
    '---',
    '',
  ];

  const messagesBody = thread.messages
    .map(function (m) {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      return '## ' + role + ' (' + m.timestamp + ')\n\n' + m.content;
    })
    .join('\n\n');

  return lines.join('\n') + messagesBody;
}

// ------------------------------------------------------------------------------------------------
// Fixture Data Generators (all timestamps deterministic)
// ------------------------------------------------------------------------------------------------

function createFixtureNotes() {
  return [
    {
      id: fixtureId('note-1'),
      title: 'Getting Started with GitNotēs',
      content:
        '# Getting Started with GitNotēs\n\nWelcome to GitNotēs! This note will help you get up and running quickly.\n\n## Key Features\n\n- **Git-backed storage** - Every note is a plain file in your Git repo\n- **Offline-first** - Changes queue locally and sync when online\n- **Multi-format support** - Markdown, Neorg, Org mode, and JSON\n\n## Your First Note\n\nCreate a new note by tapping the + button on the Notes tab.\n\n## Linking Notes\n\nYou can link to other notes using [[wiki-links]]. Try linking to [[Project Ideas]].\n\nSee also: [[Meeting Notes]], [[Project Ideas]]',
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      tags: ['getting-started', 'guide'],
      color: 'blue',
      isPinned: true,
      format: 'markdown',
      linksTo: ['Project Ideas', 'Canvas Editor'],
    },
    {
      id: fixtureId('note-2'),
      title: 'Project Ideas',
      content:
        '# Project Ideas\n\nA running list of project ideas.\n\n## Feature Ideas\n\n- [ ] Dark mode toggle\n- [ ] More export formats\n\nSee [[Getting Started with GitNotēs]] for an introduction.',
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      tags: ['projects', 'ideas'],
      color: 'green',
      format: 'markdown',
      linksTo: ['Getting Started with GitNotēs', 'Canvas Editor'],
    },
    {
      id: fixtureId('note-3'),
      title: 'Meeting Notes',
      content:
        '# Meeting Notes\n\n## Team Standup\n\n**Date:** 2024-03-15\n\n### Agenda\n\n1. Review progress\n2. Sprint planning\n\n### Action Items\n\n- [ ] Review PR #142\n- [ ] Update docs\n\nSee [[Project Ideas]] for feature tracking.',
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      tags: ['meetings', 'sprint'],
      color: 'yellow',
      format: 'markdown',
      linksTo: ['Project Ideas'],
    },
    {
      id: fixtureId('note-4'),
      title: 'Canvas Editor',
      content:
        '# Canvas Editor\n\nThe Canvas Editor provides an infinite space for visual thinking.\n\n## Features\n\n- **Freeform drawing** with multiple tools\n- **Shapes and text** for structured diagrams\n- **Charts** for data visualization\n\nCanvases can be embedded in [[Meeting Notes]].',
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      tags: ['canvas', 'features'],
      color: 'purple',
      format: 'markdown',
      linksTo: ['Meeting Notes', 'Project Ideas'],
    },
    {
      id: fixtureId('note-5'),
      title: 'API Reference',
      content:
        '# API Reference\n\n## Deep Links\n\n| Route | URL Pattern |\n|-------|------------|\n| Home | gitnotes://home |\n| Notes | gitnotes://notes |\n| Note Editor | gitnotes://note/:noteId |\n| Canvas | gitnotes://canvas/:canvasId |\n\nSee [[Getting Started with GitNotēs]] for setup instructions.',
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      tags: ['api', 'reference', 'technical'],
      color: 'gray',
      format: 'markdown',
      linksTo: ['Getting Started with GitNotēs'],
    },
  ];
}

function createFixtureTodos() {
  return [
    {
      id: fixtureId('todo-1'),
      text: 'Review GitNotēs Getting Started guide',
      completed: false,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      priority: 'high',
      tags: ['documentation'],
      status: 'todo',
    },
    {
      id: fixtureId('todo-2'),
      text: 'Set up GitHub integration',
      completed: true,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      priority: 'high',
      tags: ['setup', 'git'],
      status: 'done',
    },
    {
      id: fixtureId('todo-3'),
      text: 'Create first canvas diagram',
      completed: false,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      priority: 'medium',
      tags: ['canvas', 'visual'],
      status: 'in-progress',
      linkedNoteId: fixtureId('note-4'),
    },
    {
      id: fixtureId('todo-4'),
      text: 'Write meeting notes for sprint planning',
      completed: true,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      priority: 'medium',
      tags: ['meetings'],
      status: 'done',
    },
    {
      id: fixtureId('todo-5'),
      text: 'Explore canvas editor features',
      completed: false,
      createdAt: BASE_DATE,
      updatedAt: BASE_DATE,
      priority: 'low',
      tags: ['canvas', 'exploration'],
      status: 'todo',
    },
  ];
}

function createFixtureCanvas() {
  return {
    id: fixtureId('canvas-1'),
    title: 'Marketing Storyboard',
    scene: {
      version: 1,
      width: 1920,
      height: 1080,
      background: '#FFFFFF',
      elements: [
        {
          id: fixtureId('canvas-el-1'),
          type: 'text',
          x: 100,
          y: 100,
          text: 'GitNotēs Marketing Storyboard',
          fontSize: 32,
          color: '#1a1a1a',
        },
        {
          id: fixtureId('canvas-el-2'),
          type: 'shape',
          shape: 'rect',
          x: 100,
          y: 200,
          width: 400,
          height: 200,
          color: '#5b7cec',
          fillColor: '#e8eaff',
        },
        {
          id: fixtureId('canvas-el-3'),
          type: 'text',
          x: 120,
          y: 220,
          text: 'Capture Ideas',
          fontSize: 18,
          color: '#1a1a1a',
        },
      ],
    },
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    tags: ['marketing', 'storyboard'],
  };
}

function createFixtureChatThread() {
  return {
    id: fixtureId('chat-thread'),
    title: 'GitNotēs Feature Discussion',
    messages: [
      {
        id: fixtureId('chat-msg-1'),
        role: 'user',
        content: 'How do I link notes together in GitNotēs?',
        timestamp: BASE_DATE,
      },
      {
        id: fixtureId('chat-msg-2'),
        role: 'assistant',
        content:
          'You can link notes using wiki-style links with double brackets. For example, [[Getting Started with GitNotēs]] creates a link to that note.',
        timestamp: BASE_DATE,
      },
    ],
    createdAt: BASE_DATE,
    updatedAt: BASE_DATE,
    repoOwner: 'marketing-fixture',
    repoName: 'gitnotes-demo',
    branch: 'main',
    filePath: 'documents/ai/feature-discussion.md',
  };
}

function createFixtureGitRepo() {
  return {
    name: 'gitnotes-demo',
    owner: 'marketing-fixture',
    branch: 'main',
    userName: 'GitNotēs Marketing',
    userEmail: 'marketing@gitnotes.app',
    commits: [
      {
        message: 'Initial commit - project structure',
        authorName: 'GitNotēs Marketing',
        authorEmail: 'marketing@gitnotes.app',
        timestamp: '2024-01-01T10:00:00.000Z',
        files: {
          'README.md': '# GitNotēs Demo\n\nA sample repository for GitNotēs marketing screenshots.',
        },
      },
      {
        message: 'Add getting started guide',
        authorName: 'GitNotēs Marketing',
        authorEmail: 'marketing@gitnotes.app',
        timestamp: '2024-01-02T10:00:00.000Z',
        files: {
          'documents/note/getting-started.md':
            '---\nid: getting-start\ntitle: Getting Started\ntype: note\ntags: [guide]\n---\n\nWelcome to GitNotēs!',
        },
      },
    ],
  };
}

function createRouteCheckpoints(notes, canvas, chatThread) {
  return [
    {
      route: 'home',
      deepLink: 'gitnotes://home',
      status: 'automated',
      capturedAt: BASE_DATE,
    },
    {
      route: 'notes',
      deepLink: 'gitnotes://notes',
      status: 'automated',
      capturedAt: BASE_DATE,
    },
    {
      route: 'note-editor',
      deepLink: 'gitnotes://note/' + notes[0].id,
      status: 'automated',
      noteId: notes[0].id,
      linkedNoteIds: notes.map(function (n) {
        return n.id;
      }),
      capturedAt: BASE_DATE,
    },
    {
      route: 'canvas-editor',
      deepLink: 'gitnotes://canvas/' + canvas.id,
      status: 'automated',
      canvasId: canvas.id,
      capturedAt: BASE_DATE,
    },
    {
      route: 'todos',
      deepLink: 'gitnotes://home',
      status: 'automated',
      capturedAt: BASE_DATE,
      reason: 'No direct deep link - app navigates to Todos tab',
    },
    {
      route: 'explore',
      deepLink: 'gitnotes://explore',
      status: 'automated',
      capturedAt: BASE_DATE,
    },
    {
      route: 'graph-view',
      deepLink: 'gitnotes://home',
      status: 'manual-confirm',
      reason: 'Graph has no deep link or testID - requires manual capture',
    },
    {
      route: 'chat',
      deepLink: 'gitnotes://chat',
      status: 'manual-confirm',
      reason: 'Chat requires generated thread ID - requires manual capture with --confirm',
      threadId: chatThread.id,
    },
  ];
}

function createFixtureManifest(fixtureIdVal, repoPath, dataPath) {
  const notes = createFixtureNotes();
  const todos = createFixtureTodos();
  const canvas = createFixtureCanvas();
  const chatThread = createFixtureChatThread();
  const git = createFixtureGitRepo();
  const checkpoints = createRouteCheckpoints(notes, canvas, chatThread);

  return {
    fixtureId: fixtureIdVal,
    // Deterministic timestamp - same BASE_DATE for all fixture runs
    generatedAt: BASE_DATE,
    repoPath: repoPath,
    dataPath: dataPath,
    notes: notes,
    todos: todos,
    canvas: canvas,
    chatThread: chatThread,
    git: git,
    checkpoints: checkpoints,
  };
}

// ------------------------------------------------------------------------------------------------
// Paths
// ------------------------------------------------------------------------------------------------

const WORKTREE_ROOT = process.cwd();
const OUTPUT_ROOT = WORKTREE_ROOT + '/assets/marketing';
const FIXTURE_ROOT = OUTPUT_ROOT + '/fixture-data';
const REPO_PATH = FIXTURE_ROOT + '/repo';
const DATA_PATH = FIXTURE_ROOT + '/data';
const RUNS_PATH = OUTPUT_ROOT + '/runs';
const MANIFEST_PATH = FIXTURE_ROOT + '/manifest.json';

// ------------------------------------------------------------------------------------------------
// Node Built-ins
// ------------------------------------------------------------------------------------------------

const existsSync = require('fs').existsSync;
const mkdirSync = require('fs').mkdirSync;
const writeFileSync = require('fs').writeFileSync;
const readFileSync = require('fs').readFileSync;
const rmSync = require('fs').rmSync;
const cpSync = require('fs').cpSync;
const execSync = require('child_process').execSync;
const join = require('path').join;

// ------------------------------------------------------------------------------------------------
// Logging
// ------------------------------------------------------------------------------------------------

function log(msg, level) {
  level = level || 'INFO';
  const timestamp = new Date().toISOString();
  console.error('[' + timestamp + '] [' + level + '] ' + msg);
}

function logSuccess(msg) {
  log(msg, 'SUCCESS');
}

function logError(msg) {
  log(msg, 'ERROR');
}

function logWarn(msg) {
  log(msg, 'WARN');
}

// ------------------------------------------------------------------------------------------------
// Path Safety
// ------------------------------------------------------------------------------------------------

function ensurePathSafety(targetPath, operation) {
  const resolved = require('path').resolve(targetPath);
  const normalizedResolved = resolved.replace(/\\/g, '/');

  const allowedRoots = [
    require('path').resolve(FIXTURE_ROOT),
    require('path').resolve(OUTPUT_ROOT),
  ];
  const isAllowed = allowedRoots.some(function (root) {
    const normalizedRoot = root.replace(/\\/g, '/');
    return (
      normalizedResolved.startsWith(normalizedRoot + '/') || normalizedResolved === normalizedRoot
    );
  });

  if (!isAllowed) {
    throw new Error('Path safety violation: ' + operation + ' would escape to ' + resolved);
  }

  return resolved;
}

// ------------------------------------------------------------------------------------------------
// Git Operations (local only, fixture repo)
// ------------------------------------------------------------------------------------------------

function initGitRepo(repoPath, userName, userEmail) {
  ensurePathSafety(repoPath, 'git init');

  if (!existsSync(join(repoPath, '.git'))) {
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
  }

  execSync('git config user.name "' + userName + '"', { cwd: repoPath, stdio: 'pipe' });
  execSync('git config user.email "' + userEmail + '"', { cwd: repoPath, stdio: 'pipe' });

  try {
    execSync('git checkout -b main', { cwd: repoPath, stdio: 'pipe' });
  } catch {
    // Branch might already exist
  }
}

/**
 * Git commit with DETERMINISTIC timestamp from commit declaration.
 * Uses the declared timestamp for author/committer dates, not new Date().
 */
function gitAddCommit(repoPath, commit) {
  const filePaths = Object.keys(commit.files);
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fullPath = join(repoPath, filePath);
    const dir = join(fullPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(fullPath, commit.files[filePath], 'utf8');
  }

  execSync('git add .', { cwd: repoPath, stdio: 'pipe' });

  // Use the DECLARED timestamp from commit metadata, not new Date()
  const authorDate = commit.timestamp;
  const env = {
    GIT_AUTHOR_NAME: commit.authorName,
    GIT_AUTHOR_EMAIL: commit.authorEmail,
    GIT_COMMITTER_NAME: commit.authorName,
    GIT_COMMITTER_EMAIL: commit.authorEmail,
  };

  try {
    const cmd = 'git commit -m "' + commit.message + '" --date="' + authorDate + '" --allow-empty';
    execSync(cmd, { cwd: repoPath, stdio: 'pipe', env: Object.assign({}, process.env, env) });
  } catch {
    // Ignore empty commit errors
  }
}

// ------------------------------------------------------------------------------------------------
// Reset Fixture Data
// ------------------------------------------------------------------------------------------------

function resetFixtures() {
  log('Resetting fixture data...');

  if (existsSync(FIXTURE_ROOT)) {
    rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  }

  mkdirSync(REPO_PATH, { recursive: true });
  mkdirSync(DATA_PATH, { recursive: true });
  mkdirSync(RUNS_PATH, { recursive: true });

  const docDirs = ['note', 'todo', 'canvas', 'ai', 'journal', 'template', 'thought-dump'];
  for (let i = 0; i < docDirs.length; i++) {
    const dir = docDirs[i];
    mkdirSync(DATA_PATH + '/documents/' + dir, { recursive: true });
  }

  logSuccess('Fixture data reset complete');
}

// ------------------------------------------------------------------------------------------------
// Seed Functions
// ------------------------------------------------------------------------------------------------

function seedNotes(manifest) {
  log('Seeding fixture notes...');

  for (let i = 0; i < manifest.notes.length; i++) {
    const note = manifest.notes[i];
    const filePath = DATA_PATH + '/documents/note/' + note.id + '.md';
    const content = serializeNote(note);
    writeFileSync(filePath, content, 'utf8');
  }

  logSuccess('Seeded ' + manifest.notes.length + ' notes');
}

function seedTodos(manifest) {
  log('Seeding fixture todos...');

  for (let i = 0; i < manifest.todos.length; i++) {
    const todo = manifest.todos[i];
    const filePath = DATA_PATH + '/documents/todo/' + todo.id + '.md';
    const content = serializeTodo(todo);
    writeFileSync(filePath, content, 'utf8');
  }

  logSuccess('Seeded ' + manifest.todos.length + ' todos');
}

function seedCanvas(manifest) {
  log('Seeding fixture canvas...');

  const canvas = manifest.canvas;
  const filePath = DATA_PATH + '/documents/canvas/' + canvas.id + '.canvas';
  const content = serializeCanvas(canvas);
  writeFileSync(filePath, content, 'utf8');

  logSuccess('Seeded 1 canvas');
}

function seedChatThread(manifest) {
  log('Seeding fixture chat thread...');

  const chat = manifest.chatThread;
  const filePath = DATA_PATH + '/documents/ai/' + chat.id + '.md';
  const content = serializeChat(chat);
  writeFileSync(filePath, content, 'utf8');

  logSuccess('Seeded 1 chat thread');
}

function seedGitRepo(manifest) {
  log('Seeding fixture git repository...');

  const git = manifest.git;

  initGitRepo(REPO_PATH, git.userName, git.userEmail);

  // Use each commit's DECLARED timestamp for git author/committer dates
  for (let i = 0; i < git.commits.length; i++) {
    const commit = git.commits[i];
    if (commit.files) {
      gitAddCommit(REPO_PATH, commit);
    }
  }

  logSuccess('Seeded fixture git repository');
}

function writeFixtureManifest(manifest) {
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  logSuccess('Fixture manifest written to ' + MANIFEST_PATH);
}

// ------------------------------------------------------------------------------------------------
// Manifest Verification
// ------------------------------------------------------------------------------------------------

function readManifest() {
  if (!existsSync(MANIFEST_PATH)) {
    return null;
  }
  return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function verifyManifestByteIdentical(manifest1, manifest2) {
  const issues = [];

  // Compare stringified JSON directly (byte-identical check)
  const str1 = JSON.stringify(manifest1);
  const str2 = JSON.stringify(manifest2);

  if (str1 !== str2) {
    issues.push('Manifests are not byte-identical');
    // Additional diagnostic info
    if (manifest1.fixtureId !== manifest2.fixtureId) {
      issues.push('  - fixtureId differs');
    }
    if (manifest1.generatedAt !== manifest2.generatedAt) {
      issues.push(
        '  - generatedAt differs: ' + manifest1.generatedAt + ' vs ' + manifest2.generatedAt,
      );
    }
    const checkpoints1 = JSON.stringify(manifest1.checkpoints);
    const checkpoints2 = JSON.stringify(manifest2.checkpoints);
    if (checkpoints1 !== checkpoints2) {
      issues.push('  - checkpoints differ');
    }
  }

  return issues;
}

function verifyStructuralIdempotency(manifest1, manifest2) {
  const issues = [];

  if (manifest1.fixtureId !== manifest2.fixtureId) {
    issues.push('Fixture IDs differ: ' + manifest1.fixtureId + ' vs ' + manifest2.fixtureId);
  }

  const notes1Ids = manifest1.notes
    .map(function (n) {
      return n.id;
    })
    .sort();
  const notes2Ids = manifest2.notes
    .map(function (n) {
      return n.id;
    })
    .sort();
  if (JSON.stringify(notes1Ids) !== JSON.stringify(notes2Ids)) {
    issues.push('Note IDs differ between runs');
  }

  if (manifest1.canvas.id !== manifest2.canvas.id) {
    issues.push('Canvas ID differs between runs');
  }

  const cp1Routes = manifest1.checkpoints
    .map(function (c) {
      return c.route;
    })
    .sort();
  const cp2Routes = manifest2.checkpoints
    .map(function (c) {
      return c.route;
    })
    .sort();
  if (JSON.stringify(cp1Routes) !== JSON.stringify(cp2Routes)) {
    issues.push('Checkpoint routes differ between runs');
  }

  return issues;
}

// ------------------------------------------------------------------------------------------------
// Status Display
// ------------------------------------------------------------------------------------------------

function showStatus() {
  const manifest = readManifest();

  if (!manifest) {
    logWarn('No fixture manifest found. Run with --reset first.');
    return;
  }

  console.log('\n=== Fixture Status ===');
  console.log('Fixture ID: ' + manifest.fixtureId);
  console.log('Generated: ' + manifest.generatedAt);
  console.log('Repo Path: ' + manifest.repoPath);
  console.log('Data Path: ' + manifest.dataPath);
  console.log('\nNotes: ' + manifest.notes.length);
  console.log('Todos: ' + manifest.todos.length);
  console.log('Canvas: ' + manifest.canvas.id);
  console.log('Chat Thread: ' + manifest.chatThread.id);
  console.log('\nGit Commits: ' + manifest.git.commits.length);
  console.log('Git Branch: ' + manifest.git.branch);
  console.log('\nRoute Checkpoints:');

  for (let i = 0; i < manifest.checkpoints.length; i++) {
    const cp = manifest.checkpoints[i];
    const statusIcon =
      cp.status === 'automated' ? '[A]' : cp.status === 'manual-confirm' ? '[M]' : '[B]';
    console.log(
      '  ' +
        statusIcon +
        ' ' +
        cp.route +
        ': ' +
        cp.deepLink +
        (cp.reason ? ' (' + cp.reason + ')' : ''),
    );
  }

  console.log('\n=== File Structure ===');
  console.log('Repo: ' + REPO_PATH);
  console.log('Data: ' + DATA_PATH);
  console.log('Manifest: ' + MANIFEST_PATH);
}

// ------------------------------------------------------------------------------------------------
// Manual Checkpoint Capture
// ------------------------------------------------------------------------------------------------

function captureCheckpoint(route, confirmed) {
  const manifest = readManifest();

  if (!manifest) {
    logError('No fixture manifest found. Run with --reset first.');
    process.exit(1);
  }

  const checkpoint = manifest.checkpoints.find(function (cp) {
    return cp.route === route;
  });

  if (!checkpoint) {
    logError('Unknown route: ' + route);
    console.log(
      'Available routes: ' +
        manifest.checkpoints
          .map(function (cp) {
            return cp.route;
          })
          .join(', '),
    );
    process.exit(1);
  }

  if (checkpoint.status !== 'manual-confirm') {
    logError('Route ' + route + ' is automated, not manual-confirm');
    process.exit(1);
  }

  console.log('\n=== Manual Checkpoint: ' + route + ' ===');
  console.log('Deep Link: ' + checkpoint.deepLink);
  console.log('Thread ID: ' + (checkpoint.threadId || 'N/A'));
  console.log('Reason: ' + checkpoint.reason);

  if (confirmed) {
    console.log('\n[CONFIRMED] Manual capture accepted for ' + route);
    console.log('Status: confirmed');

    // Write confirmed checkpoint record
    const captureRecord = {
      route: route,
      deepLink: checkpoint.deepLink,
      status: 'confirmed',
      capturedAt: new Date().toISOString(),
      threadId: checkpoint.threadId,
    };

    const capturePath = RUNS_PATH + '/checkpoint-' + route + '.json';
    writeFileSync(capturePath, JSON.stringify(captureRecord, null, 2), 'utf8');
    console.log('Capture record: ' + capturePath);

    return 0;
  } else {
    console.log('\n[BLOCKED] Manual capture requires --confirm flag');
    console.log('Status: blocked');
    console.log('\nTo confirm capture, run with --confirm:');
    console.log('  node scripts/marketing/fixtures/seed.js --capture ' + route + ' --confirm');

    // Write blocked record
    const blockedRecord = {
      route: route,
      deepLink: checkpoint.deepLink,
      status: 'blocked',
      blockedAt: new Date().toISOString(),
      reason: checkpoint.reason,
    };

    const blockedPath = RUNS_PATH + '/checkpoint-' + route + '-blocked.json';
    writeFileSync(blockedPath, JSON.stringify(blockedRecord, null, 2), 'utf8');
    console.log('Blocked record: ' + blockedPath);

    // Exit 3 = blocked (manual checkpoint requires --confirm)
    process.exit(3);
  }
}

// ------------------------------------------------------------------------------------------------
// Main
// ------------------------------------------------------------------------------------------------

function generateFixtureId() {
  return 'fixture-mkt-2024';
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log(
      '\nMarketing Fixture Seed CLI\n' +
        '========================\n\n' +
        'Usage:\n' +
        '  node scripts/marketing/fixtures/seed.js --reset                    Reset and seed fixtures\n' +
        '  node scripts/marketing/fixtures/seed.js --status                   Show fixture status\n' +
        '  node scripts/marketing/fixtures/seed.js --verify                   Verify byte-identical idempotency\n' +
        '  node scripts/marketing/fixtures/seed.js --capture <route> [--confirm]  Capture manual checkpoint\n\n' +
        'Options:\n' +
        '  --reset    Reset and reseed all fixture data\n' +
        '  --status   Display current fixture status\n' +
        '  --verify   Run twice and compare manifests for byte-identical idempotency\n' +
        '  --capture  Capture a manual checkpoint route (requires --confirm for graph-view, chat)\n' +
        '  --confirm  Confirm manual checkpoint capture (use with --capture)\n\n' +
        'Exit codes:\n' +
        '  0  Success\n' +
        '  1  Error\n' +
        '  2  Missing prerequisites\n' +
        '  3  Manual checkpoint blocked (use --confirm)\n',
    );
    return;
  }

  // --status
  if (args.indexOf('--status') !== -1) {
    showStatus();
    return;
  }

  // --reset
  if (args.indexOf('--reset') !== -1) {
    log('Starting fixture seed (--reset)...');

    try {
      resetFixtures();

      const fixtureIdVal = generateFixtureId();
      const manifest = createFixtureManifest(fixtureIdVal, REPO_PATH, DATA_PATH);

      seedNotes(manifest);
      seedTodos(manifest);
      seedCanvas(manifest);
      seedChatThread(manifest);
      seedGitRepo(manifest);
      writeFixtureManifest(manifest);

      logSuccess('\nFixture seed complete!');
      console.log('\nRun status: node scripts/marketing/fixtures/seed.js --status');
      console.log('Run idempotency verify: node scripts/marketing/fixtures/seed.js --verify');

      return;
    } catch (error) {
      logError('Seed failed: ' + error.message);
      process.exit(1);
    }
  }

  // --verify (byte-identical manifest comparison)
  if (args.indexOf('--verify') !== -1) {
    log('Verifying byte-identical idempotency...');

    try {
      if (!existsSync(MANIFEST_PATH)) {
        logError('No fixture manifest found. Run with --reset first.');
        process.exit(1);
      }

      const manifest1 = readManifest();

      // Backup original manifest
      const backupPath = OUTPUT_ROOT + '/.fixture-manifest-backup.json';
      cpSync(MANIFEST_PATH, backupPath);

      try {
        // Second seed
        resetFixtures();
        const fixtureIdVal = generateFixtureId();
        const manifest2 = createFixtureManifest(fixtureIdVal, REPO_PATH, DATA_PATH);
        seedNotes(manifest2);
        seedTodos(manifest2);
        seedCanvas(manifest2);
        seedChatThread(manifest2);
        seedGitRepo(manifest2);
        writeFixtureManifest(manifest2);

        // Read freshly written manifest
        const manifest2Fresh = readManifest();

        // Byte-identical check (strict)
        const byteIssues = verifyManifestByteIdentical(manifest1, manifest2Fresh);

        // Structural check (looser)
        const structuralIssues = verifyStructuralIdempotency(manifest1, manifest2Fresh);

        const allIssues = byteIssues.concat(structuralIssues);

        if (allIssues.length === 0) {
          logSuccess('Byte-identical idempotency verified!');
          console.log('\n=== Byte-Identical Idempotency Check PASSED ===');
          console.log('Fixture ID: ' + manifest1.fixtureId);
          console.log('Generated timestamp: ' + manifest1.generatedAt);
          console.log('Note IDs: ' + manifest1.notes.length + ' notes');
          console.log('Canvas ID: ' + manifest1.canvas.id);
          console.log('Checkpoints: ' + manifest1.checkpoints.length + ' routes');
        } else {
          logError('Idempotency check FAILED');
          console.log('\n=== Idempotency Issues ===');
          for (let i = 0; i < allIssues.length; i++) {
            console.log('  - ' + allIssues[i]);
          }
          process.exit(1);
        }
      } finally {
        // Restore original
        cpSync(backupPath, MANIFEST_PATH);
        rmSync(backupPath, { force: true });
      }

      return;
    } catch (error) {
      logError('Verify failed: ' + error.message);
      process.exit(1);
    }
  }

  // --capture <route> [--confirm]
  const captureIndex = args.indexOf('--capture');
  if (captureIndex !== -1) {
    const route = args[captureIndex + 1];
    const confirmed = args.indexOf('--confirm') !== -1;

    if (!route) {
      logError('--capture requires a route argument');
      console.log(
        'Available routes: home, notes, note-editor, canvas-editor, todos, explore, graph-view, chat',
      );
      process.exit(1);
    }

    const exitCode = captureCheckpoint(route, confirmed);
    process.exit(exitCode);
  }

  // Unknown arguments
  logError('Unknown arguments: ' + args.join(' '));
  console.log('\nRun --help for usage information');
  process.exit(1);
}

main();
