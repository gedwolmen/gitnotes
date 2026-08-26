/*!
 * Clone operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

use crate::error::GitError;
use crate::protocol::{CredRequest, GitProgress};
use git2::{FetchOptions, RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

/// Per-repository serial locks (in-memory, dropped on process exit).
static REPO_LOCKS: std::sync::LazyLock<Mutex<HashMap<String, ()>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Acquire a serial lock for a repository path.
/// Returns error if already locked.
pub fn acquire_lock(repo_path: &str) -> Result<Box<dyn Drop>, GitError> {
    let mut locks = REPO_LOCKS.lock().map_err(|_| GitError::InternalError {
        reason: "poisoned lock".to_string(),
    })?;
    if locks.contains_key(repo_path) {
        return Err(GitError::LockBusy {
            repo_path: repo_path.to_string(),
        });
    }
    locks.insert(repo_path.to_string(), ());
    let path = repo_path.to_string();
    Ok(Box::new(LockGuard { path }))
}

struct LockGuard {
    path: String,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        if let Ok(mut locks) = REPO_LOCKS.lock() {
            locks.remove(&self.path);
        }
    }
}

/// Clone a remote repository to a local path.
pub fn clone_repository(
    url: &str,
    path: &str,
    creds: Option<CredRequest>,
    progress_sender: impl Fn(GitProgress),
) -> Result<CloneResult, GitError> {
    let _lock = acquire_lock(path)?;

    let path = Path::new(path);
    if path.exists() {
        return Err(GitError::InvalidOperation {
            reason: format!("destination path already exists: {}", path.display()),
        });
    }

    let mut remote_callbacks = RemoteCallbacks::new();
    if let Some(ref cred) = creds {
        remote_callbacks.credentials(move |_url, _username_from_url, _cred_types| {
            match cred {
                CredRequest::Userpass { username, token } => {
                    git2::Cred::userpass_plaintext(username, token.as_deref().unwrap_or(""))
                }
                CredRequest::SshKey { username, .. } => {
                    Err(git2::Error::from_str(
                        "SSH authentication requires ssh-agent; key-based auth not yet implemented",
                    ))
                }
            }
        });
    }

    let mut fetch_opts = FetchOptions::new();
    fetch_opts.remote_callbacks(remote_callbacks);

    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(fetch_opts);

    let repo = builder
        .clone(url, path)
        .map_err(|e| map_git_error(e))?;

    let head = repo.head().map_err(|e| map_git_error(e))?;
    let head_oid = head.peel_to_commit().map_err(|e| map_git_error(e))?.id();
    let head_hex = head_oid.to_string();

    progress_sender(GitProgress::CloneComplete {
        path: path.to_string_lossy().to_string(),
        head: head_hex.clone(),
    });

    Ok(CloneResult {
        path: path.to_string_lossy().to_string(),
        head_oid: head_hex,
    })
}

/// Map a git2::Error to our GitError enum.
pub fn map_git_error(e: git2::Error) -> GitError {
    let s = e.message();
    if s.contains("authentication") || s.contains("credential") {
        GitError::AuthenticationFailed { reason: s.to_string() }
    } else if s.contains("network") || s.contains("connection") || s.contains("timeout") {
        GitError::NetworkError { reason: s.to_string() }
    } else if s.contains("conflict") || s.contains("merge") {
        GitError::MergeConflict {
            conflicts: vec![s.to_string()],
        }
    } else if s.contains("not found") || s.contains("does not exist") {
        GitError::RepositoryNotFound {
            path: s.to_string(),
        }
    } else {
        GitError::InternalError {
            reason: s.to_string(),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloneResult {
    pub path: String,
    pub head_oid: String,
}
