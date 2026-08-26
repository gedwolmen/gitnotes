/*!
 * Log/history operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{Repository, Sort};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn log(
    repo_path: &str,
    max_count: Option<usize>,
) -> Result<Vec<LogEntry>, GitError> {
    let repo = Repository::open(Path::new(repo_path))
        .map_err(|e| map_git_error(e))?;

    let mut revwalk = repo.revwalk().map_err(|e| map_git_error(e))?;
    revwalk.push_head().map_err(|e| map_git_error(e))?;
    revwalk.set_sorting(Sort::TIME | Sort::TOPOLOGICAL);

    let limit = max_count.unwrap_or(100);
    let mut entries = Vec::with_capacity(limit);

    for (i, oid_result) in revwalk.enumerate() {
        if i >= limit {
            break;
        }
        let oid = oid_result.map_err(|e| map_git_error(e))?;
        let commit = repo.find_commit(oid).map_err(|e| map_git_error(e))?;

        entries.push(LogEntry {
            oid: oid.to_string(),
            message: commit.message().unwrap_or("").to_string(),
            author_name: commit.author().name().unwrap_or("").to_string(),
            author_email: commit.author().email().unwrap_or("").to_string(),
            time_secs: commit.time().seconds(),
            time_offset: commit.time().offset_minutes(),
        });
    }

    Ok(entries)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub oid: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub time_secs: i64,
    pub time_offset: i32,
}
