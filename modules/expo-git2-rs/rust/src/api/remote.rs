/*!
 * Remote management — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::Repository;
use std::path::Path;

pub fn list_remotes(repo_path: &str) -> Result<Vec<String>, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let remotes = repo.remotes().map_err(map_git_error)?;
    let mut result = Vec::new();
    for i in 0..remotes.len() {
        if let Ok(Some(name)) = remotes.get(i) {
            result.push(name.to_string());
        }
    }
    Ok(result)
}

pub fn add_remote(repo_path: &str, name: &str, url: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    repo.remote(name, url).map_err(map_git_error)?;
    Ok(())
}

pub fn remove_remote(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    repo.remote_delete(name).map_err(map_git_error)?;
    Ok(())
}

pub fn set_remote_url(repo_path: &str, name: &str, url: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    // git2 Remote doesn't have set_url - delete and re-create
    if repo.find_remote(name).is_ok() {
        repo.remote_delete(name).map_err(map_git_error)?;
    }
    repo.remote(name, url).map_err(map_git_error)?;
    Ok(())
}
