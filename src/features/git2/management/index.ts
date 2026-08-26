/**
 * Git2 management module — branch, remote, and tag management screens and stores.
 *
 * All operations use Git2Client (native git2-rs) — no isomorphic-git or old GitService.
 *
 * GPL-3.0 derivative of GitSync.
 */

// Screens
export { BranchManagerScreen } from './BranchManagerScreen';
export { RemoteManagerScreen } from './RemoteManagerScreen';
export { TagManagerScreen } from './TagManagerScreen';

// Stores
export { useBranchStore } from './branchStore';
export type { BranchState } from './branchStore';

export { useRemoteStore } from './remoteStore';
export type { RemoteState, RemoteInfo } from './remoteStore';

export { useTagStore, TAG_OPERATIONS_AVAILABLE } from './tagStore';
export type { TagState, TagEntry } from './tagStore';
