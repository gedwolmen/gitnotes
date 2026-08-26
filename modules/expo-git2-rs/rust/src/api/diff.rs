/*!
 * Diff operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{DiffOptions, Repository};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn diff_file(repo_path: &str, commit_oid: &str, file_path: &str) -> Result<String, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let oid = repo
        .revparse_single(commit_oid)
        .map_err(map_git_error)?
        .id();
    let commit = repo.find_commit(oid).map_err(map_git_error)?;

    let tree = commit.tree().map_err(map_git_error)?;

    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(map_git_error)?;
        Some(parent.tree().map_err(map_git_error)?)
    } else {
        None
    };

    let mut opts = DiffOptions::new();
    opts.pathspec(file_path);

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), Some(&mut opts))
        .map_err(map_git_error)?;

    let mut output = String::new();
    diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
        let prefix = match line.origin() {
            '+' => "+",
            '-' => "-",
            ' ' => " ",
            _ => "",
        };
        let content = std::str::from_utf8(line.content()).unwrap_or("");
        output.push_str(prefix);
        output.push_str(content);
        true
    })
    .map_err(map_git_error)?;

    Ok(output)
}

pub fn diff_commit(repo_path: &str, commit_oid: &str) -> Result<Vec<DiffFileEntry>, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let oid = repo
        .revparse_single(commit_oid)
        .map_err(map_git_error)?
        .id();
    let commit = repo.find_commit(oid).map_err(map_git_error)?;

    let tree = commit.tree().map_err(map_git_error)?;
    let parent_tree = if commit.parent_count() > 0 {
        let parent = commit.parent(0).map_err(map_git_error)?;
        Some(parent.tree().map_err(map_git_error)?)
    } else {
        None
    };

    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&tree), None)
        .map_err(map_git_error)?;

    let mut files = Vec::new();
    diff.print(git2::DiffFormat::Patch, |delta, _hunk, line| {
        if let Some(old_path) = delta.old_file().path() {
            if delta.status() == git2::Delta::Added || delta.status() == git2::Delta::Modified {
                files.push(DiffFileEntry {
                    path: old_path.to_string_lossy().into_owned(),
                    status: format!("{:?}", delta.status()),
                    content: std::str::from_utf8(line.content())
                        .unwrap_or("")
                        .to_string(),
                });
            }
        }
        true
    })
    .map_err(map_git_error)?;

    Ok(files)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffFileEntry {
    pub path: String,
    pub status: String,
    pub content: String,
}
