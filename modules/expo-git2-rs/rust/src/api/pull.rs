/*!
 * Pull operation — git2-rs implementation.
 *
 * GPL-3.0 derivative of GitSync.
 */

use crate::api::clone::map_git_error;
use crate::error::GitError;
use crate::protocol::{CredRequest, GitProgress};
use git2::{RemoteCallbacks, Repository};
use std::path::Path;

pub fn pull(
    repo_path: &str,
    remote: &str,
    refspec: Option<&str>,
    creds: Option<CredRequest>,
    progress_sender: impl Fn(GitProgress),
) -> Result<PullResult, GitError> {
    let repo = Repository::open(Path::new(repo_path)).map_err(map_git_error)?;

    let mut remote_callbacks = RemoteCallbacks::new();
    if let Some(ref cred) = creds {
        remote_callbacks.credentials(move |_url, _username_from_url, _cred_types| match cred {
            CredRequest::Userpass { username, token } => {
                git2::Cred::userpass_plaintext(username, token.as_deref().unwrap_or(""))
            }
            CredRequest::SshKey { .. } => {
                Err(git2::Error::from_str("SSH not yet implemented for pull"))
            }
        });
    }

    let mut fetch_opts = git2::FetchOptions::new();
    fetch_opts.remote_callbacks(remote_callbacks);

    let mut remote_obj = repo.find_remote(remote).map_err(map_git_error)?;

    let refspecs: Vec<&str> = refspec.map(|r| vec![r]).unwrap_or_default();
    remote_obj
        .fetch::<&str>(&refspecs, Some(&mut fetch_opts), None)
        .map_err(map_git_error)?;

    progress_sender(GitProgress::FetchComplete {
        remote: remote.to_string(),
        updated: vec![],
    });

    Ok(PullResult {
        remote: remote.to_string(),
        refspec: refspec.map(String::from),
    })
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PullResult {
    pub remote: String,
    pub refspec: Option<String>,
}
