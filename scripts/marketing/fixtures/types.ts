/**
 * Marketing Asset Pipeline - Fixture Types & Factories
 *
 * Deterministic fixture data for marketing captures.
 * All IDs, timestamps, and content are explicit and reproducible.
 *
 * References:
 * - src/models/Note.ts
 * - src/models/Todo.ts
 * - src/models/Canvas.ts
 * - src/models/Chat.ts
 * - docs/wiki/note-file-format.md
 * - docs/wiki/screens.md
 */

import type { Route } from '../config';

// ------------------------------------------------------------------------------------------------
// Deterministic ID Generation (seeded, not random)
// ------------------------------------------------------------------------------------------------

/**
 * Deterministic fixture ID based on a seed string.
 * Same seed always produces same ID.
 */
export function fixtureId(seed: string, suffix: string = ''): string {
  const base = `fixture-${seed}${suffix ? '-' + suffix : ''}`;
  // Simple hash for determinism
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    const char = base.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return `fixture-${Math.abs(hash).toString(36)}-${seed}`;
}

// ------------------------------------------------------------------------------------------------
// Fixture Note
// ------------------------------------------------------------------------------------------------

export interface FixtureNote {
  id: string;
  title: string;
  content: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  tags: string[];
  color?: string;
  folderPath?: string;
  format: 'markdown';
  isPinned?: boolean;
  /** Wiki-links to other fixture notes (by title) */
  linksTo?: string[];
}

/**
 * Serialize fixture note to markdown file content with YAML frontmatter.
 */
