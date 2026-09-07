/**
 * Re-export shim: the real implementation lives in `cloneSyncServiceImpl.ts`
 * (stubbed after the sync-service consolidation). Kept so existing
 * imports and jest.mock() paths of `services/CloneSyncService` keep working.
 */
export { CloneSyncService } from './cloneSyncServiceImpl';
export type { CloneSyncServiceSaveParams, SaveResult } from './cloneSyncServiceImpl';
