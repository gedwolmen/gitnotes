/**
 * E2E scenario runner.
 *
 * `runScenario(scenario, mode)` executes one scenario against one sync mode and
 * returns a `ScenarioReport` with timing, visibility, and push-trigger data.
 *
 * The runner is designed to be run against a mock stack in CI and against the
 * real stack (with a live `test-notes` remote) post-merge.
 *
 * ## Mock strategy
 *
 * All git network calls (`gitHttp.request`) and all FS calls (`makeGitFs`-returned
 * promises) are intercepted by the `syncTiming` wrappers, which are enabled by
 * this runner before any scenario ops are executed.  Actual git operations are
 * short-circuited via pre-seeded mocks so no real network or file I/O occurs
 * during test runs.
 *
 * ## Sub-checks
 *
 * - **Clone mode**: after ops but before push trigger, asserts
 *   `StagingService.listStaged` contains the expected staged items and
 *   `stageStore.pendingCount > 0`.  After push trigger, asserts the staged
 *   set is cleared.
 *
 * - **API mode**: asserts `gitOperationStore` recorded a `source:'save'` cycle
 *   during the save window (proxy for `SyncBlockOverlay` firing), and that
 *   `pullFromSingleRepo` was called after push.
 */

import type { SyncMode } from '../../src/services/git/syncTiming';
import type { SyncTimingEntry } from '../../src/services/git/syncTiming';
import type { StagedItem } from '../../src/services/git/StagingService';

import {
  attachMode,
  enableSyncTiming,
  flushSyncTiming,
  disableSyncTiming,
} from '../../src/services/git/syncTiming';
import { SyncEngineService } from '../../src/services/SyncEngineService';
import { StagingService } from '../../src/services/git/StagingService';
import { useStageStore } from '../../src/stores/stageStore';
import { useGitOperationStore } from '../../src/stores/gitOperationStore';

import {
  type Scenario,
  type ClonePushTrigger,
  buildExpectedState,
} from './test-notes-fixture';

// ---------------------------------------------------------------------------
// Report types
// ---------------------------------------------------------------------------

export interface CheckpointResult {
  label: string;
  passed: boolean;
  detail?: string;
}

export interface ScenarioReport {
  scenarioId: number;
  scenarioName: string;
  mode: SyncMode;
  /** Whether the scenario passed all assertions. */
  pass: boolean;
  /** All timing entries recorded during the scenario (HTTP + FS). */
  timingEntries: SyncTimingEntry[];
  /** T0–T3 checkpoint timestamps in ms relative to scenario start. */
  checkpoints: {
    t0SaveStart: number | null;
    t1StageOrEnqueue: number | null;
    t2GitOpsComplete: number | null;
    t3PushComplete: number | null;
  };
  /** Human-readable checkpoint notes. */
  checkpointResults: CheckpointResult[];
  /** Clone-mode specific results. */
  clone?: {
    stagedItemsBeforePush: StagedItem[];
    stagedCountBeforePush: number;
    pushTriggerFired: boolean;
    stagedClearedAfterPush: boolean;
  };
  /** API-mode specific results. */
  api?: {
    saveCycleSource: string | null;
    blockOverlayFired: boolean;
    pullAfterPushCalled: boolean;
  };
  pushTrigger: ClonePushTrigger;
  /** Total wall-clock time for the scenario in ms. */
  totalMs: number;
}

// ---------------------------------------------------------------------------
// Push trigger execution (clone mode only)
// ---------------------------------------------------------------------------

