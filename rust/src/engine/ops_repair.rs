//! Repo-corruption repair + re-clone fallback.
//!
//! Ported from GitSync `recreate_deleted_index` (4678),
//! `prune_corrupted_loose_objects` (4689) plus a stale-FETCH_HEAD cleanup.
//! `repair_repo` never auto-runs — callers (the JS facade) decide when to
//! invoke it. The re-clone fallback renames (never deletes) the corrupt
//! directory and requires the caller to gate it behind an explicit
//! data-loss confirmation.

use std::path::Path;

use git2::{Oid, Repository, ResetType};

use crate::api::types::RepairReport;
use crate::engine::error::{EngineError, Result};
use crate::engine::lock::run_with_lock;
use crate::engine::ops::open_repo;

/// Initialise a new repository at `path` (`bare = true` creates a bare repo
/// usable as a local push remote).
pub fn init_repo(repo_path: &Path, bare: bool) -> Result<()> {
    if repo_path.exists() {
        return Err(EngineError::Invalid(format!(
            "destination {} already exists",
            repo_path.display()
        )));
    }
    if let Some(parent) = repo_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    if bare {
        Repository::init_bare(repo_path).map_err(EngineError::Git)?;
    } else {
        let mut opts = git2::RepositoryInitOptions::new();
        opts.initial_head("main");
        Repository::init_opts(repo_path, &opts).map_err(EngineError::Git)?;
    }
    Ok(())
}

/// Repair a corrupted repository: rebuild a missing/corrupt index from HEAD,
/// prune loose objects that fail to parse, delete a stale FETCH_HEAD. Returns
/// a report of what was repaired and whether the repo is healthy again.
pub fn repair_repo(repo_path: &Path) -> Result<RepairReport> {
    run_with_lock(repo_path, || {
        let mut report = RepairReport {
            index_rebuilt: false,
            loose_objects_pruned: 0,
            fetch_head_deleted: false,
            repaired: Vec::new(),
            unrecoverable: Vec::new(),
            is_healthy: false,
        };

        if !repo_path.join(".git").is_dir() {
            report
                .unrecoverable
                .push(format!("{} has no .git directory", repo_path.display()));
            return Ok(report);
        }

        match recreate_deleted_index(repo_path) {
            Ok(()) => {
                report.index_rebuilt = true;
                report.repaired.push("rebuilt index from HEAD".to_string());
            }
            Err(e) => report
                .unrecoverable
                .push(format!("recreate_deleted_index: {}", e)),
        }

        match prune_corrupted_loose_objects(repo_path) {
            Ok(pruned) => {
                report.loose_objects_pruned = pruned;
                if pruned > 0 {
                    report
                        .repaired
                        .push(format!("pruned {} corrupted loose objects", pruned));
                }
            }
            Err(e) => report
                .unrecoverable
                .push(format!("prune_corrupted_loose_objects: {}", e)),
        }

        let fetch_head = repo_path.join(".git").join("FETCH_HEAD");
        if fetch_head.is_file() {
            match std::fs::remove_file(&fetch_head) {
                Ok(()) => {
                    report.fetch_head_deleted = true;
                    report.repaired.push("deleted stale FETCH_HEAD".to_string());
                }
                Err(e) => report
                    .unrecoverable
                    .push(format!("delete FETCH_HEAD: {}", e)),
            }
        }

        report.is_healthy = healthy(repo_path);
        Ok(report)
    })
}

/// Lock-free health probe: opening the repo and computing statuses succeeds.
/// Used for the post-repair `is_healthy` flag — must NOT acquire the flock,
/// since `repair_repo` already holds it (nested acquisition would deadlock on
/// the same-process flock).
fn healthy(repo_path: &Path) -> bool {
    let repo = match Repository::open(repo_path) {
        Ok(repo) => repo,
        Err(_) => return false,
    };
    let mut opts = git2::StatusOptions::new();
    opts.include_untracked(true);
    let statuses = repo.statuses(Some(&mut opts));
    statuses.is_ok()
}

/// Rename a corrupt repo directory to `<name>-corrupt-backup-<unix-ts>`.
///
/// Never deletes the original. Returns the backup path. The re-clone fallback
/// (JS facade) MUST gate this behind a second explicit data-loss confirmation.
pub fn backup_corrupt_repo(repo_path: &Path) -> Result<String> {
    let parent = repo_path.parent().unwrap_or_else(|| Path::new("."));
    let name = repo_path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .ok_or_else(|| EngineError::Invalid("invalid repository path".to_string()))?;
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let backup = parent.join(format!("{}-corrupt-backup-{}", name, timestamp));
    if backup.exists() {
        return Err(EngineError::Invalid(format!(
            "backup path already exists: {}",
            backup.display()
        )));
    }
    std::fs::rename(repo_path, &backup).map_err(EngineError::Io)?;
    Ok(backup.display().to_string())
}

/// Delete the repository working tree (`.git` guard against deleting
/// arbitrary directories).
pub fn remove_repo(repo_path: &Path) -> Result<()> {
    if !repo_path.join(".git").is_dir() {
        return Err(EngineError::Invalid(format!(
            "not a repository working tree: {}",
            repo_path.display()
        )));
    }
    std::fs::remove_dir_all(repo_path).map_err(EngineError::Io)
}

fn recreate_deleted_index(repo_path: &Path) -> Result<()> {
    let repo = open_repo(repo_path)?;
    let head = match repo.head() {
        Ok(head) => head,
        Err(_) => return Ok(()),
    };
    let commit = head.peel_to_commit()?;
    repo.reset(commit.as_object(), ResetType::Mixed, None)
        .map_err(EngineError::Git)
}

fn prune_corrupted_loose_objects(repo_path: &Path) -> Result<u32> {
    let repo: Repository = match Repository::open(repo_path) {
        Ok(repo) => repo,
        Err(e) if e.code() == git2::ErrorCode::NotFound => return Ok(0),
        Err(e) => return Err(EngineError::Git(e)),
    };
    let odb = repo.odb()?;
    let objects_dir = repo_path.join(".git").join("objects");
    let mut pruned = 0u32;

    if !objects_dir.is_dir() {
        return Ok(0);
    }
    let entries = match std::fs::read_dir(&objects_dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(0),
    };

    for dir_entry in entries.flatten() {
        let dir_name = dir_entry.file_name();
        let dir_name = match dir_name.to_str() {
            Some(s) if s.len() == 2 && s.chars().all(|c| c.is_ascii_hexdigit()) => s,
            _ => continue,
        };
        let sub_entries = match std::fs::read_dir(dir_entry.path()) {
            Ok(entries) => entries,
            Err(_) => continue,
        };
        for file_entry in sub_entries.flatten() {
            let file_name = file_entry.file_name();
            let file_name = match file_name.to_str() {
                Some(s) if s.len() == 38 && s.chars().all(|c| c.is_ascii_hexdigit()) => s,
                _ => continue,
            };
            let oid = match Oid::from_str(&format!("{}{}", dir_name, file_name)) {
                Ok(oid) => oid,
                Err(_) => continue,
            };
            if let Err(e) = odb.read_header(oid) {
                if e.message()
                    .to_lowercase()
                    .contains("failed to parse loose object")
                {
                    let _ = std::fs::remove_file(file_entry.path());
                    pruned += 1;
                }
            }
        }
    }

    if pruned > 0 {
        let _ = odb.refresh();
    }
    Ok(pruned)
}
