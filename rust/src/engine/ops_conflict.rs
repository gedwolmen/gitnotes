//! Conflict-resolution ops for the unified-editor UI (todo 21): read the
//! stage blobs of one conflicted file and mark a path resolved.
//!
//! Resolution state lives entirely in the git index — no separate conflict
//! store. `mark_conflict_resolved` is `index.add_path` + `index.write`, which
//! replaces the stage-1/2/3 entries with the working-tree content.

use std::path::Path;

use git2::{Oid, Repository};

use crate::api::types::ConflictBlobs;
use crate::engine::error::{EngineError, Result};
use crate::engine::lock::run_with_lock;
use crate::engine::ops::open_repo;

/// Text content of the stage blobs for the conflicted `file_path`.
///
/// Binary conflict content is rejected with `Unsupported` — the unified
/// editor is text-only. A missing stage decodes to an empty string (e.g.
/// add/add conflicts have no ancestor).
pub fn get_conflict_blobs(path: &Path, file_path: &str) -> Result<ConflictBlobs> {
    run_with_lock(path, || {
        let repo = open_repo(path)?;
        let mut index = repo.index()?;
        let conflict = find_conflict(&mut index, file_path)?;
        Ok(ConflictBlobs {
            path: file_path.to_string(),
            base: blob_text(&repo, conflict.ancestor.as_ref().map(|entry| entry.id))?,
            ours: blob_text(&repo, conflict.our.as_ref().map(|entry| entry.id))?
                .unwrap_or_default(),
            theirs: blob_text(&repo, conflict.their.as_ref().map(|entry| entry.id))?
                .unwrap_or_default(),
        })
    })
}

/// Resolve a conflicted path by staging the working-tree content as final
/// (`index.add_path` replaces the conflict stages; `index.write` persists).
pub fn mark_conflict_resolved(path: &Path, file_path: &str) -> Result<()> {
    run_with_lock(path, || {
        let repo = open_repo(path)?;
        let mut index = repo.index()?;
        index
            .add_path(Path::new(file_path))
            .map_err(EngineError::Git)?;
        index.write().map_err(EngineError::Git)
    })
}

fn find_conflict(index: &mut git2::Index, file_path: &str) -> Result<git2::IndexConflict> {
    let conflicts = index.conflicts().map_err(EngineError::Git)?;
    for conflict in conflicts.flatten() {
        let path = conflict
            .our
            .as_ref()
            .or(conflict.their.as_ref())
            .or(conflict.ancestor.as_ref())
            .map(|entry| String::from_utf8_lossy(&entry.path).into_owned())
            .unwrap_or_default();
        if path == file_path {
            return Ok(conflict);
        }
    }
    Err(EngineError::Invalid(format!(
        "no unresolved conflict for path: {file_path}"
    )))
}

fn blob_text(repo: &Repository, oid: Option<Oid>) -> Result<Option<String>> {
    let Some(oid) = oid else {
        return Ok(None);
    };
    let blob = repo.find_blob(oid)?;
    if blob.is_binary() {
        return Err(EngineError::Unsupported(
            "binary conflict content cannot be resolved in the unified editor".to_string(),
        ));
    }
    let text = std::str::from_utf8(blob.content()).map_err(|_| {
        EngineError::Unsupported(
            "non-UTF-8 conflict content cannot be resolved in the unified editor".to_string(),
        )
    })?;
    Ok(Some(text.to_string()))
}
