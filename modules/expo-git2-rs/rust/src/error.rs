/*!
 * Error types for native git2-rs operations.
 *
 * GPL-3.0 derivative of GitSync.
 */

use thiserror::Error;

#[derive(Error, Debug)]
pub enum GitError {
    #[error("Repository not found at path: {path}")]
    RepositoryNotFound { path: String },

    #[error("Authentication failed: {reason}")]
    AuthenticationFailed { reason: String },

    #[error("Network error: {reason}")]
    NetworkError { reason: String },

    #[error("Merge conflict: {reason}")]
    MergeConflict { reason: String },

    #[error("Invalid operation: {reason}")]
    InvalidOperation { reason: String },

    #[error("Native internal error: {reason}")]
    InternalError { reason: String },

    #[error("Cancelled by user")]
    Cancelled,
}
