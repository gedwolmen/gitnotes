/*!
 * Status operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{Repository, StatusOptions};
use std::path::Path;

pub fn status(repo_path: &str) -> Result<StatusResult, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true);

    let statuses = repo
        .statuses(Some(&mut opts))
        .map_err(map_git_error)?;

    let entries: Vec<StatusEntry> = statuses
        .iter()
        .map(|entry| {
            let path = entry.path().unwrap_or("").to_string();
            let s = entry.status();
            StatusEntry {
                path,
                is_new: s.is_index_new() || s.is_wt_new(),
                is_modified: s.is_index_modified() || s.is_wt_modified(),
                is_deleted: s.is_index_deleted() || s.is_wt_deleted(),
                is_renamed: s.is_index_renamed() || s.is_wt_renamed(),
                is_ignored: s.is_ignored(),
            }
        })
        .collect();

    Ok(StatusResult {
        repo_path: repo_path.to_string(),
        entries,
        is_clean: statuses.is_empty(),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusResult {
    pub repo_path: String,
    pub entries: Vec<StatusEntry>,
    pub is_clean: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusEntry {
    pub path: String,
    pub is_new: bool,
    pub is_modified: bool,
    pub is_deleted: bool,
    pub is_renamed: bool,
    pub is_ignored: bool,
}
