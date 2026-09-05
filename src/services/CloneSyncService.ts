/**
 * Re-export shim: the real implementation lives in `syncStubs.ts`
 * (stubbed after the sync-service consolidation). Kept so existing
 * imports and jest.mock() paths of `services/CloneSyncService` keep working.
 */
export { CloneSyncService } from './syncStubs';
export type { CloneSyncServiceSaveParams, SaveResult } from './syncStubs';
