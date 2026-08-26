/*!
 * expo-git2-rs — Native Git operations via git2-rs
 *
 * This library provides native Git operations for Expo/React Native iOS and Android.
 * It is a GPL-3.0 derivative of GitSync (https://github.com/ViscousPot/GitSync).
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 *
 * Architecture:
 * - Versioned serde request/result protocol across C FFI
 * - Per-repository serial operation lock
 * - Handles opened and dropped inside each request (never passed over FFI)
 * - 250ms progress event coalescing
 */

pub mod api;
pub mod error;
pub mod protocol;

pub use api::git_manager::git_manager_version;
pub use error::GitError;
pub use protocol::{GitOperationRequest, GitOperationResult, GitProgress};
