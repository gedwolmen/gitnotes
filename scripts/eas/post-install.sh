#!/usr/bin/env bash
# EAS Build Post-Install Hook
# Builds Rust native artifacts and generates UniFFI bindings for iOS and Android.
# Runs during `eas build` after npm install but before native build.

set -euo pipefail

export RUSTUP_HOME="${RUSTUP_HOME:-$HOME/.rustup}"
export CARGO_HOME="${CARGO_HOME:-$HOME/.cargo}"
export PATH="$CARGO_HOME/bin:$PATH"
export RUST_PROFILE="${RUST_PROFILE:-release}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
RUST_DIR="$ROOT_DIR/rust"
MODULE_DIR="$ROOT_DIR/modules/GitEngine"
IOS_LIB_DIR="$MODULE_DIR/ios/rust"
JNI_DIR="$MODULE_DIR/android/src/main/jniLibs"
SWIFT_GEN_DIR="$MODULE_DIR/ios/generated"
KOTLIN_GEN_DIR="$MODULE_DIR/android/src/main/java"

PROFILE_FLAGS=()
if [ "$RUST_PROFILE" = "release" ]; then
  PROFILE_FLAGS=(--release)
fi

log() { echo "[eas-post-install] $*"; }

# Source cargo env if needed
if [ -f "$HOME/.cargo/env" ]; then
  . "$HOME/.cargo/env"
fi

log "Building Rust git2 engine for iOS..."

if ! command -v xcrun &> /dev/null; then
  log "Skipping iOS builds (xcrun not found)"
else
  mkdir -p "$IOS_LIB_DIR"
  mkdir -p "$SWIFT_GEN_DIR/GitNotesGit2FFI"

  log "Building aarch64-apple-ios-sim..."
  (cd "$RUST_DIR" && cargo build --target aarch64-apple-ios-sim "${PROFILE_FLAGS[@]}")
  cp "$RUST_DIR/target/aarch64-apple-ios-sim/$RUST_PROFILE/libgitnotes_git2.a" "$IOS_LIB_DIR/libgitnotes_git2.a"
  log "iOS simulator staticlib copied"

  log "Building aarch64-apple-ios (device)..."
  (cd "$RUST_DIR" && cargo build --target aarch64-apple-ios "${PROFILE_FLAGS[@]}")
fi

# Build Android libs (skip if NDK not available)
if [ -n "${ANDROID_NDK_HOME:-}" ] && [ -d "${ANDROID_NDK_HOME:-}" ]; then
  log "Building Android libs for all ABIs..."
  ANDROID_TARGETS=(
    "aarch64-linux-android:arm64-v8a"
    "armv7-linux-androideabi:armeabi-v7a"
    "x86_64-linux-android:x86_64"
    "i686-linux-android:x86"
  )

  for entry in "${ANDROID_TARGETS[@]}"; do
    target="${entry%%:*}"
    abi="${entry##*:}"
    log "Building $target -> $abi"
    mkdir -p "$JNI_DIR/$abi"
    (cd "$RUST_DIR" && cargo ndk --target "$target" --platform 24 build "${PROFILE_FLAGS[@]}")
    cp "$RUST_DIR/target/$target/$RUST_PROFILE/libgitnotes_git2.so" "$JNI_DIR/$abi/"
    log "Copied $abi lib"
  done
else
  log "Skipping Android libs (ANDROID_NDK_HOME not set or not found)"
fi

HOST_TARGET=""
if [ "$(uname -m)" = "arm64" ]; then
  HOST_TARGET="aarch64-apple-darwin"
else
  HOST_TARGET="x86_64-apple-darwin"
fi

if ! (cd "$RUST_DIR" && cargo build --target "$HOST_TARGET" "${PROFILE_FLAGS[@]}" 2>/dev/null); then
  log "Skipping UniFFI binding generation (host target $HOST_TARGET not available)"
else
  log "Generating UniFFI Swift bindings..."
  DYLIB="$RUST_DIR/target/$HOST_TARGET/$RUST_PROFILE/libgitnotes_git2.dylib"

  TMP_DIR=$(mktemp -d)
  (cd "$RUST_DIR" && cargo run --features uniffi-cli --bin uniffi-bindgen -- generate \
    --library "$DYLIB" --language swift --out-dir "$TMP_DIR/swift")
  cp "$TMP_DIR/swift/GitNotesGit2.swift" "$SWIFT_GEN_DIR/"
  cp "$TMP_DIR/swift/GitNotesGit2FFI.h" "$SWIFT_GEN_DIR/GitNotesGit2FFI/"
  cp "$TMP_DIR/swift/GitNotesGit2FFI.modulemap" "$SWIFT_GEN_DIR/GitNotesGit2FFI/"

  if [ -n "${ANDROID_NDK_HOME:-}" ] && [ -d "${ANDROID_NDK_HOME:-}" ]; then
    log "Generating UniFFI Kotlin bindings..."
    (cd "$RUST_DIR" && cargo run --features uniffi-cli --bin uniffi-bindgen -- generate \
      --library "$DYLIB" --language kotlin --out-dir "$TMP_DIR/kotlin" --no-format)
    mkdir -p "$KOTLIN_GEN_DIR/uniffi/gitnotes_git2"
    cp "$TMP_DIR/kotlin/uniffi/gitnotes_git2/gitnotes_git2.kt" "$KOTLIN_GEN_DIR/uniffi/gitnotes_git2/"
  else
    log "Skipping Kotlin bindings (ANDROID_NDK_HOME not set or not found)"
  fi

  rm -rf "$TMP_DIR"
fi

log "All Rust artifacts built and bindings generated successfully."
