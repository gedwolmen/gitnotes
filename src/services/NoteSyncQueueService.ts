/**
 * Re-export of the NoteSyncQueueService stub (see ./cloneSyncServiceImpl).
 * The original queue service was removed; this module keeps the import path
 * alive for clone-mode mutation queueing call sites.
 */
export {
  NoteSyncQueueService,
  type DroppedMutationEvent,
  type MutationSucceededEvent,
  type NoteDeleteParams,
  type QueuedMutation,
} from './cloneSyncServiceImpl';
