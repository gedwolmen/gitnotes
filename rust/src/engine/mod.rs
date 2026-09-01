//! Pure git2 engine logic: no framework, no FFI.
//!
//! Modules:
//! - `error`: unified typed errors (incl. corruption classification)
//! - `lock`: flock-based per-repo operation lock (ported from GitSync)
//! - `credentials`: credential-callback construction from `CredentialSource`
//! - `timeout`: stall detection + network timeout configuration
//! - `keys`: ed25519 keypair generation
//! - `ops`: open/status/diff/stage/commit/log/branch/remote (local ops)
//! - `ops_conflict`: conflict stage-blob reads + mark-resolved
//! - `ops_remote`: clone/fetch/pull/push with progress
//! - `ops_repair`: corruption repair + re-clone fallback

pub mod credentials;
pub mod error;
pub mod keys;
pub mod lock;
pub mod ops;
pub mod ops_conflict;
pub mod ops_remote;
pub mod ops_repair;
pub mod timeout;

pub use error::{EngineError, Result};
