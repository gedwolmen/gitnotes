//! Credential-callback construction for remote operations.
//!
//! Ported from GitSync `get_default_callbacks` (git_manager.rs:749): HTTPS PAT
//! / OAuth token-as-password via `userpass_plaintext`; SSH keys loaded from
//! memory via `ssh_key_from_memory`. Unlike GitSync, HTTPS certificate
//! checking is left at libgit2's default (verified) rather than bypassed.

use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};

use git2::{Cred, CredentialType, RemoteCallbacks};

use crate::api::types::CredentialSource;

/// Per-repo credential registry, populated from the host app via
/// `set_credential` and consulted by remote ops when no explicit source is
/// given. The JS facade re-seeds it from expo-secure-store on each op.
static REGISTRY: OnceLock<Mutex<HashMap<String, CredentialSource>>> = OnceLock::new();

fn registry() -> &'static Mutex<HashMap<String, CredentialSource>> {
    REGISTRY.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Store the credential the engine should use for `repo_id`'s remotes.
pub fn set_credential(repo_id: &str, source: CredentialSource) {
    registry()
        .lock()
        .expect("credential registry poisoned")
        .insert(repo_id.to_string(), source);
}

/// Look up the registered credential for `repo_id`.
pub fn get_credential(repo_id: &str) -> Option<CredentialSource> {
    registry()
        .lock()
        .expect("credential registry poisoned")
        .get(repo_id)
        .cloned()
}

/// Remove the registered credential for `repo_id`. Returns true when one was
/// present.
pub fn clear_credential(repo_id: &str) -> bool {
    registry()
        .lock()
        .expect("credential registry poisoned")
        .remove(repo_id)
        .is_some()
}

/// Resolve the effective credential for a remote op: an explicit source wins,
/// otherwise the per-repo registry entry (keyed by the op's `repo_id`).
pub fn resolve(
    explicit: Option<&CredentialSource>,
    repo_id: Option<&str>,
) -> Option<CredentialSource> {
    match explicit {
        Some(source) => Some(source.clone()),
        None => repo_id.and_then(get_credential),
    }
}

/// Build remote callbacks that resolve credentials from `source`.
///
/// `None` / `CredentialSource::None` yields callbacks with no credential hook,
/// letting libgit2 proceed anonymously (public HTTPS clones) or via its own
/// defaults.
pub fn callbacks_from(source: Option<&CredentialSource>) -> RemoteCallbacks<'static> {
    let mut callbacks = RemoteCallbacks::new();
    let Some(source) = source.cloned() else {
        return callbacks;
    };
    if source == CredentialSource::None {
        return callbacks;
    }
    callbacks.credentials(move |_url, username_from_url, allowed| {
        credentials_for(&source, username_from_url, allowed)
    });
    callbacks
}

fn credentials_for(
    source: &CredentialSource,
    username_from_url: Option<&str>,
    allowed: CredentialType,
) -> Result<Cred, git2::Error> {
    match source {
        CredentialSource::None => Err(git2::Error::from_str("no credentials configured")),
        CredentialSource::UserPass { username, password } => {
            Cred::userpass_plaintext(username, password)
        }
        CredentialSource::SshKey {
            username,
            private_key,
            public_key,
            passphrase,
        } => {
            if !private_key.contains("-----BEGIN") {
                return Err(git2::Error::from_str(
                    "SSH key is not in PEM format (missing '-----BEGIN' header)",
                ));
            }
            let user = username_from_url.unwrap_or(username.as_str());
            Cred::ssh_key_from_memory(
                user,
                public_key.as_deref(),
                private_key,
                passphrase.as_deref(),
            )
        }
        CredentialSource::Default => default_credentials(username_from_url, allowed),
    }
}

/// Let libgit2 try its default credential sources for the allowed type.
fn default_credentials(
    username_from_url: Option<&str>,
    allowed: CredentialType,
) -> Result<Cred, git2::Error> {
    if allowed.contains(CredentialType::USERNAME) {
        Cred::username(username_from_url.unwrap_or("git"))
    } else if allowed.contains(CredentialType::SSH_KEY) {
        Cred::ssh_key_from_agent(username_from_url.unwrap_or("git"))
    } else if allowed.contains(CredentialType::DEFAULT) {
        Cred::default()
    } else {
        Err(git2::Error::from_str("no usable credential source"))
    }
}

/// Capture server-side push ref rejections out of band.
///
/// git2 returns `Ok` from `remote.push` even when the server rejects a ref;
/// the rejection only surfaces through the `push_update_reference` callback.
/// Ported from GitSync (git_manager.rs:2623): the callback stores the first
/// rejected ref/message in an `Arc<Mutex<Option<String>>>` which the caller
/// drains (`.take()`) after the push completes.
pub fn capture_push_rejections(
    callbacks: &mut RemoteCallbacks<'static>,
) -> Arc<Mutex<Option<String>>> {
    let captured: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    let clone = Arc::clone(&captured);
    callbacks.push_update_reference(move |refname, status| {
        if let Some(msg) = status {
            let mut guard = clone.lock().unwrap();
            if guard.is_none() {
                *guard = Some(format!("remote rejected {refname}: {msg}"));
            }
        }
        Ok(())
    });
    captured
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_roundtrip_and_clear() {
        set_credential("repo-a", CredentialSource::Default);
        set_credential("repo-b", CredentialSource::None);
        assert_eq!(get_credential("repo-a"), Some(CredentialSource::Default));
        assert_eq!(get_credential("repo-b"), Some(CredentialSource::None));
        assert_eq!(get_credential("repo-c"), None);
        assert!(clear_credential("repo-a"));
        assert!(!clear_credential("repo-a"));
        assert_eq!(get_credential("repo-a"), None);
    }

    #[test]
    fn resolve_prefers_explicit_over_registry() {
        // Unique id so the parallel registry test never clears it mid-run.
        set_credential("resolve-only-a", CredentialSource::Default);
        let explicit = CredentialSource::UserPass {
            username: "u".into(),
            password: "p".into(),
        };
        assert_eq!(
            resolve(Some(&explicit), Some("resolve-only-a")),
            Some(CredentialSource::UserPass {
                username: "u".into(),
                password: "p".into()
            })
        );
        assert_eq!(
            resolve(None, Some("resolve-only-a")),
            Some(CredentialSource::Default)
        );
        assert_eq!(resolve(None, Some("unknown")), None);
    }
}
