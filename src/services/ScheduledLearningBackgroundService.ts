import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { ScheduledLearningService } from './ScheduledLearningService';
import { useScheduledLearningStore } from '../stores/scheduledLearningStore';

const TASK_NAME = 'scheduled-learning-check';

let taskRegistered = false;

TaskManager.defineTask(TASK_NAME, async () => {
  try {
    const items = useScheduledLearningStore.getState().items;
    for (const item of items) {
      if (item.isEnabled) {
        await ScheduledLearningService.generateAndCreateNote(item);
      }
    }
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch (error) {
    console.warn('[ScheduledLearningBackground] task failed:', error);
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function startScheduledLearningBackgroundTask(): Promise<void> {
  if (taskRegistered) return;
  try {
    await BackgroundTask.registerTaskAsync(TASK_NAME, {
      minimumInterval: 60 * 60,
    });
    taskRegistered = true;
  } catch (error) {
    console.warn('[ScheduledLearningBackground] registration unavailable:', error);
  }
}

export async function stopScheduledLearningBackgroundTask(): Promise<void> {
  if (!taskRegistered) return;
  try {
    await BackgroundTask.unregisterTaskAsync(TASK_NAME);
  } catch (error) {
    console.warn('[ScheduledLearningBackground] failed to unregister:', error);
  }
  taskRegistered = false;
}

export function isScheduledLearningBackgroundTaskRegistered(): boolean {
  return taskRegistered;
}