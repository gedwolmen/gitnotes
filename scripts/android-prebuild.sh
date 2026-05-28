#!/bin/bash
set -e

ANDROID_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../android" && pwd)"
SDK_PATH="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-/Users/vidwadeseram/Library/Android/sdk}}"

if [ ! -f "$ANDROID_DIR/local.properties" ]; then
    echo "sdk.dir=$SDK_PATH" > "$ANDROID_DIR/local.properties"
elif ! grep -q "sdk.dir=" "$ANDROID_DIR/local.properties"; then
    echo "sdk.dir=$SDK_PATH" > "$ANDROID_DIR/local.properties"
fi
