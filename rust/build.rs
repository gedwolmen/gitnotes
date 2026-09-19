use std::fs;
use std::path::Path;
use std::process::Command;

/// Applies the openssl-cert-verify.patch to the vendored libgit2 source in the
/// cargo registry. This is a one-time operation — the patch is applied once and
/// a marker file is written so subsequent builds skip the patch application.
/// The patch modifies libgit2's verify_server_cert() to skip the SSL result check
/// when SSL_VERIFY_NONE is set (needed for Android Conscrypt compatibility).
fn apply_libgit2_openssl_patch(registry_src: &Path) {
    let openssl_c = registry_src.join("libgit2/src/libgit2/streams/openssl.c");
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let patch_file = manifest_dir.join("patches/openssl-cert-verify.patch");
    let marker = registry_src.join(".patch-applied");

    if marker.exists() {
        return;
    }

    if !openssl_c.exists() {
        eprintln!(
            "build.rs: openssl.c not found at {} — skipping patch",
            openssl_c.display()
        );
        return;
    }

    if !patch_file.exists() {
        eprintln!(
            "build.rs: patch file not found at {} — skipping patch",
            patch_file.display()
        );
        return;
    }

    let status = Command::new("patch")
        .args(["--batch", "-p1", "-i"])
        .arg(patch_file)
        .current_dir(registry_src)
        .status();

    match status {
        Ok(s) if s.success() => {
            fs::write(&marker, "").ok();
            println!("build.rs: applied openssl-cert-verify.patch to libgit2-sys");
        }
        Ok(s) => {
            eprintln!(
                "build.rs: patch command exited with {} — openssl.c may already be patched",
                s
            );
            fs::write(&marker, "").ok();
        }
        Err(e) => {
            eprintln!("build.rs: failed to run patch: {}", e);
        }
    }
}

/// Patch git_openssl__set_cert_location in libgit2-sys 0.18.8+ to add directory-mode
/// fallback when file-mode fails. The 0.18.8 version is missing the fallback that was
/// added to 0.18.3, causing SSL_CTX_load_verify_locations to fail entirely on Android
/// emulators where file-mode (no-stdio) fails and directory-mode is never attempted.
fn apply_set_cert_location_fallback(registry_src: &Path) {
    let openssl_c = registry_src.join("libgit2/src/libgit2/streams/openssl.c");
    let marker = registry_src.join(".set-cert-location-patched");

    if marker.exists() {
        return;
    }

    if !openssl_c.exists() {
        return;
    }

    let content = match fs::read_to_string(&openssl_c) {
        Ok(c) => c,
        Err(_) => return,
    };

    if content.contains("file mode fails (e.g. no-stdio OpenSSL build)") {
        let _ = fs::write(&marker, "");
        return;
    }

    let old_block = r#"	if (SSL_CTX_load_verify_locations(git__ssl_ctx, file, path) == 0) {
		char errmsg[256];

		ERR_error_string_n(ERR_get_error(), errmsg, sizeof(errmsg));
		git_error_set(GIT_ERROR_SSL, "OpenSSL error: failed to load certificates: %s",
			errmsg);

		return -1;
	}
	return 0;
}"#;

    let new_block = r#"	if (SSL_CTX_load_verify_locations(git__ssl_ctx, file, path) == 0) {
		char errmsg[256];

		ERR_error_string_n(ERR_get_error(), errmsg, sizeof(errmsg));

		/* If file mode fails (e.g. "no-stdio" OpenSSL build), try directory mode
		 * if a directory was also provided. This handles Android where OpenSSL's
		 * file-mode fails but directory mode works. */
		if (file != NULL && path != NULL) {
			if (SSL_CTX_load_verify_locations(git__ssl_ctx, NULL, path) == 0) {
				git_error_set(GIT_ERROR_SSL, "OpenSSL error: failed to load certificates: %s",
					errmsg);
				return -1;
			}
			return 0;
		}

		git_error_set(GIT_ERROR_SSL, "OpenSSL error: failed to load certificates: %s",
			errmsg);
		return -1;
	}
	return 0;
}"#;

    if !content.contains(old_block) {
        return;
    }

    let new_content = content.replace(old_block, new_block);
    if fs::write(&openssl_c, new_content).is_err() {
        return;
    }

    let _ = fs::write(&marker, "");
}

fn main() {
    // Apply libgit2 openssl.c patch if needed.
    // Patch ALL libgit2-sys versions found in the registry — git2 may depend on
    // a different patch version than what we compiled previously, and each
    // version has its own copy of the vendored libgit2 source.
    if let Ok(cargo_dir) = std::env::var("CARGO_REGISTRY_SRC") {
        let registry_src = Path::new(&cargo_dir);
        if let Ok(entries) = fs::read_dir(registry_src) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("libgit2-sys-") {
                    apply_libgit2_openssl_patch(&entry.path());
                    apply_set_cert_location_fallback(&entry.path());
                }
            }
        }
    }

    cc::Build::new().file("src/chkstk_stub.c").compile("chkstk_stub");
    println!("cargo:rerun-if-changed=src/chkstk_stub.c");
    println!("cargo:rerun-if-changed=patches/openssl-cert-verify.patch");
}
