/**
 * Deterministic fixture builders for E2E sync scenarios.
 *
 * Provides:
 * - Content factories for notes, canvases, and todos with deterministic IDs/content
 * - The 6 scenario op-sequences (add-only, edit-only, delete-only, add+edit,
 *   edit+delete, add+edit+delete)
 * - Per-mode expected end-state assertions for API and clone modes
 *
 * Scenarios are defined as op-sequences of typed operations.  The runner
 * (`e2e-runner.ts`) executes each op against a real or mock sync stack and
 * collects timing + visibility checkpoints.
 */

import type { SyncMode } from '../../src/services/git/syncTiming';

// ---------------------------------------------------------------------------
// Content factories
// ---------------------------------------------------------------------------

let _counter = 0;
function nextId(): string {
  return `fixture-${String(++_counter).padStart(4, '0')}`;
}

/** Deterministic note content — same inputs always produce identical output. */
export function makeNote(overrides: Partial<{ title: string; body: string; repoPath: string; branch: string }> = {}): {
  id: string;
  title: string;
  body: string;
  repoPath: string;
  branch: string;
  sha?: string;
} {
  const n = nextId();
  return {
    id: n,
    title: overrides.title ?? `Note ${n}`,
    body: overrides.body ?? `Body of fixture note ${n}.`,
    repoPath: overrides.repoPath ?? 'test-notes',
    branch: overrides.branch ?? 'main',
    sha: overrides.sha,
  };
}

/** Deterministic canvas content. */
export function makeCanvas(overrides: Partial<{ name: string; data: string; repoPath: string; branch: string }> = {}): {
  id: string;
  name: string;
  data: string;
  repoPath: string;
  branch: string;
  sha?: string;
} {
  const n = nextId();
  return {
    id: n,
    name: overrides.name ?? `Canvas ${n}`,
    data: overrides.data ?? JSON.stringify({ version: 1, elements: [] }),
    repoPath: overrides.repoPath ?? 'test-notes',
    branch: overrides.branch ?? 'main',
    sha: overrides.sha,
  };
}

/** Deterministic todo content. */
export function makeTodo(overrides: Partial<{ text: string; completed: boolean; repoPath: string; branch: string }> = {}): {
  id: string;
  text: string;
  completed: boolean;
  repoPath: string;
  branch: string;
  sha?: string;
} {
  const n = nextId();
  return {
    id: n,
    text: overrides.text ?? `Todo ${n}`,
    completed: overrides.completed ?? false,
    repoPath: overrides.repoPath ?? 'test-notes',
    branch: overrides.branch ?? 'main',
    sha: overrides.sha,
  };
}

// ---------------------------------------------------------------------------
// Operation types
// ---------------------------------------------------------------------------

export type NoteOp =
  | { type: 'note.add'; note: ReturnType<typeof makeNote> }
  | { type: 'note.edit'; id: string; title?: string; body?: string; sha: string }
  | { type: 'note.delete'; id: string; sha: string };

export type CanvasOp =
  | { type: 'canvas.add'; canvas: ReturnType<typeof makeCanvas> }
  | { type: 'canvas.edit'; id: string; data?: string; sha: string }
  | { type: 'canvas.delete'; id: string; sha: string };

export type TodoOp =
  | { type: 'todo.add'; todo: ReturnType<typeof makeTodo> }
  | { type: 'todo.edit'; id: string; text?: string; completed?: boolean; sha: string }
  | { type: 'todo.delete'; id: string; sha: string };

export type SyncOp = NoteOp | CanvasOp | TodoOp;

/** A complete scenario: an ordered list of operations to execute sequentially. */
export interface Scenario {
  id: number;
  name: string;
  description: string;
  ops: SyncOp[];
  /** Clone-mode push trigger that should be fired after ops. */
  clonePushTrigger: ClonePushTrigger;
  /** Timing checkpoints to assert: [label, predicate] */
  checkpoints?: Array<[string, (timingEntries: unknown[]) => boolean]>;
}

