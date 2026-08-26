/*!
 * Tag management — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::Repository;
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn list_tags(repo_path: &str) -> Result<Vec<TagEntry>, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let tag_names = repo.tag_names(None).map_err(map_git_error)?;
    let mut tags = Vec::new();

    for i in 0..tag_names.len() {
        if let Ok(Some(name)) = tag_names.get(i) {
            let tag_name = name.to_string();
            let oid = repo
                .revparse_single(&format!("refs/tags/{}", tag_name))
                .ok()
                .map(|o| o.id().to_string());

            tags.push(TagEntry {
                name: tag_name,
                oid,
                message: None,
            });
        }
    }

    Ok(tags)
}

pub fn create_tag(
    repo_path: &str,
    tag_name: &str,
    target_oid: &str,
    message: Option<&str>,
) -> Result<TagEntry, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let target_oid_val = repo
        .revparse_single(target_oid)
        .map_err(map_git_error)?
        .id();
    let target = repo.find_commit(target_oid_val).map_err(map_git_error)?;

    let sig = repo.signature().map_err(map_git_error)?;

    if let Some(msg) = message {
        repo.tag(tag_name, target.as_object(), &sig, msg, false)
            .map_err(map_git_error)?;
    } else {
        repo.tag_lightweight(tag_name, target.as_object(), false)
            .map_err(map_git_error)?;
    }

    Ok(TagEntry {
        name: tag_name.to_string(),
        oid: Some(target_oid.to_string()),
        message: message.map(String::from),
    })
}

pub fn delete_tag(repo_path: &str, tag_name: &str) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    repo.tag_delete(tag_name).map_err(map_git_error)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagEntry {
    pub name: String,
    pub oid: Option<String>,
    pub message: Option<String>,
}
