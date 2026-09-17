//! Android CA store configuration for the git2 engine.
//!
//! Android's system CA certificates live in one of two locations:
//! - **`/apex/com.android.conscrypt/cacerts`** (Android 10+, preferred — unified
//!   CA store managed by the Conscrypt APEX module)
//! - **`/system/etc/security/cacerts`** (legacy path, present on some devices)
//!
//! Both directories contain the same 120-ish PEM-encoded root CA certificates
//! used to verify TLS server certificates. The Rust git2 engine (via OpenSSL's
//! `SSL_CERT_DIR` fallback) needs to be pointed at the right directory on Android
//! because the vendored OpenSSL build does not auto-detect the Android paths.
//!
//! ## Safety contract
//!
//! `git2::opts::set_ssl_cert_dir` **mutates a C global** inside libgit2's OpenSSL
//! adapter. The C global is process-local state, not thread-local. Calling it while
//! another thread is inside a git operation is a data race. The Kotlin `OnCreate`
//! lifecycle callback runs on the main thread **before** any async engine ops can
//! be dispatched, so we invoke it there — before the React Native JS thread has
//! posted any engine work. This is the single allowed call site; no other call
//! may be added.
//!
//! ## No certificate bypass
//!
//! This function validates that the selected directory exists and is non-empty
//! before passing it to `set_ssl_cert_dir`. If validation fails, the function
//! returns early and **does not** configure a fallback — git2's default OpenSSL
//! certificate verification remains active. No accept-all callback is installed,
//! and `sslVerify` is never set to `false`.

use std::path::{Path, PathBuf};

/// Path to Android's modern APEX-managed CA store (Android 10+).
const ANDROID_CA_APEX_DEFAULT: &str = "/apex/com.android.conscrypt/cacerts";

/// Path to Android's legacy system CA store.
const ANDROID_CA_LEGACY_DEFAULT: &str = "/system/etc/security/cacerts";

