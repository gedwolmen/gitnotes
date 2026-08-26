/*!
 * Error types for native git2-rs operations.
 *
 * GPL-3.0 derivative of GitSync (https://github.com/ViscousPot/GitSync).
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

use thiserror::Error;

#[derive(Error, Debug, Clone)]
pub enum GitError {
    #[error("Repository not found at path: {path}")]
    RepositoryNotFound { path: String },

    #[error("Authentication failed: {reason}")]
    AuthenticationFailed { reason: String },

    #[error("Network error: {reason}")]
    NetworkError { reason: String },

    #[error("Merge conflict: {conflicts:?}")]
    MergeConflict { conflicts: Vec<String> },

    #[error("Invalid operation: {reason}")]
    InvalidOperation { reason: String },

    #[error("Not a git repository: {path}")]
    NotARepository { path: String },

    #[error("Ref not found: {ref_name}")]
    RefNotFound { ref_name: String },

    #[error("Path not found in tree: {path}")]
    PathNotFound { path: String },

    #[error("Nothing to commit")]
    NothingToCommit,

    #[error("Cancelled by user")]
    Cancelled,

    #[error("Lock busy: {repo_path} — concurrent operation in progress")]
    LockBusy { repo_path: String },

    #[error("Invalid remote URL: {url}")]
    InvalidRemoteUrl { url: String },

    #[error("Detached HEAD state — cannot perform branch operation")]
    DetachedHead,

    #[error("Branch already exists: {branch_name}")]
    BranchAlreadyExists { branch_name: String },

    #[error("Remote operation rejected: {reason}")]
    RemoteRejected { reason: String },

    #[error("Native internal error: {reason}")]
    InternalError { reason: String },
}

impl GitError {
    /// Serialize this error as a JSON string for FFI return.
    pub fn to_json(&self) -> String {
        match self {
            GitError::RepositoryNotFound { path } => {
                serde_json::json!({ "kind": "repository_not_found", "path": path }).to_string()
            }
            GitError::AuthenticationFailed { reason } => {
                serde_json::json!({ "kind": "authentication_failed", "reason": reason }).to_string()
            }
            GitError::NetworkError { reason } => {
                serde_json::json!({ "kind": "network_error", "reason": reason }).to_string()
            }
            GitError::MergeConflict { conflicts } => {
                serde_json::json!({ "kind": "merge_conflict", "conflicts": conflicts }).to_string()
            }
            GitError::InvalidOperation { reason } => {
                serde_json::json!({ "kind": "invalid_operation", "reason": reason }).to_string()
            }
            GitError::NotARepository { path } => {
                serde_json::json!({ "kind": "not_a_repository", "path": path }).to_string()
            }
            GitError::RefNotFound { ref_name } => {
                serde_json::json!({ "kind": "ref_not_found", "ref_name": ref_name }).to_string()
            }
            GitError::PathNotFound { path } => {
                serde_json::json!({ "kind": "path_not_found", "path": path }).to_string()
            }
            GitError::NothingToCommit => {
                serde_json::json!({ "kind": "nothing_to_commit" }).to_string()
            }
            GitError::Cancelled => {
                serde_json::json!({ "kind": "cancelled" }).to_string()
            }
            GitError::LockBusy { repo_path } => {
                serde_json::json!({ "kind": "lock_busy", "repo_path": repo_path }).to_string()
            }
            GitError::InvalidRemoteUrl { url } => {
                serde_json::json!({ "kind": "invalid_remote_url", "url": url }).to_string()
            }
            GitError::DetachedHead => {
                serde_json::json!({ "kind": "detached_head" }).to_string()
            }
            GitError::BranchAlreadyExists { branch_name } => {
                serde_json::json!({ "kind": "branch_already_exists", "branch_name": branch_name }).to_string()
            }
            GitError::RemoteRejected { reason } => {
                serde_json::json!({ "kind": "remote_rejected", "reason": reason }).to_string()
            }
            GitError::InternalError { reason } => {
                serde_json::json!({ "kind": "internal_error", "reason": reason }).to_string()
            }
        }
    }
}
