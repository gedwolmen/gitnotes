/*!
 * Stage and commit operations — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{IndexAddOption, Repository, Signature};
use std::path::Path;

pub fn stage_file(repo_path: &str, file_path: &str) -> Result<StageResult, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut index = repo.index().map_err(map_git_error)?;
    index
        .add_all([file_path], IndexAddOption::DEFAULT, None)
        .map_err(map_git_error)?;
    index.write().map_err(map_git_error)?;

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
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let head = repo.head().map_err(map_git_error)?;
    let head_oid = head.peel_to_commit().map_err(map_git_error)?.id();

    let mut index = repo.index().map_err(map_git_error)?;
    let tree_id = index.write_tree().map_err(map_git_error)?;
    let tree = repo.find_tree(tree_id).map_err(map_git_error)?;

    let sig = Signature::now(author_name, author_email).map_err(map_git_error)?;

    let parent = repo.find_commit(head_oid).map_err(map_git_error)?;

    let oid = repo
        .commit(Some("HEAD"), &sig, &sig, message, &tree, &[&parent])
        .map_err(map_git_error)?;

    index.clear().map_err(map_git_error)?;
    index.write().map_err(map_git_error)?;

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
