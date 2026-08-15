/**
 * Canonical branch-resolution entry point for the sync-write paths
 * (NoteSyncQueueService enqueue + note/todo/canvas GitHub sync services).
 *
 * Resolution order (implemented in `branchResolver`):
 *   1. Explicit branch from the caller — short-circuits with NO network
 *      or filesystem access.
 *   2. Session cache → local clone HEAD (clone-mode repos).
 *   3. Host default-branch lookup (GitHub API `default_branch`).
 *   4. Hard fallback 'main'.
 *
 * Enqueueing a mutation with the RESOLVED branch (instead of the raw,
 * possibly-undefined caller hint) keeps the delete-tombstone key, the
 * drain group key, and the clone-mode coalesced push all targeting the
 * same branch the pull side resolves.
 */
export { resolveBranch } from './branchResolver';
