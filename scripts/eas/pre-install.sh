#!/usr/bin/env bash
# EAS Build Pre-Install Hook
# Installs Rust toolchain, cross-compilation targets, and cargo-ndk.
# Runs during `eas build` before npm install.

set -euo pipefail

export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export PATH="$CARGO_HOME/bin:$PATH"

echo "[eas-pre-install] Checking Rust installation..."

if ! command -v rustup >/dev/null 2>&1; then
  echo "[eas-pre-install] Installing rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "[eas-pre-install] Cargo not found after install, sourcing env..."
  [ -f "$HOME/.cargo/env" ] && . "$HOME/.cargo/env"
fi

echo "[eas-pre-install] Rust version: $(rustc --version)"
echo "[eas-pre-install] Adding iOS cross-compilation targets..."
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios

echo "[eas-pre-install] Adding Android NDK targets..."
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android

echo "[eas-pre-install] Installing cargo-ndk for Android builds..."
cargo install cargo-ndk --version 3.6.1 || cargo install cargo-ndk

echo "[eas-pre-install] Verifying targets..."
rustup show

echo "[eas-pre-install] Done."