/** Clone-mode push triggers (from plan §3.3 / sync-write-modes.md). */
export type ClonePushTrigger =
  | 'long-press-floating-btn'   // Scenario 1: add-only
  | 'stage-push-all'            // Scenario 2: edit-only
  | 'stage-per-group-push'      // Scenario 3: delete-only
  | '3-min-idle-autopush'       // Scenario 4: add+edit
  | 'os-bg-task'               // Scenario 5: edit+delete
  | 'foreground-resume';       // Scenario 6: add+edit+delete

// ---------------------------------------------------------------------------
// Expected end-state per mode
// ---------------------------------------------------------------------------

export interface ExpectedState {
  /** Files that must exist on disk / remote after the scenario completes. */
  filesPresent: string[];
  /** Files that must NOT exist after the scenario completes. */
  filesAbsent: string[];
  /**
   * For clone mode: items that should appear in StagingService.listStaged
   * BEFORE the push trigger fires.
   */
  cloneStagedBeforePush: string[];
  /**
   * For API mode: whether the blocking overlay should have been visible
   * during the save cycle.
   */
  apiBlockOverlayFired: boolean;
  /**
   * For API mode: whether the pull-after-push store refresh should have
   * occurred.
   */
  apiPullAfterPush: boolean;
}

export function buildExpectedState(
  scenario: Scenario,
  mode: SyncMode,
): ExpectedState {
  const filesPresent: string[] = [];
  const filesAbsent: string[] = [];

  for (const op of scenario.ops) {
    if (op.type === 'note.add') {
      const relPath = `notes/${op.note.id}.md`;
      if (mode === 'api') filesPresent.push(relPath);
      else filesAbsent.push(relPath); // clone: not yet pushed
    }
    if (op.type === 'note.edit') {
      filesPresent.push(`notes/${op.id}.md`);
    }
    if (op.type === 'note.delete') {
      filesAbsent.push(`notes/${op.id}.md`);
    }
    if (op.type === 'canvas.add') {
      filesPresent.push(`canvases/${op.canvas.id}.json`);
    }
    if (op.type === 'canvas.delete') {
      filesAbsent.push(`canvases/${op.id}.json`);
    }
    if (op.type === 'todo.add') {
      filesPresent.push(`todos/${op.todo.id}.json`);
    }
    if (op.type === 'todo.delete') {
      filesAbsent.push(`todos/${op.id}.json`);
    }
  }

  const cloneStagedBeforePush =
    mode === 'clone' ? filesPresent.map((f) => f) : [];

  return {
    filesPresent: mode === 'api' ? filesPresent : [],
    filesAbsent: mode === 'api' ? filesAbsent : [],
    cloneStagedBeforePush,
    apiBlockOverlayFired: mode === 'api',
    apiPullAfterPush: mode === 'api',
  };
}

// ---------------------------------------------------------------------------
// The 6 scenarios (plan §3.3)
// ---------------------------------------------------------------------------

/**
 * Scenario 1 — add-only
 * One new note (or canvas or todo) is created.
 *
 * API mode: PUT fires immediately → file on GitHub at T3.
 * Clone mode: local commit staged → visible on Stage + floating count.
 *   Push trigger: long-press floating button.
 */
export const SCENARIO_1_ADD_ONLY: Scenario = {
  id: 1,
  name: 'add-only',
  description: 'Create a single new note (no prior state).',
  ops: [
    {
      type: 'note.add',
      note: makeNote({ title: 'First Note', body: 'Adding a brand new note.' }),
    },
  ],
  clonePushTrigger: 'long-press-floating-btn',
};

/**
 * Scenario 2 — edit-only
 * An existing note is edited. Requires a pre-seeded sha.
 *
 * API mode: PUT w/ sha → updated immediately.
 * Clone mode: staged edit → push via Stage Push-all.
 *   Push trigger: Stage push-all.
 */
