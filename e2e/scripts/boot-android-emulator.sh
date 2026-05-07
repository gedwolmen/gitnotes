#!/bin/bash
set -euo pipefail

AVD_NAME="${1:-pixel_8}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Android Emulator Setup ==="

if ! command -v emulator &> /dev/null; then
  echo "Android emulator not found. Ensure ANDROID_HOME/emulator is in PATH."
  exit 1
fi

echo "Starting emulator: $AVD_NAME"
emulator -avd "$AVD_NAME" -no-snapshot-load -no-audio -gpu swiftshader_indirect &
EMULATOR_PID=$!

echo "Waiting for emulator to boot..."
BOOT_COMPLETE=""
for i in $(seq 1 120); do
  BOOT_COMPLETE=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r' || true)
  if [ "$BOOT_COMPLETE" = "1" ]; then
    echo "Emulator booted after ${i}s"
    break
  fi
  sleep 1
done

if [ "$BOOT_COMPLETE" != "1" ]; then
  echo "Emulator failed to boot within 120s"
  kill $EMULATOR_PID 2>/dev/null || true
  exit 1
fi

echo "=== Checking Maestro ==="
if ! command -v maestro &> /dev/null; then
  echo "Maestro CLI not found. Install with:"
  echo "  curl -Ls 'https://get.maestro.mobile.dev' | bash"
  exit 1
fi

echo "Maestro version: $(maestro --version)"
echo ""
echo "=== Setup Complete ==="
echo "Emulator: $AVD_NAME (PID: $EMULATOR_PID)"
echo ""
echo "Next steps:"
echo "  1. Install app:  adb install app/build/outputs/apk/debug/app-debug.apk"
echo "  2. Run smoke:    yarn e2e:android:smoke"
echo "  3. Run full:     yarn e2e:android:full"
