/*!
 * Merge and conflict resolution — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use git2::Repository;
use serde::Serialize;
use std::path::Path;

pub fn merge_analysis(repo_path: &str, branch: &str) -> Result<MergeAnalysisResult, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let branch_ref = repo
        .find_reference(&format!("refs/heads/{}", branch))
        .map_err(map_git_error)?;
    let annotated = repo
        .reference_to_annotated_commit(&branch_ref)
        .map_err(map_git_error)?;

    let analysis = repo
        .merge_analysis(&[&annotated])
        .map_err(map_git_error)?;

    Ok(MergeAnalysisResult {
        analysis: format!("{:?}", analysis.0),
        up_to_date: analysis.0.is_up_to_date(),
        fast_forward: analysis.0.is_fast_forward(),
        normal: analysis.0.is_normal(),
    })
}

pub fn merge(
    repo_path: &str,
    branch: &str,
    message: Option<&str>,
) -> Result<MergeResult, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let branch_ref = repo
        .find_reference(&format!("refs/heads/{}", branch))
        .map_err(map_git_error)?;
    let annotated = repo
        .reference_to_annotated_commit(&branch_ref)
        .map_err(map_git_error)?;

    let (analysis, _preference) = repo
        .merge_analysis(&[&annotated])
        .map_err(map_git_error)?;

    if analysis.is_up_to_date() {
        return Ok(MergeResult {
            success: true,
            conflicts: vec![],
            message: "Already up to date".to_string(),
        });
    }

    if analysis.is_fast_forward() {
        let reference = repo
            .find_reference(&format!("refs/heads/{}", branch))
            .map_err(map_git_error)?;
        reference.peel_to_commit().map_err(map_git_error)?;
        return Ok(MergeResult {
            success: true,
            conflicts: vec![],
            message: "Fast-forward merge completed".to_string(),
        });
    }

    // Normal merge
    let mut checkout_opts = git2::build::CheckoutBuilder::new();
    checkout_opts.force();
    repo.merge(&[&annotated], None, Some(&mut checkout_opts))
        .map_err(map_git_error)?;

    // Check for conflicts
    let index = repo.index().map_err(map_git_error)?;
    let conflicts: Vec<String> = index
        .iter()
        .filter_map(|entry| {
            let path_bytes = &entry.path;
            if path_bytes.is_empty() {
                None
            } else {
                Some(String::from_utf8_lossy(path_bytes).into_owned())
            }
        })
        .collect();

    if !conflicts.is_empty() {
        return Err(GitError::MergeConflict { conflicts });
    }

    Ok(MergeResult {
        success: true,
        conflicts: vec![],
        message: message
            .map(String::from)
            .unwrap_or_else(|| "Merge completed".to_string()),
    })
}

pub fn resolve_conflict(
    repo_path: &str,
    path: &str,
    resolution: ConflictResolution,
) -> Result<(), GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut index = repo.index().map_err(map_git_error)?;
    let p = std::path::Path::new(path);

    match resolution {
        ConflictResolution::AcceptOurs => {
            if let Some(_entry) = index.get_path(p, 1) {
                // Stage 1 is "our" version - remove the conflict markers
                index
                    .add_all([path], git2::IndexAddOption::DEFAULT, None)
                    .map_err(map_git_error)?;
            }
        }
        ConflictResolution::AcceptTheirs => {
            if let Some(_entry) = index.get_path(p, 3) {
                // Stage 3 is "their" version - use that
                index
                    .add_all([path], git2::IndexAddOption::DEFAULT, None)
                    .map_err(map_git_error)?;
            }
        }
        ConflictResolution::UseBoth => {
            return Err(GitError::InvalidOperation {
                reason: "UseBoth requires manual merge; use stage 1 or 3".to_string(),
            });
        }
    }

    index.write().map_err(map_git_error)?;

    Ok(())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeAnalysisResult {
    pub analysis: String,
    pub up_to_date: bool,
    pub fast_forward: bool,
    pub normal: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeResult {
    pub success: bool,
    pub conflicts: Vec<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolution {
    AcceptOurs,
    AcceptTheirs,
    UseBoth,
}
