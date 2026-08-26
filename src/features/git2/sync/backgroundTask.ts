/**
 * Git2BackgroundTask — OS background task registration and handler.
 *
 * Defines the `Git2BackgroundSync` task at MODULE SCOPE (global scope).
 * Per expo-task-manager docs: defineTask must be called outside React components
 * because the background OS process that triggers the task has no React tree.
 *
 * Task is registered on app start via registerBackgroundSyncTask() and
 * re-registered when sync settings change (interval, mode).
 *
 * GPL-3.0 derivative of GitSync.
 */

import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { useSyncStore } from './syncState';

export const GIT2_BACKGROUND_TASK_NAME = 'Git2BackgroundSync';

/**
 * Called at app startup to define + register the background task.
 * Safe to call multiple times — TaskManager.defineTask is idempotent per name.
 */
export async function registerBackgroundSyncTask(): Promise<void> {
  const { settings } = useSyncStore.getState();

  // Define task at module scope so the background runtime can find it
  TaskManager.defineTask(GIT2_BACKGROUND_TASK_NAME, async () => {
    try {
      const result = await useSyncStore.getState().runBackgroundSync();

      if (result.changed) {
        // TODO: Wire NotificationService.schedulePushProgress when available
        // NotificationService.schedulePushProgress(
        //   'Synced with origin',
        //   `Updated ${result.changed} file(s)`,
        //   { kind: 'background-pull' },
        // );
      }

      return BackgroundTask.BackgroundTaskResult.Success;
    } catch (err) {
      console.error('[Git2BackgroundTask] sync failed:', err);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  // Register with the OS scheduler
  // minimumInterval is in seconds; settings.scheduledIntervalMinutes * 60
  try {
    await BackgroundTask.registerTaskAsync(GIT2_BACKGROUND_TASK_NAME, {
      minimumInterval: settings.scheduledIntervalMinutes * 60,
    });
  } catch (err) {
    // Registration can fail if permissions not granted or task already registered
    console.warn('[Git2BackgroundTask] registerTaskAsync failed:', err);
  }
}

/**
 * Unregister the background task (e.g., when switching from scheduled to manual mode).
 */
export async function unregisterBackgroundSyncTask(): Promise<void> {
  try {
    await TaskManager.unregisterTaskAsync(GIT2_BACKGROUND_TASK_NAME);
  } catch {
    // Task may not be registered yet — ignore
  }
}

/**
 * Re-register with a new interval (called when user changes schedule in SyncSettingsScreen).
 */
export async function rescheduleBackgroundSyncTask(
  intervalMinutes: number,
): Promise<void> {
  await unregisterBackgroundSyncTask();

  await BackgroundTask.registerTaskAsync(GIT2_BACKGROUND_TASK_NAME, {
    minimumInterval: intervalMinutes * 60,
  });
}
