//! Stall detection + network timeout configuration.
//!
//! Ported from GitSync (git_manager.rs:2227): libgit2's low-speed abort wired
//! through the repo config, plus an application-level watchdog over the
//! transfer-progress callback that aborts when the received-byte count stops
//! advancing for `STALL_TIMEOUT_SECS`.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::Instant;

use git2::Repository;

/// libgit2 minimum download speed in bytes/second before aborting.
pub const LOW_SPEED_LIMIT: i32 = 1000;
/// Consecutive seconds under the low-speed limit before aborting.
pub const LOW_SPEED_TIME: i32 = 30;
/// Application-level stall timeout (no byte progress) in seconds.
pub const STALL_TIMEOUT_SECS: u64 = 30;

/// Configure `http.lowSpeedLimit` / `http.lowSpeedTime` so libgit2 itself
/// aborts transfers that stall below the threshold for the window.
pub fn configure_network_timeouts(repo: &Repository) {
    if let Ok(mut config) = repo.config() {
        let _ = config.set_i32("http.lowSpeedLimit", LOW_SPEED_LIMIT);
        let _ = config.set_i32("http.lowSpeedTime", LOW_SPEED_TIME);
    }
}

/// Watchdog that aborts a transfer when `received_bytes` stops advancing.
///
/// Wire into `RemoteCallbacks::transfer_progress`; returning `false` aborts
/// the underlying libgit2 transfer.
pub struct StallDetector {
    last_bytes: AtomicU64,
    last_progress_time: Mutex<Instant>,
    stall_timeout_secs: u64,
    stalled: AtomicBool,
}

impl StallDetector {
    pub fn new(stall_timeout_secs: u64) -> Self {
        Self {
            last_bytes: AtomicU64::new(0),
            last_progress_time: Mutex::new(Instant::now()),
            stall_timeout_secs,
            stalled: AtomicBool::new(false),
        }
    }

    /// Feed the current received-byte count. Returns `false` (abort the
    /// transfer) once no progress has occurred within the stall timeout.
    pub fn check(&self, received_bytes: u64) -> bool {
        let prev = self.last_bytes.swap(received_bytes, Ordering::Relaxed);
        if received_bytes > prev {
            *self.last_progress_time.lock().unwrap() = Instant::now();
            return true;
        }
        let elapsed = self.last_progress_time.lock().unwrap().elapsed().as_secs();
        if elapsed >= self.stall_timeout_secs {
            self.stalled.store(true, Ordering::Relaxed);
            return false;
        }
        true
    }

    /// Whether `check` ever flagged a stall (checked after a failed op to
    /// rewrite the generic transport error into a typed stall message).
    pub fn was_stalled(&self) -> bool {
        self.stalled.load(Ordering::Relaxed)
    }
}
