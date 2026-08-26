/*!
 * Branch management — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::{BranchType, Repository};
use std::path::Path;

pub fn list_branches(repo_path: &str) -> Result<Vec<BranchEntry>, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut branches = Vec::new();

    for branch_result in repo
        .branches(Some(BranchType::Local))
        .map_err(map_git_error)?
    {
        let (branch, _) = branch_result.map_err(map_git_error)?;
        let name = branch
            .name()
            .map_err(map_git_error)?
            .unwrap_or("")
            .to_string();
        let oid = branch.get().target().map(|o| o.to_string());
        let is_head = branch.is_head();
        branches.push(BranchEntry {
            name,
            oid,
            is_current: is_head,
            is_remote: false,
        });
    }

    Ok(branches)
}

pub fn create_branch(
    repo_path: &str,
    branch_name: &str,
    commit_oid: &str,
) -> Result<BranchEntry, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let commit_oid_val = repo
        .revparse_single(commit_oid)
        .map_err(map_git_error)?
        .id();
    let commit = repo
        .find_commit(commit_oid_val)
        .map_err(map_git_error)?;

    repo.branch(branch_name, &commit, false)
        .map_err(map_git_error)?;

    Ok(BranchEntry {
        name: branch_name.to_string(),
        oid: Some(commit_oid.to_string()),
        is_current: false,
        is_remote: false,
    })
}

pub fn checkout_branch(repo_path: &str, branch_name: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(map_git_error)?;

    let commit = branch
        .get()
        .peel_to_commit()
        .map_err(map_git_error)?;

    let mut opts = git2::build::CheckoutBuilder::new();
    opts.force();

    repo.checkout_tree(commit.as_object(), Some(&mut opts))
        .map_err(map_git_error)?;

    repo.set_head(&format!("refs/heads/{}", branch_name))
        .map_err(map_git_error)?;

    Ok(())
}

pub fn delete_branch(repo_path: &str, branch_name: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(map_git_error)?;

    branch.delete().map_err(map_git_error)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchEntry {
    pub name: String,
    pub oid: Option<String>,
    pub is_current: bool,
    pub is_remote: bool,
}