export function serializeNote(note: FixtureNote): string {
  const frontmatter = [
    '---',
    `id: ${note.id}`,
    `title: ${note.title}`,
    `type: note`,
    `tags: [${note.tags.join(', ')}]`,
    note.folderPath ? `folder: ${note.folderPath}` : null,
    note.color ? `color: ${note.color}` : null,
    note.isPinned ? `isPinned: true` : null,
    `createdAt: ${note.createdAt}`,
    `updatedAt: ${note.updatedAt}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  return `${frontmatter}\n\n${note.content}`;
}

// ------------------------------------------------------------------------------------------------
// Fixture Todo
// ------------------------------------------------------------------------------------------------

export type TodoStatus = 'todo' | 'in-progress' | 'done';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface FixtureTodo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  dueDate?: string; // ISO 8601
  priority: TodoPriority;
  tags: string[];
  notes?: string;
  linkedNoteId?: string;
  status: TodoStatus;
}

/**
 * Serialize fixture todo to markdown file content with YAML frontmatter.
 */
export function serializeTodo(todo: FixtureTodo): string {
  const frontmatter = [
    '---',
    `id: ${todo.id}`,
    `type: todo`,
    `text: ${todo.text}`,
    `completed: ${todo.completed}`,
    todo.dueDate ? `dueDate: ${todo.dueDate}` : null,
    `priority: ${todo.priority}`,
    `tags: [${todo.tags.join(', ')}]`,
    todo.notes ? `notes: ${todo.notes}` : null,
    todo.linkedNoteId ? `linkedNoteId: ${todo.linkedNoteId}` : null,
    `status: ${todo.status}`,
    `createdAt: ${todo.createdAt}`,
    `updatedAt: ${todo.updatedAt}`,
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  return frontmatter;
}

// ------------------------------------------------------------------------------------------------
// Fixture Canvas
// ------------------------------------------------------------------------------------------------

export interface FixtureCanvasElement {
  id: string;
  type: 'text' | 'shape' | 'stroke';
  x: number;
  y: number;
  [key: string]: unknown;
}

export interface FixtureCanvasScene {
  version: number;
  width: number;
  height: number;
  background: string;
  elements: FixtureCanvasElement[];
}

export interface FixtureCanvas {
  id: string;
  title: string;
  scene: FixtureCanvasScene;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  tags: string[];
}

/**
 * Serialize fixture canvas to JSON file content.
 */
export function serializeCanvas(canvas: FixtureCanvas): string {
  return JSON.stringify(canvas, null, 2);
}

// ------------------------------------------------------------------------------------------------
// Fixture Chat Thread
// ------------------------------------------------------------------------------------------------

export interface FixtureChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string; // ISO 8601
}

export interface FixtureChatThread {
  id: string;
  title: string;
  messages: FixtureChatMessage[];
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  repoOwner: string;
  repoName: string;
  branch: string;
  filePath: string;
}

/**
 * Serialize fixture chat thread to markdown file content.
 */
export function serializeChat(thread: FixtureChatThread): string {
  const frontmatter = [
    '---',
    `id: ${thread.id}`,
    `title: ${thread.title}`,
    `repoOwner: ${thread.repoOwner}`,
    `repoName: ${thread.repoName}`,
    `branch: ${thread.branch}`,
    `filePath: ${thread.filePath}`,
    `createdAt: ${thread.createdAt}`,
    `updatedAt: ${thread.updatedAt}`,
    '---',
  ].join('\n');

  const messagesBody = thread.messages
    .map((m) => `## ${m.role === 'user' ? 'User' : 'Assistant'} (${m.timestamp})\n\n${m.content}`)
    .join('\n\n');

  return `${frontmatter}\n\n${messagesBody}`;
}

// ------------------------------------------------------------------------------------------------
// Fixture Git Repository
// ------------------------------------------------------------------------------------------------

export interface FixtureGitCommit {
  message: string;
  authorName: string;
  authorEmail: string;
  timestamp: string; // ISO 8601
  /** Files changed in this commit: relative path -> content */
  files?: Record<string, string>;
}

export interface FixtureGitRepo {
  name: string;
  owner: string;
  branch: string;
  commits: FixtureGitCommit[];
  /** Git user identity (only for this fixture repo) */
  userName: string;
  userEmail: string;
}

// ------------------------------------------------------------------------------------------------
// Route Checkpoint Manifest
// ------------------------------------------------------------------------------------------------

export type CheckpointStatus = 'automated' | 'manual-confirm' | 'blocked';

export interface RouteCheckpoint {
  route: Route;
  deepLink: string;
  status: CheckpointStatus;
  /** For note-editor: the specific fixture note ID */
  noteId?: string;
  /** For canvas-editor: the specific fixture canvas ID */
  canvasId?: string;
  /** For chat-thread: the specific thread ID */
  threadId?: string;
  /** For note-editor with linked notes */
  linkedNoteIds?: string[];
  /** Reason if blocked or manual-confirm */
  reason?: string;
  /** ISO timestamp when captured/confirmed */
  capturedAt?: string;
}

export interface FixtureManifest {
  /** Unique fixture run ID */
  fixtureId: string;
  /** ISO timestamp */
  generatedAt: string;
  /** Fixture repository root path */
  repoPath: string;
  /** Data root path */
  dataPath: string;
  /** Fixture notes */
  notes: FixtureNote[];
  /** Fixture todos */
  todos: FixtureTodo[];
  /** Fixture canvas */
  canvas: FixtureCanvas;
  /** Fixture chat thread */
  chatThread: FixtureChatThread;
  /** Git fixture repo info */
  git: FixtureGitRepo;
  /** Route checkpoints */
  checkpoints: RouteCheckpoint[];
}

// ------------------------------------------------------------------------------------------------
// Predefined Fixture Content
// ------------------------------------------------------------------------------------------------

/**
 * 5 linked fixture notes for marketing capture.
 * Content is deterministic and suitable for app store screenshots.
 */
export function createFixtureNotes(baseDate: string): FixtureNote[] {
  const notes: FixtureNote[] = [
    {
      id: fixtureId('note-1'),
      title: 'Getting Started with GitNotēs',
      content: `# Getting Started with GitNotēs

Welcome to GitNotēs! This note will help you get up and running quickly.

## Key Features

- **Git-backed storage** - Every note is a plain file in your Git repo
- **Offline-first** - Changes queue locally and sync when online
- **Multi-format support** - Markdown, Neorg, Org mode, and JSON

## Your First Note

Create a new note by tapping the + button on the Notes tab. Your note is automatically saved and versioned by Git.

## Linking Notes

You can link to other notes using [[wiki-links]]. Try linking to [[Project Ideas]] to see how it works.

## Next Steps

1. Connect a GitHub repository in Settings
2. Create your first note
3. Explore the [[Canvas Editor]] for visual thinking

See also: [[Meeting Notes]], [[Project Ideas]]`,
      createdAt: baseDate,
      updatedAt: baseDate,
      tags: ['getting-started', 'guide'],
      color: 'blue',
      isPinned: true,
      format: 'markdown',
      linksTo: ['Project Ideas', 'Canvas Editor'],
    },
    {
      id: fixtureId('note-2'),
      title: 'Project Ideas',
      content: `# Project Ideas

A running list of project ideas and notes.

## Feature Ideas

- [ ] Dark mode toggle
- [ ] More export formats
- [ ] Collaboration features

## Experiments

Working on a new [[Canvas Editor]] layout for better visual organization.

See [[Getting Started with GitNotēs]] for an introduction.`,
      createdAt: baseDate,
      updatedAt: baseDate,
      tags: ['projects', 'ideas'],
      color: 'green',
      format: 'markdown',
      linksTo: ['Getting Started with GitNotēs', 'Canvas Editor'],
    },
    {
      id: fixtureId('note-3'),
      title: 'Meeting Notes',
      content: `# Meeting Notes

## Team Standup - Sprint Planning

**Date:** ${new Date().toISOString().split('T')[0]}
**Attendees:** Alice, Bob, Carol

### Agenda

1. Review last week's progress
2. Sprint planning for this week
3. Open discussion

### Notes

- GitNotēs v2.0 planning underway
- New canvas features in development
- Performance improvements pending

### Action Items

- [ ] Review PR #142
- [ ] Update documentation
- [ ] Schedule team demo

### Related

See [[Project Ideas]] for feature tracking.`,
      createdAt: baseDate,
      updatedAt: baseDate,
      tags: ['meetings', 'sprint'],
      color: 'yellow',
      format: 'markdown',
      linksTo: ['Project Ideas'],
    },
    {
      id: fixtureId('note-4'),
      title: 'Canvas Editor',
      content: `# Canvas Editor

The Canvas Editor provides an infinite space for visual thinking.

## Features

- **Freeform drawing** with multiple tools
- **Shapes and text** for structured diagrams
- **Charts** for data visualization
- **Images** for rich content

## Use Cases

- Brainstorming sessions
- Process mapping
- Mind mapping
- Visual note-taking

## Getting Started

1. Open Canvas from the tab bar
2. Tap + to add elements
3. Pinch to zoom, drag to pan

## Integrations

Canvases can be embedded in [[Meeting Notes]] and linked from [[Project Ideas]].`,
      createdAt: baseDate,
      updatedAt: baseDate,
      tags: ['canvas', 'features'],
      color: 'purple',
      format: 'markdown',
      linksTo: ['Meeting Notes', 'Project Ideas'],
    },
    {
      id: fixtureId('note-5'),
      title: 'API Reference',
      content: `# API Reference

Technical documentation for GitNotēs.

## Deep Links

| Route | URL Pattern |
|-------|------------|
| Home | gitnotes://home |
| Notes | gitnotes://notes |
| Note Editor | gitnotes://note/:noteId |
| Canvas | gitnotes://canvas/:canvasId |
| Explore | gitnotes://explore |
| Chat | gitnotes://chat |
| Settings | gitnotes://settings |

## File Format

Notes use YAML frontmatter with markdown body:

\`\`\`yaml
---
id: 1699876543-abc123
title: My Note
type: note
tags: [work, ideas]
createdAt: 2024-01-15T10:30:00.000Z
updatedAt: 2024-01-15T14:22:00.000Z
---

Note body content here.
\`\`\`

## Git Integration

All notes are stored as plain files in your Git repository. See [[Getting Started with GitNotēs]] for setup instructions.`,
      createdAt: baseDate,
      updatedAt: baseDate,
      tags: ['api', 'reference', 'technical'],
      color: 'gray',
      format: 'markdown',
      linksTo: ['Getting Started with GitNotēs'],
    },
  ];

  return notes;
}

/**
 * Varied fixture todos for marketing capture.
 */
export function createFixtureTodos(baseDate: string): FixtureTodo[] {
  return [
    {
      id: fixtureId('todo-1'),
      text: 'Review GitNotēs Getting Started guide',
      completed: false,
      createdAt: baseDate,
      updatedAt: baseDate,
      priority: 'high',
      tags: ['documentation'],
      status: 'todo',
    },
    {
      id: fixtureId('todo-2'),
      text: 'Set up GitHub integration',
      completed: true,
      createdAt: baseDate,
      updatedAt: baseDate,
      priority: 'high',
      tags: ['setup', 'git'],
      status: 'done',
    },
    {
      id: fixtureId('todo-3'),
      text: 'Create first canvas diagram',
      completed: false,
      createdAt: baseDate,
      updatedAt: baseDate,
      priority: 'medium',
      tags: ['canvas', 'visual'],
      status: 'in-progress',
      linkedNoteId: fixtureId('note-4'),
    },
    {
      id: fixtureId('todo-4'),
      text: 'Write meeting notes for sprint planning',
      completed: true,
      createdAt: baseDate,
      updatedAt: baseDate,
      priority: 'medium',
      tags: ['meetings'],
      status: 'done',
    },
    {
      id: fixtureId('todo-5'),
      text: 'Explore canvas editor features',
      completed: false,
      createdAt: baseDate,
      updatedAt: baseDate,
      priority: 'low',
      tags: ['canvas', 'exploration'],
      status: 'todo',
    },
  ];
}

/**
 * Fixture canvas for marketing capture.
 */
export function createFixtureCanvas(baseDate: string): FixtureCanvas {
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
        {
          id: fixtureId('canvas-el-4'),
          type: 'shape',
          shape: 'rect',
          x: 550,
          y: 200,
          width: 400,
          height: 200,
          color: '#34c759',
          fillColor: '#e8f8ed',
        },
        {
          id: fixtureId('canvas-el-5'),
          type: 'text',
          x: 570,
          y: 220,
          text: 'Organize & Link',
          fontSize: 18,
          color: '#1a1a1a',
        },
        {
          id: fixtureId('canvas-el-6'),
          type: 'shape',
          shape: 'rect',
          x: 1000,
          y: 200,
          width: 400,
          height: 200,
          color: '#ff9500',
          fillColor: '#fff4e5',
        },
        {
          id: fixtureId('canvas-el-7'),
          type: 'text',
          x: 1020,
          y: 220,
          text: 'Sync Everywhere',
          fontSize: 18,
          color: '#1a1a1a',
        },
        {
          id: fixtureId('canvas-el-8'),
          type: 'shape',
          shape: 'arrow',
          x: 510,
          y: 300,
          width: 30,
          height: 0,
          color: '#8e8e93',
        },
        {
          id: fixtureId('canvas-el-9'),
          type: 'shape',
          shape: 'arrow',
          x: 960,
          y: 300,
          width: 30,
          height: 0,
          color: '#8e8e93',
        },
      ],
    },
    createdAt: baseDate,
    updatedAt: baseDate,
    tags: ['marketing', 'storyboard'],
  };
}

