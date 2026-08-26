/**
 * Typed request/result/protocol types for native git2-rs operations.
 *
 * These will be expanded in Todo 7 to cover all Git operations.
 *
 * GPL-3.0 derivative of GitSync.
 */

export type GitOperationRequest = Record<string, unknown>;
export type GitOperationResult = Record<string, unknown>;
export type GitProgress = Record<string, unknown>;
export type GitError = Record<string, unknown>;
