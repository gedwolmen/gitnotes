/*!
 * Protocol types — versioned serde tagged enums.
 *
 * GPL-3.0 derivative of GitSync.
 */

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase", rename_all = "camelCase")]
pub enum GitProgress {
    Clone { bytes: u64, total: Option<u64> },
    Fetch { remote: String, refs: Vec<String> },
    Push { remote: String, refs: Vec<String> },
    Merge { branch: String },
}

pub const PROTOCOL_VERSION: &str = "1";