/**
 * Fixture chat thread for marketing capture.
 */
export function createFixtureChatThread(baseDate: string): FixtureChatThread {
  return {
    id: fixtureId('chat-thread'),
    title: 'GitNotēs Feature Discussion',
    messages: [
      {
        id: fixtureId('chat-msg-1'),
        role: 'user',
        content: 'How do I link notes together in GitNotēs?',
        timestamp: baseDate,
      },
      {
        id: fixtureId('chat-msg-2'),
        role: 'assistant',
        content:
          'You can link notes using wiki-style links with double brackets. For example, [[Getting Started with GitNotēs]] creates a link to that note. When you type [[, an autocomplete menu will appear with your existing notes. This works across all note formats including Markdown, Neorg, and Org mode.',
        timestamp: baseDate,
      },
      {
        id: fixtureId('chat-msg-3'),
        role: 'user',
        content: 'Can I see all notes that link to a specific note?',
        timestamp: baseDate,
      },
      {
        id: fixtureId('chat-msg-4'),
        role: 'assistant',
        content:
          "Yes! GitNotēs automatically builds a backlinks index. Open any note and scroll to the Backlinks section at the bottom. You'll see all notes that link to the current note, making it easy to understand how your knowledge graph connects.",
        timestamp: baseDate,
      },
    ],
    createdAt: baseDate,
    updatedAt: baseDate,
    repoOwner: 'marketing-fixture',
    repoName: 'gitnotes-demo',
    branch: 'main',
    filePath: 'documents/ai/feature-discussion.md',
  };
}

