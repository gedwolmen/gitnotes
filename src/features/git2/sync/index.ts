/**
 * Git2 sync module — orchestration, conflict resolution, and settings.
 *
 * GPL-3.0 derivative of GitSync.
 */

// State machine and orchestration store
export {
  useSyncStore,
  type SyncPhase,
  type SyncMode,
  type SyncSettings,
  type ConflictEntry,
  type MergeDecision,
  type RepoSyncState,
} from './syncState';

// Screens
export { ConflictResolverScreen } from './ConflictResolverScreen';
export { SyncSettingsScreen } from './SyncSettingsScreen';
