#!/bin/bash
set -euo pipefail

SIMULATOR_NAME="${1:-iPhone 16 Pro}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== iOS Simulator Setup ==="

DEVICE_ID=$(xcrun simctl list devices available -j | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    const devices = data.devices;
    for (const [runtime, list] of Object.entries(devices)) {
      const match = list.find(d => d.name === process.argv[1] && d.isAvailable);
      if (match) { console.log(match.udid); process.exit(0); }
    }
    console.error('Device not found: ' + process.argv[1]);
    process.exit(1);
  " "$SIMULATOR_NAME")

echo "Found simulator: $SIMULATOR_NAME ($DEVICE_ID)"

BOOTED=$(xcrun simctl list devices booted -j | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    for (const list of Object.values(data.devices)) {
      const match = list.find(d => d.udid === process.argv[1]);
      if (match) { console.log(match.state); process.exit(0); }
    }
    console.log('Shutdown');
  " "$DEVICE_ID")

if [ "$BOOTED" != "Booted" ]; then
  echo "Booting simulator $DEVICE_ID..."
  xcrun simctl boot "$DEVICE_ID"
  sleep 3
  echo "Simulator booted."
else
  echo "Simulator already booted."
fi

open -a Simulator --args -CurrentDeviceUDID "$DEVICE_ID"

echo "=== Checking Maestro ==="
if ! command -v maestro &> /dev/null; then
  echo "Maestro CLI not found. Install with:"
  echo "  curl -Ls 'https://get.maestro.mobile.dev' | bash"
  exit 1
fi

echo "Maestro version: $(maestro --version)"
echo ""
echo "=== Setup Complete ==="
echo "Simulator: $SIMULATOR_NAME ($DEVICE_ID)"
echo ""
echo "Next steps:"
echo "  1. Build and install app:  expo run:ios --device '$DEVICE_ID'"
echo "  2. Run smoke test:         yarn e2e:ios:smoke"
echo "  3. Run full suite:         yarn e2e:ios:full"
