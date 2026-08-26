/*!
 * API modules — git operations via git2-rs.
 *
 * GPL-3.0 derivative of GitSync.
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

pub mod branch;
pub mod clone;
pub mod commit;
pub mod diff;
pub mod fetch;
pub mod log;
pub mod merge;
pub mod pull;
pub mod push;
pub mod remote;
pub mod status;
pub mod tag;

pub mod git_manager;
