#!/bin/bash
# Run the clone-lag E2E flow on a booted iOS sim.
# Pre-loads the sim clipboard with E2E_GITHUB_TOKEN so the onboarding
# "Paste from Clipboard" button can populate the token field.
# NO AsyncStorage seeding — app overwrites seed on first launch.
set -euo pipefail

SIMULATOR_NAME="${1:-iPhone 17 Pro}"
E2E_GITHUB_TOKEN="${E2E_GITHUB_TOKEN:-}"

if [ -z "$E2E_GITHUB_TOKEN" ]; then
  echo "ERROR: E2E_GITHUB_TOKEN not set"
  exit 1
fi

# Find or boot the simulator.
DEVICE_ID=$(xcrun simctl list devices available -j | \
  node -e "
    const data = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    for (const [runtime, list] of Object.entries(data.devices)) {
      const match = list.find(d => d.name === process.argv[1] && d.isAvailable);
      if (match) { console.log(match.udid); process.exit(0); }
    }
    console.error('Simulator not found: ' + process.argv[1]);
    process.exit(1);
  " "$SIMULATOR_NAME")

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
  echo "Booting $SIMULATOR_NAME ($DEVICE_ID)..."
  xcrun simctl boot "$DEVICE_ID"
  sleep 3
fi

echo "Simulator: $SIMULATOR_NAME ($DEVICE_ID)"

# Push the token into the sim clipboard.
# Token never appears in shell args or logs.
echo -n "$E2E_GITHUB_TOKEN" | xcrun simctl pbcopy "$DEVICE_ID"
echo "Token loaded into sim clipboard (not echoed)."

# Run the maestro flow from the project root.
# The flow uses clearState + real onboarding + clipboard paste.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"
maestro test .maestro/clone-lag-regression.yaml
