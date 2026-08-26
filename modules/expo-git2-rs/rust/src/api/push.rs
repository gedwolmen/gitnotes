/*!
 * Push operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use crate::protocol::{CredRequest, GitProgress};
use git2::{RemoteCallbacks, Repository};
use serde::{Deserialize, Serialize};
use std::path::Path;

pub fn push(
    repo_path: &str,
    remote: &str,
    refspec: &str,
    creds: Option<CredRequest>,
    progress_sender: impl Fn(GitProgress),
) -> Result<PushResult, GitError> {
    let repo = Repository::open(Path::new(repo_path))
        .map_err(|e| map_git_error(e))?;

    let mut remote_callbacks = RemoteCallbacks::new();
    if let Some(ref cred) = creds {
        remote_callbacks.credentials(move |_url, _username_from_url, _cred_types| {
            match cred {
                CredRequest::Userpass { username, token } => {
                    git2::Cred::userpass_plaintext(username, token.as_deref().unwrap_or(""))
                }
                CredRequest::SshKey { .. } => {
                    Err(git2::Error::from_str("SSH not yet implemented for push"))
                }
            }
        });
    }

    let mut opts = git2::PushOptions::new();
    opts.remote_callbacks(remote_callbacks);

    let mut remote_obj = repo.find_remote(remote).map_err(|e| map_git_error(e))?;
    remote_obj.push(&[refspec], Some(&mut opts))
        .map_err(|e| map_git_error(e))?;

    progress_sender(GitProgress::PushComplete {
        remote: remote.to_string(),
        updated: vec![refspec.to_string()],
    });

    Ok(PushResult {
        remote: remote.to_string(),
        updated_refs: vec![refspec.to_string()],
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PushResult {
    pub remote: String,
    pub updated_refs: Vec<String>,
}
