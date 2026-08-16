import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { NoteSyncQueueService } from './NoteSyncQueueService';
import { pullAllFromRepos } from './RepoPullService';
import { GitSyncGate } from './git/GitSyncGate';
import { StagingService } from './git/StagingService';
import { NotificationService } from './NotificationService';

const TASK_NAME = 'background-sync';

// OS time budgets make large pushes unreliable in the background; staged sets
// bigger than this wait for the foreground scheduler instead.
const STAGE_PUSH_MAX_FILES = 10;

let taskRegistered = false;

// Must live in module-global scope per expo-background-task docs: the OS may
// re-launch the app cold to run the task, and the bundle's top-level code is
// what re-registers the handler.
TaskManager.defineTask(TASK_NAME, async () => {
  try {
    if (!GitHubService.isAuthenticated()) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    const repos = await StorageService.getSavedRepositories();
    if (repos.length === 0) {
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    // ONE cycle spans the drain+pull pair; drain() sees the held cycle and
    // skips its own acquisition (no self-deadlock).
    const releaseCycle = await GitSyncGate.acquireCycle();
    try {
      await NoteSyncQueueService.drain();
      const result = await pullAllFromRepos();
      await flushStagedSetsForBackgroundTask();

      const pulled = result.notes + result.canvases + result.todos + result.templates;
      if (pulled > 0) {
        try {
          await NotificationService.schedulePushProgress(
            'Synced with origin',
            `Pulled ${pulled} changed item(s)`,
            { kind: 'background-pull' },
          );
        } catch (error) {
          console.warn('[BackgroundSync] push-progress notification failed:', error);
        }
      }
    } finally {
      releaseCycle();
    }

    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[BackgroundSync] task failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/**
 * Push staged changes in the background cycle. Only (repo, branch) sets with
 * at most `STAGE_PUSH_MAX_FILES` files are pushed here — bigger sets wait for
 * the foreground scheduler. Failures are logged only; the failure-notification
 * surface is owned by the foreground scheduler (todo 9).
 */
export async function flushStagedSetsForBackgroundTask(): Promise<void> {
  const staged = await StagingService.listStaged();
  const counts = new Map<string, { repoPath: string; branch: string; files: number }>();
  for (const item of staged) {
    const key = `${item.repoPath}\n${item.branch}`;
    const entry = counts.get(key);
    if (entry) {
      entry.files += 1;
    } else {
      counts.set(key, { repoPath: item.repoPath, branch: item.branch, files: 1 });
    }
  }
  for (const { repoPath, branch, files } of counts.values()) {
    if (files > STAGE_PUSH_MAX_FILES) continue;
    const result = await StagingService.pushStaged(repoPath, branch);
    if (!result.success) {
      console.warn(`[BackgroundSync] staged push failed for ${repoPath}@${branch}:`, result.error);
    }
  }
}

export async function startBackgroundSync(): Promise<void> {
  if (taskRegistered) return;

  // Throws on builds without the BGTaskScheduler Info.plist entries (Expo Go,
  // dev clients built before the keys were added). Swallow so app boot is not
  // blocked; the periodic sync just won't run in those environments.
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME);
    taskRegistered = true;
  } catch (error) {
    console.warn('[BackgroundSync] registration unavailable in this build:', error);
  }
}

export async function stopBackgroundSync(): Promise<void> {
  if (!taskRegistered) return;

  try {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  } catch (error) {
    console.warn('[BackgroundSync] failed to unregister:', error);
  }

  taskRegistered = false;
}

export function isBackgroundSyncRegistered(): boolean {
  return taskRegistered;
}