/// Errors that can occur when configuring the Android CA store.
#[derive(Debug, thiserror::Error)]
pub enum AndroidCaError {
    #[error("failed to set SSL certificate directory: {0}")]
    SetCertDir(#[from] git2::Error),
    #[error("CA directory is not readable: {0}")]
    NotReadable(#[from] std::io::Error),
}

/// Returns the best available Android CA certificate directory.
///
/// Prefers the APEX path (`/apex/com.android.conscrypt/cacerts`) when it
/// exists; falls back to the legacy path (`/system/etc/security/cacerts`) only
/// if the APEX path does not exist. Returns `None` when neither path is
/// available (i.e., not on Android).
///
/// `apex_override` and `legacy_override` exist solely for deterministic unit
/// testing; pass `None` in production to use the hardcoded defaults.
pub fn android_ca_dir(
    apex_override: Option<&Path>,
    legacy_override: Option<&Path>,
) -> Option<PathBuf> {
    let apex = apex_override.unwrap_or_else(|| Path::new(ANDROID_CA_APEX_DEFAULT));
    let legacy = legacy_override.unwrap_or_else(|| Path::new(ANDROID_CA_LEGACY_DEFAULT));

    if apex.exists() {
        return Some(apex.to_path_buf());
    }
    if legacy.exists() {
        return Some(legacy.to_path_buf());
    }
    None
}

/// Configure git2's SSL certificate directory for Android.
///
/// This function must be called **once** from the Kotlin `OnCreate` lifecycle
/// callback — before any engine operation (clone/fetch/push/pull) is dispatched.
///
/// # Safety
///
/// `git2::opts::set_ssl_cert_dir` writes to a **C global** inside libgit2's
/// OpenSSL adapter (`openssl_verify_certs_from_dir` in libgit2's `openssl.c`).
/// The global is process-local. Calling this concurrently from multiple threads
/// while git ops are in-flight is undefined behaviour. The single call in
/// `GitEngineModule.OnCreate` on the main thread, before any engine work is
/// posted, satisfies the thread-safety requirement.
pub fn configure_android_ca() -> Result<(), AndroidCaError> {
    let Some(ca_dir) = android_ca_dir(None, None) else {
        // Not on Android — do nothing; git2 uses the host system's CA store.
        return Ok(());
    };

    // Validate the directory is actually readable with certs before passing it
    // to git2. An empty or inaccessible CA dir would cause every TLS handshake
    // to fail silently or with confusing errors. Falling through to the default
    // behaviour (rather than returning an error) keeps the non-Android path clean.
    let mut entries = std::fs::read_dir(&ca_dir)?;
    if entries.next().is_none() {
        // Directory exists but is empty — do not configure it.
        return Ok(());
    }

    // SAFETY: This function must only be called from the main thread before
    // any git2 operations begin. The caller is `GitEngineModule.OnCreate` in
    // the Kotlin Expo module, which runs on the Android main thread before
    // any async engine operations are posted to the JS queue. No other thread
    // can be inside a git2 call at this point. The C global mutated by
    // `set_ssl_cert_dir` is process-local (not thread-local), so this single
    // serialized call from the main thread has well-defined behaviour.
    //
    // The library global is not accessed again until the first engine
    // operation is dispatched, which always happens after this call completes.
    unsafe {
        git2::opts::set_ssl_cert_dir(ca_dir.to_string_lossy().as_ref())?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Unique counter for test directory isolation.
    static TEST_DIR_COUNTER: std::sync::atomic::AtomicU32 = std::sync::atomic::AtomicU32::new(0);

    /// Returns a unique temporary directory path, creating it.
    /// The directory is NOT auto-deleted; tests must clean it up.
    fn unique_temp_dir() -> std::path::PathBuf {
        let n = TEST_DIR_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        let dir = std::env::temp_dir().join(format!("gitnotes_android_ca_test_{n}"));
        std::fs::create_dir_all(&dir).expect("temp dir creation");
        dir
    }

    /// Cleans up a temp directory created by `unique_temp_dir`.
    fn cleanup_temp_dir(dir: &Path) {
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn android_ca_dir_prefers_apex_over_legacy() {
        let td = unique_temp_dir();
        let apex = td.join("apex_cacerts");
        let legacy = td.join("legacy_cacerts");
        std::fs::create_dir(&apex).unwrap();
        std::fs::create_dir(&legacy).unwrap();

        let result = android_ca_dir(Some(apex.as_path()), Some(legacy.as_path()));
        assert_eq!(result.as_ref(), Some(&apex));
        cleanup_temp_dir(&td);
    }

    #[test]
    fn android_ca_dir_falls_back_to_legacy_when_apex_absent() {
        let td = unique_temp_dir();
        let legacy = td.join("legacy_cacerts");
        std::fs::create_dir(&legacy).unwrap();

        let result = android_ca_dir(None, Some(legacy.as_path()));
        assert_eq!(result.as_ref(), Some(&legacy));
        cleanup_temp_dir(&td);
    }

    #[test]
    fn android_ca_dir_returns_none_when_neither_exists() {
        let td = unique_temp_dir();
        let result = android_ca_dir(
            Some(td.join("nonexistent_apex").as_path()),
            Some(td.join("nonexistent_legacy").as_path()),
        );
        assert!(result.is_none());
        cleanup_temp_dir(&td);
    }

    #[test]
    fn android_ca_dir_returns_apex_when_only_apex_exists() {
        let td = unique_temp_dir();
        let apex = td.join("apex_cacerts");
        std::fs::create_dir(&apex).unwrap();

        let result = android_ca_dir(Some(apex.as_path()), None);
        assert!(result.is_some());
        assert_eq!(result.unwrap(), apex);
        cleanup_temp_dir(&td);
    }

    #[test]
    fn android_ca_dir_handles_real_android_paths_without_panic() {
        let apex = Path::new(ANDROID_CA_APEX_DEFAULT);
        let legacy = Path::new(ANDROID_CA_LEGACY_DEFAULT);
        let (apex_exists, legacy_exists) = (apex.exists(), legacy.exists());
        let result = android_ca_dir(None, None);
        // Result must be consistent: if neither path exists, result must be None
        if !apex_exists && !legacy_exists {
            assert!(result.is_none());
        }
    }

    #[test]
    fn configure_android_ca_ok_when_neither_android_ca_path_exists() {
        // configure_android_ca must return Ok(()) when neither Android CA path
        // exists (i.e., not on Android) — it is a deliberate no-op.
        let result = android_ca_dir(
            Some(Path::new("/this/path/does/not/exist/apex")),
            Some(Path::new("/this/path/does/not/exist/legacy")),
        );
        assert!(result.is_none());
        let result = configure_android_ca();
        assert!(result.is_ok());
    }
}