export const SCENARIO_2_EDIT_ONLY: Scenario = {
  id: 2,
  name: 'edit-only',
  description: 'Edit an existing note (requires pre-seeded sha).',
  ops: [
    {
      type: 'note.edit',
      id: 'existing-note',
      title: 'Edited Title',
      body: 'Edited body text.',
      sha: 'abc123sha',
    },
  ],
  clonePushTrigger: 'stage-push-all',
};

/**
 * Scenario 3 — delete-only
 * An existing note is deleted.
 *
 * API mode: DELETE (sha-cached) → file gone immediately.
 * Clone mode: staged delete → push via Stage per-group push.
 *   Push trigger: Stage per-group push.
 */
export const SCENARIO_3_DELETE_ONLY: Scenario = {
  id: 3,
  name: 'delete-only',
  description: 'Delete an existing note (requires pre-seeded sha).',
  ops: [
    {
      type: 'note.delete',
      id: 'to-delete',
      sha: 'sha-to-delete',
    },
  ],
  clonePushTrigger: 'stage-per-group-push',
};

/**
 * Scenario 4 — add+edit
 * A new note is created and then edited before any push.
 *
 * API mode: 2 PUTs (may be batched) → GitHub immediately.
 * Clone mode: 2 staged commits → push via 3-min idle auto-push.
 *   Push trigger: 3-min idle auto-push (StagePushScheduler).
 */
export const SCENARIO_4_ADD_EDIT: Scenario = {
  id: 4,
  name: 'add+edit',
  description: 'Add a note then immediately edit it before any push.',
  ops: [
    {
      type: 'note.add',
      note: makeNote({ title: 'New Note', body: 'Initial body.' }),
    },
    {
      type: 'note.edit',
      id: 'fixture-0001', // matches the first op's generated id
      title: 'New Note Revised',
      body: 'Revised body after edit.',
      sha: 'new-note-sha',
    },
  ],
  clonePushTrigger: '3-min-idle-autopush',
};

/**
 * Scenario 5 — edit+delete
 * An existing note is edited then deleted.
 *
 * API mode: PUT + DELETE → both on GitHub immediately.
 * Clone mode: staged edit+delete → push via OS background task (≤10 files).
 *   Push trigger: OS bg task.
 */
export const SCENARIO_5_EDIT_DELETE: Scenario = {
  id: 5,
  name: 'edit+delete',
  description: 'Edit an existing note then delete it.',
  ops: [
    {
      type: 'note.edit',
      id: 'target-note',
      body: 'Edited then deleted.',
      sha: 'edit-sha',
    },
    {
      type: 'note.delete',
      id: 'target-note',
      sha: 'edit-sha',
    },
  ],
  clonePushTrigger: 'os-bg-task',
};

/**
 * Scenario 6 — add+edit+delete
 * A note is added, edited, then deleted — full lifecycle.
 *
 * API mode: full batch chain → GitHub immediately.
 * Clone mode: all staged → push via foreground resume.
 *   Push trigger: foreground resume (ForegroundSyncService).
 */
export const SCENARIO_6_ADD_EDIT_DELETE: Scenario = {
  id: 6,
  name: 'add+edit+delete',
  description: 'Add, edit, then delete a note in one scenario.',
  ops: [
    {
      type: 'note.add',
      note: makeNote({ title: 'Transient Note', body: 'Will be edited and deleted.' }),
    },
    {
      type: 'note.edit',
      id: 'fixture-0003',
      body: 'Edited transient note.',
      sha: 'transient-sha',
    },
    {
      type: 'note.delete',
      id: 'fixture-0003',
      sha: 'transient-sha',
    },
  ],
  clonePushTrigger: 'foreground-resume',
};

/** All 6 scenarios in execution order. */
export const ALL_SCENARIOS: Scenario[] = [
  SCENARIO_1_ADD_ONLY,
  SCENARIO_2_EDIT_ONLY,
  SCENARIO_3_DELETE_ONLY,
  SCENARIO_4_ADD_EDIT,
  SCENARIO_5_EDIT_DELETE,
  SCENARIO_6_ADD_EDIT_DELETE,
];
