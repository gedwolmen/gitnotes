#!/usr/bin/env bash
# Build script for expo-git2-rs Rust core
# Targets: iOS (aarch64-apple-ios, aarch64-apple-ios-sim, x86_64-apple-ios) and Android (arm64-v8a, armeabi-v7a, x86_64)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUST_DIR="$SCRIPT_DIR/../rust"
CARGO="${HOME}/.cargo/bin/cargo"

echo "=== expo-git2-rs Rust Build ==="
echo "Rust source: $RUST_DIR"

"$CARGO" +stable target list --installed | grep -q "aarch64-apple-ios" || "$CARGO" +stable target add aarch64-apple-ios
"$CARGO" +stable target list --installed | grep -q "aarch64-apple-ios-sim" || "$CARGO" +stable target add aarch64-apple-ios-sim
"$CARGO" +stable target list --installed | grep -q "x86_64-apple-ios" || "$CARGO" +stable target add x86_64-apple-ios
"$CARGO" +stable target list --installed | grep -q "aarch64-linux-android" || "$CARGO" +stable target add aarch64-linux-android
"$CARGO" +stable target list --installed | grep -q "armv7-linux-androideabi" || "$CARGO" +stable target add armv7-linux-androideabi
"$CARGO" +stable target list --installed | grep -q "x86_64-linux-android" || "$CARGO" +stable target add x86_64-linux-android

echo "=== Building iOS universal library ==="
mkdir -p "$RUST_DIR/target/universal/apple/ios/release"
"$CARGO" +stable build --release \
  --target aarch64-apple-ios \
  --target aarch64-apple-ios-sim \
  --target x86_64-apple-ios \
  -p expo-git2-rs

echo "=== Building Android libraries ==="
"$CARGO" +stable build --release \
  --target arm64-v8a-linux-android \
  --target armeabi-v7a-linux-android \
  --target x86_64-linux-android \
  -p expo-git2-rs

echo "=== Build complete ==="
echo "iOS artifacts: $RUST_DIR/target/aarch64-apple-ios/release/"
echo "Android artifacts: $RUST_DIR/target/"
