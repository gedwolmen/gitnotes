//! Typed errors surfaced across the engine and API facade.

use thiserror::Error;

/// Unified engine error type.
///
/// `git2` errors are the primary source (network, auth, conflicts,
/// non-fast-forward pushes, corruption). Repository-local variants stay
/// typo-safe and map to host-app dialogs.
#[derive(Debug, Error)]
pub enum EngineError {
    #[error("git error: {0}")]
    Git(#[from] git2::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("not a git repository: {0}")]
    NotARepository(String),

    #[error("repository is busy (another operation holds the lock): {0}")]
    Busy(String),

    #[error("invalid input: {0}")]
    Invalid(String),

    #[error("operation not supported: {0}")]
    Unsupported(String),

    #[error("op failed: {0}")]
    Other(String),
}

impl EngineError {
    /// Best-effort classification of libgit2 failure codes that commonly
    /// accompany a corrupted repository (missing index, bad objects, corrupt
    /// loose objects). Used by the corruption-repair path.
    pub fn is_corruption_error(&self) -> bool {
        match self {
            EngineError::Git(e) => matches!(
                e.class(),
                git2::ErrorClass::Index
                    | git2::ErrorClass::Object
                    | git2::ErrorClass::Odb
                    | git2::ErrorClass::Reference
                    | git2::ErrorClass::Repository
            ),
            _ => false,
        }
    }
}

/// Convenience alias for the `git2` error class in match arms.
pub type Result<T> = std::result::Result<T, EngineError>;
