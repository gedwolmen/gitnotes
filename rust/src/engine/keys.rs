//! SSH key generation.
//!
//! Ported from GitSync `generate_ssh_key` (git_manager.rs:4223) using
//! osshkeys. ED25519 only — the resulting PEM is ~400 bytes and fits the
//! ~2 KB secure-store limit that the auth layer enforces.
//!
//! When a passphrase is given the private key is encrypted (AES-256-CTR,
//! OpenSSH format); otherwise it is written unencrypted.

use osshkeys::{KeyPair, KeyType};

use crate::engine::error::{EngineError, Result};

/// Generate an ed25519 keypair, returning `(private_pem, public_openssh)`.
pub fn generate_ed25519_key(passphrase: Option<&str>) -> Result<(String, String)> {
    let key_pair = KeyPair::generate(KeyType::ED25519, 256)
        .map_err(|e| EngineError::Other(format!("key generation failed: {e}")))?;

    let cipher = if passphrase.is_some() {
        osshkeys::cipher::Cipher::Aes256_Ctr
    } else {
        osshkeys::cipher::Cipher::Null
    };
    let private_key = key_pair
        .serialize_openssh(passphrase, cipher)
        .map_err(|e| EngineError::Other(format!("private key serialization failed: {e}")))?;

    let public_key = key_pair
        .serialize_publickey()
        .map_err(|e| EngineError::Other(format!("public key serialization failed: {e}")))?;

    Ok((private_key, public_key))
}

#[cfg(test)]
mod tests {
    use super::*;
    use base64::Engine as _;

    #[test]
    fn generates_ed25519_openssh_keypair() {
        let (private_key, public_key) = generate_ed25519_key(None).expect("keygen");
        assert!(public_key.starts_with("ssh-ed25519 "), "public key format");
        assert!(private_key.contains("-----BEGIN OPENSSH PRIVATE KEY-----"));
    }

    #[test]
    fn passphrase_encrypts_the_private_key() {
        let (encrypted, _) = generate_ed25519_key(Some("hunter2")).expect("keygen");
        let body = encrypted
            .lines()
            .skip(1)
            .take_while(|line| !line.starts_with("-----END"))
            .collect::<String>();
        let decoded = base64::engine::general_purpose::STANDARD
            .decode(body)
            .expect("valid base64 body");
        let text = String::from_utf8_lossy(&decoded);
        assert!(
            text.contains("aes256-ctr"),
            "cipher embedded in body: {text:?}"
        );
    }
}
