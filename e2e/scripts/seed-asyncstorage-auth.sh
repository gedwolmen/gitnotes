#!/bin/bash
# DEPRECATED — app overwrites AsyncStorage seed on first launch.
# Use e2e/scripts/run-clone-lag-test.sh instead (real onboarding + clipboard token).
# Kept for reference only.
#
# Seed iOS sim AsyncStorage with an authenticated GitHub account so the
# app boots straight past onboarding. Bypasses the flaky tap-paste dance.
# Token passed via stdin (never appears in argv or logs).
set -euo pipefail

DEVICE_ID="${1:?Usage: seed-asyncstorage-auth.sh <device-udid> <app-bundle-id>}"
BUNDLE_ID="${2:?Usage: seed-asyncstorage-auth.sh <device-udid> <app-bundle-id>}"

# Read token from stdin.
TOKEN="$(cat)"

if [ -z "$TOKEN" ]; then
  echo "ERROR: empty token on stdin" >&2
  exit 1
fi

DATA_DIR="$(xcrun simctl get_app_container "$DEVICE_ID" "$BUNDLE_ID" data)"
ASYNC_DIR="$DATA_DIR/Library/Application Support/$BUNDLE_ID/RCTAsyncLocalStorage_V1"
MANIFEST="$ASYNC_DIR/manifest.json"

mkdir -p "$ASYNC_DIR"

# Use a fixed account id so the seed is reproducible.
ACCOUNT_ID="acc-e2e"
NOW="$(date +%s)000"

# Build the manifest JSON. Token never appears in any logs.
# Note: AsyncStorage stores all values as strings — booleans/numbers
# are encoded as the caller wants. The accounts list is a JSON string.
ACCOUNTS_JSON="[{\"id\":\"$ACCOUNT_ID\",\"login\":\"vidwadeseram\",\"name\":\"vidwadeseram\",\"email\":\"\",\"avatarUrl\":\"\",\"addedAt\":$NOW}]"

# Write the manifest using node so we don't have to escape the JSON.
TOKEN="$TOKEN" ACCOUNTS_JSON="$ACCOUNTS_JSON" node -e '
  const fs = require("fs");
  const path = process.argv[1];
  const token = process.env.TOKEN;
  const accounts = process.env.ACCOUNTS_JSON;
  const manifest = {
    "@gitnotes:onboarding_completed": "true",
    "@gitnotes:github_token": token,
    "@gitnotes:accounts": accounts,
    "@gitnotes:active_account_id": "acc-e2e"
  };
  fs.writeFileSync(path, JSON.stringify(manifest));
' "$MANIFEST"

# Verify file exists and has expected keys (no token in the verification).
KEYS=$(node -e 'console.log(Object.keys(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"))).join(","))' "$MANIFEST")
echo "Seeded AsyncStorage. Keys present: $KEYS"
echo "Token length: ${#TOKEN} (not echoed)"
