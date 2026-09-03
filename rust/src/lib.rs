//! GitNotes native Git engine.
//!
//! Pure-Rust git operations on top of `git2` (libgit2, vendored). The `api`
//! module is the UniFFI-exported facade (bound by the host Expo module);
//! `engine` holds the pure git2 logic.

pub mod api;
pub mod engine;

uniffi::setup_scaffolding!();

/// Stable engine identifier surfaced to host apps.
pub const ENGINE_NAME: &str = "gitnotes-git2";

/// Crate version, surfaced through the API facade.
pub fn version() -> &'static str {
    env!("CARGO_PKG_VERSION")
}
