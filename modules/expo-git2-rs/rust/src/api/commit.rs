/*!
 * Stage and commit operations — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{IndexAddOption, Repository, Signature};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn stage_file(
    repo_path: &str,
    file_path: &str,
) -> Result<StageResult, GitError> {
    let repo = Repository::open(Path::new(repo_path))
        .map_err(|e| map_git_error(e))?;

    let mut index = repo.index().map_err(|e| map_git_error(e))?;
    index.add_all([file_path], IndexAddOption::DEFAULT, None)
        .map_err(|e| map_git_error(e))?;
    index.write().map_err(|e| map_git_error(e))?;

    Ok(StageResult {
        path: file_path.to_string(),
        staged: true,
    })
}

pub fn commit(
    repo_path: &str,
    message: &str,
    author_name: &str,
    author_email: &str,
) -> Result<CommitResult, GitError> {
    let repo = Repository::open(Path::new(repo_path))
        .map_err(|e| map_git_error(e))?;

    let head = repo.head().map_err(|e| map_git_error(e))?;
    let head_oid = head.peel_to_commit().map_err(|e| map_git_error(e))?.id();

    let mut index = repo.index().map_err(|e| map_git_error(e))?;
    let tree_id = index.write_tree().map_err(|e| map_git_error(e))?;
    let tree = repo.find_tree(tree_id).map_err(|e| map_git_error(e))?;

    let sig = Signature::now(author_name, author_email)
        .map_err(|e| map_git_error(e))?;

    let parent = repo.find_commit(head_oid).map_err(|e| map_git_error(e))?;

    let oid = repo.commit(
        Some("HEAD"),
        &sig,
        &sig,
        message,
        &tree,
        &[&parent],
    ).map_err(|e| map_git_error(e))?;

    index.clear().map_err(|e| map_git_error(e))?;
    index.write().map_err(|e| map_git_error(e))?;

    Ok(CommitResult {
        oid: oid.to_string(),
        message: message.to_string(),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageResult {
    pub path: String,
    pub staged: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitResult {
    pub oid: String,
    pub message: String,
}
