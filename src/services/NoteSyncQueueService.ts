/**
 * Re-export of the NoteSyncQueueService from the git subdirectory.
 * The real implementation is in ./git/NoteSyncQueueService.ts.
 */
export {
  NoteSyncQueueService,
  type MutationSucceededEvent,
  type DroppedMutationEvent,
  type QueueItem,
  type MutationStatus,
  type EntityType,
} from './git/NoteSyncQueueService';

export type { QueuedMutation, NoteDeleteParams } from './cloneSyncServiceImpl';
