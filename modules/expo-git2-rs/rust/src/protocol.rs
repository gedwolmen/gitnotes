/*!
 * Protocol types — versioned serde tagged enums.
 *
 * GPL-3.0 derivative of GitSync.
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

use serde::{Deserialize, Serialize};

/// Protocol version — must match between FFI peers.
pub const PROTOCOL_VERSION: &str = "1";

/// Progress event emitted during long-running operations.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum GitProgress {
    CloneReceiving {
        bytes: u64,
        total: Option<u64>,
        flavor: Option<String>,
    },
    CloneResolving {
        bytes: u64,
        total: u64,
    },
    CloneCheckingOut {
        current: u32,
        total: u32,
    },
    CloneComplete {
        path: String,
        head: String,
    },
    FetchConnecting {
        remote: String,
    },
    FetchReceivingRefs {
        remote: String,
        refs: Vec<String>,
    },
    FetchReceivingPack {
        bytes: u64,
        total: Option<u64>,
    },
    FetchComplete {
        remote: String,
        updated: Vec<String>,
    },
    PushCommunicating {
        remote: String,
    },
    PushUpdatingRef {
        ref_name: String,
        src: String,
        dst: String,
    },
    PushComplete {
        remote: String,
        updated: Vec<String>,
    },
    Checkout {
        current: u32,
        total: u32,
    },
    MergeAnalysis {
        branch: String,
        analysis: String,
    },
    MergeConflicts {
        files: Vec<String>,
    },
}

/// Credential kinds supported.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum CredKind {
    #[default]
    UserpassPlaintext,
    SshKey,
    SshCustom,
    Default,
}

/// A single credential to be provided via callback.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CredRequest {
    Userpass {
        username: String,
        token: Option<String>,
    },
    SshKey {
        username: String,
        public_key: Option<String>,
    },
}
