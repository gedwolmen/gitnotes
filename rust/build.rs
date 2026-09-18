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
                }
            }
        }
    }

    cc::Build::new().file("src/chkstk_stub.c").compile("chkstk_stub");
    println!("cargo:rerun-if-changed=src/chkstk_stub.c");
    println!("cargo:rerun-if-changed=patches/openssl-cert-verify.patch");
}
