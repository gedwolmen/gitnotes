import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { NoteSyncQueueService } from './NoteSyncQueueService';
import { pullAllFromRepos } from './RepoPullService';

const TASK_NAME = 'background-sync';
const MINIMUM_INTERVAL = 15 * 60;

let taskRegistered = false;

async function backgroundSyncTask(): Promise<BackgroundFetch.BackgroundFetchResult> {
  try {
    if (!GitHubService.isAuthenticated()) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    const repos = await StorageService.getSavedRepositories();
    if (repos.length === 0) {
      return BackgroundFetch.BackgroundFetchResult.NoData;
    }

    await NoteSyncQueueService.drain();
    await pullAllFromRepos();

    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    console.warn('[BackgroundSync] task failed:', error);
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
}

export async function startBackgroundSync(): Promise<void> {
  if (taskRegistered) return;

  if (!TaskManager.isTaskDefined(TASK_NAME)) {
    TaskManager.defineTask(TASK_NAME, backgroundSyncTask);
  }

  await BackgroundFetch.registerTaskAsync(TASK_NAME, {
    minimumInterval: MINIMUM_INTERVAL,
    stopOnTerminate: true,
    startOnBoot: false,
  });

  taskRegistered = true;
}

export async function stopBackgroundSync(): Promise<void> {
  if (!taskRegistered) return;

  try {
    await BackgroundFetch.unregisterTaskAsync(TASK_NAME);
  } catch (error) {
    console.warn('[BackgroundSync] failed to unregister:', error);
  }

  taskRegistered = false;
}

export function isBackgroundSyncRegistered(): boolean {
  return taskRegistered;
}