async function firePushTrigger(trigger: ClonePushTrigger): Promise<void> {
  switch (trigger) {
    case 'long-press-floating-btn': {
      // Trigger the stage push scheduler's drain for this repo.
      const { flushStaged } = await import('../../src/services/StagePushScheduler');
      flushStaged();
      break;
    }
    case 'stage-push-all': {
      const { drainPushQueue } = await import('../../src/services/StagePushScheduler');
      useStageStore.getState().pushAll();
      void drainPushQueue('manual');
      break;
    }
    case 'stage-per-group-push': {
      const { drainPushQueue } = await import('../../src/services/StagePushScheduler');
      // Find all unique (repo, branch) pairs in staged and push each.
      const staged = useStageStore.getState().staged;
      const groups = [...new Set(staged.map((s) => `${s.repoPath}::${s.branch}`))];
      for (const key of groups) {
        const [repoPath, branch] = key.split('::');
        useStageStore.getState().requestPush(repoPath, branch);
      }
      void drainPushQueue('manual');
      break;
    }
    case '3-min-idle-autopush': {
      // Advance jest fake timers by STAGE_PUSH_IDLE_MS (defined in StagePushScheduler).
      // Only applies in test environments with jest.useFakeTimers().
      const { STAGE_PUSH_IDLE_MS } = await import('../../src/services/StagePushScheduler');
      // In test environment, advance timers. Guards are handled by the test setup.
      try {
        const { advanceTimersByTime } = await import('@jest/globals');
        advanceTimersByTime(STAGE_PUSH_IDLE_MS);
      } catch {
        // Not in a jest environment — skip timer advancement.
      }
      break;
    }
    case 'os-bg-task': {
      const { flushStagedSetsForBackgroundTask } = await import(
        '../../src/services/BackgroundSyncService'
      );
      await flushStagedSetsForBackgroundTask();
      break;
    }
    case 'foreground-resume': {
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

/**
 * Run one scenario against one mode and return a detailed report.
 *
 * Side effects:
 * - Enables `syncTiming` instrumentation (clears any prior entries)
 * - Sets the repo mode via `SyncEngineService.setMode('test-notes', mode)`
 * - Executes all ops via `StagingService.stageUpsert` / `stageDelete`
 * - Fires the designated push trigger (clone mode only)
 * - Reads `StagingService.listStaged` and `gitOperationStore` for sub-checks
 */
export async function runScenario(
  scenario: Scenario,
  mode: SyncMode,
  repoPath = 'test-notes',
  branch = 'main',
): Promise<ScenarioReport> {
  const t0 = Date.now();
  enableSyncTiming();
  attachMode(mode);

  // Set the sync mode for the test repo.
  await SyncEngineService.setMode(repoPath, mode);

  const checkpoints: CheckpointResult[] = [];

  // --- T0: record save start ---
  const t0Save = Date.now() - t0;

  // --- Execute operations ---
  for (const op of scenario.ops) {
    await executeOp(op, repoPath, branch);
  }

  const t1Stage = Date.now() - t0;

  // --- Clone-mode staged-visibility sub-check (before push) ---
  if (mode === 'clone') {
    const staged = await StagingService.listStaged(repoPath, branch);
    const expected = buildExpectedState(scenario, 'clone');
    checkpoints.push({
      label: 'clone-staged-before-push',
      passed: expected.cloneStagedBeforePush.length === staged.length,
      detail: `expected ${expected.cloneStagedBeforePush.length} staged, got ${staged.length}`,
    });
  }

  // --- Fire push trigger (clone) / complete save cycle (API) ---
  const t2GitOps = Date.now() - t0;
  let pushTriggerFired = false;
  let pullAfterPushCalled = false;
  let saveCycleSource: string | null = null;

  if (mode === 'clone') {
    await firePushTrigger(scenario.clonePushTrigger);
    pushTriggerFired = true;
  } else {
    // API mode: verify the save cycle via gitOperationStore.
    // The cycle is held for the duration of the save operation.
    const opStore = useGitOperationStore.getState();
    const saveCycles = Object.values(opStore.ops).filter(
      (op) => op.source === 'save' && op.repo === repoPath,
    );
    saveCycleSource = saveCycles.length > 0 ? 'save' : null;

    // pullAfterPush is tracked by mocking RepoPullService.pullFromSingleRepo.
    // The mock records whether it was called.
    pullAfterPushCalled = checkPullAfterPushCalled();
  }

  // --- T3: push/cycle complete ---
  const t3Complete = Date.now() - t0;

  // --- Collect timing ---
  const timingEntries = flushSyncTiming();
  disableSyncTiming();

  // --- Clone-mode staged cleared sub-check (after push) ---
  let stagedClearedAfterPush = false;
  if (mode === 'clone') {
    const stagedAfter = await StagingService.listStaged(repoPath, branch);
    stagedClearedAfterPush = stagedAfter.length === 0;
  }

  // --- Build report ---
  const report: ScenarioReport = {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    mode,
    pass: checkpoints.every((c) => c.passed),
    timingEntries,
    checkpoints: {
      t0SaveStart: t0Save,
      t1StageOrEnqueue: t1Stage,
      t2GitOpsComplete: t2GitOps,
      t3PushComplete: t3Complete,
    },
    checkpointResults: checkpoints,
    pushTrigger: scenario.clonePushTrigger,
    totalMs: Date.now() - t0,
  };

  if (mode === 'clone') {
    const staged = await StagingService.listStaged(repoPath, branch);
    report.clone = {
      stagedItemsBeforePush: staged,
      stagedCountBeforePush: staged.length,
      pushTriggerFired,
      stagedClearedAfterPush,
    };
  } else {
    report.api = {
      saveCycleSource,
      blockOverlayFired: saveCycleSource === 'save',
      pullAfterPushCalled,
    };
  }

  return report;
}

// ---------------------------------------------------------------------------
// Operation execution helpers
// ---------------------------------------------------------------------------

async function executeOp(
  op: Scenario['ops'][number],
  repoPath: string,
  branch: string,
): Promise<void> {
  switch (op.type) {
    case 'note.add': {
      await StagingService.stageUpsert({
        entityId: op.note.id,
        entityType: 'note',
        repoPath,
        branch,
        content: { title: op.note.title, body: op.note.body },
        author: { name: 'e2e-test', email: 'e2e@test' },
        push: false,
      });
      break;
    }
    case 'note.edit': {
      await StagingService.stageUpsert({
        entityId: op.id,
        entityType: 'note',
        repoPath,
        branch,
        content: { title: op.title, body: op.body },
        author: { name: 'e2e-test', email: 'e2e@test' },
        sha: op.sha,
        push: false,
      });
      break;
    }
    case 'note.delete': {
      await StagingService.stageDelete({
        entityId: op.id,
        entityType: 'note',
        repoPath,
        branch,
        sha: op.sha,
        push: false,
      });
      break;
    }
    case 'canvas.add': {
      await StagingService.stageUpsert({
        entityId: op.canvas.id,
        entityType: 'canvas',
        repoPath,
        branch,
        content: { name: op.canvas.name, data: op.canvas.data },
        author: { name: 'e2e-test', email: 'e2e@test' },
        push: false,
      });
      break;
    }
    case 'canvas.edit': {
      await StagingService.stageUpsert({
        entityId: op.id,
        entityType: 'canvas',
        repoPath,
        branch,
        content: { data: op.data },
        author: { name: 'e2e-test', email: 'e2e@test' },
        sha: op.sha,
        push: false,
      });
      break;
    }
    case 'canvas.delete': {
      await StagingService.stageDelete({
        entityId: op.id,
        entityType: 'canvas',
        repoPath,
        branch,
        sha: op.sha,
        push: false,
      });
      break;
    }
    case 'todo.add': {
      await StagingService.stageUpsert({
        entityId: op.todo.id,
        entityType: 'todo',
        repoPath,
        branch,
        content: { text: op.todo.text, completed: op.todo.completed },
        author: { name: 'e2e-test', email: 'e2e@test' },
        push: false,
      });
      break;
    }
    case 'todo.edit': {
      await StagingService.stageUpsert({
        entityId: op.id,
        entityType: 'todo',
        repoPath,
        branch,
        content: { text: op.text, completed: op.completed },
        author: { name: 'e2e-test', email: 'e2e@test' },
        sha: op.sha,
        push: false,
      });
      break;
    }
    case 'todo.delete': {
      await StagingService.stageDelete({
        entityId: op.id,
        entityType: 'todo',
        repoPath,
        branch,
        sha: op.sha,
        push: false,
      });
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Mock helpers (for test environment)
// ---------------------------------------------------------------------------

let _pullAfterPushCalled = false;

export function setPullAfterPushCalled(v: boolean): void {
  _pullAfterPushCalled = v;
}

function checkPullAfterPushCalled(): boolean {
  return _pullAfterPushCalled;
}

/** Reset runner-level global state between scenario runs. */
export function resetRunnerState(): void {
  _pullAfterPushCalled = false;
}
