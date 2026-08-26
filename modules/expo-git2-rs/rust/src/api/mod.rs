/*!
 * Git operation API — serializable request/result types.
 *
 * All operations follow a versioned serde tagged protocol:
 * GitOperationRequest → GitOperationResult or GitError
 *
 * GPL-3.0 derivative of GitSync.
 */

pub mod git_manager;

pub use git_manager::{git_manager_version, git_manager_execute, GitOperationRequest, GitOperationResult};