/**
 * Fixture git repository with commit history.
 */
export function createFixtureGitRepo(): FixtureGitRepo {
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
      {
        message: 'Create project ideas note',
        authorName: 'GitNotēs Marketing',
        authorEmail: 'marketing@gitnotes.app',
        timestamp: '2024-01-03T10:00:00.000Z',
        files: {
          'documents/note/project-ideas.md':
            '---\nid: project-ideas\ntitle: Project Ideas\ntype: note\ntags: [projects]\n---\n\nFeature ideas and experiments.',
        },
      },
    ],
  };
}

/**
 * Create route checkpoints for the fixture manifest.
 */
export function createRouteCheckpoints(
  notes: FixtureNote[],
  canvas: FixtureCanvas,
  chatThread: FixtureChatThread,
): RouteCheckpoint[] {
  const checkpoints: RouteCheckpoint[] = [
    {
      route: 'home',
      deepLink: 'gitnotes://home',
      status: 'automated',
      capturedAt: new Date().toISOString(),
    },
    {
      route: 'notes',
      deepLink: 'gitnotes://notes',
      status: 'automated',
      capturedAt: new Date().toISOString(),
    },
    {
      route: 'note-editor',
      deepLink: `gitnotes://note/${notes[0].id}`,
      status: 'automated',
      noteId: notes[0].id,
      linkedNoteIds: notes.map((n) => n.id),
      capturedAt: new Date().toISOString(),
    },
    {
      route: 'canvas-editor',
      deepLink: `gitnotes://canvas/${canvas.id}`,
      status: 'automated',
      canvasId: canvas.id,
      capturedAt: new Date().toISOString(),
    },
    {
      route: 'todos',
      deepLink: 'gitnotes://home',
      status: 'automated',
      capturedAt: new Date().toISOString(),
      reason: 'No direct deep link - app navigates to Todos tab',
    },
    {
      route: 'explore',
      deepLink: 'gitnotes://explore',
      status: 'automated',
      capturedAt: new Date().toISOString(),
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

  return checkpoints;
}

/**
 * Full fixture manifest factory.
 */
export function createFixtureManifest(
  fixtureId: string,
  repoPath: string,
  dataPath: string,
  baseDate: string,
): FixtureManifest {
  const notes = createFixtureNotes(baseDate);
  const todos = createFixtureTodos(baseDate);
  const canvas = createFixtureCanvas(baseDate);
  const chatThread = createFixtureChatThread(baseDate);
  const git = createFixtureGitRepo();
  const checkpoints = createRouteCheckpoints(notes, canvas, chatThread);

  return {
    fixtureId,
    generatedAt: new Date().toISOString(),
    repoPath,
    dataPath,
    notes,
    todos,
    canvas,
    chatThread,
    git,
    checkpoints,
  };
}
