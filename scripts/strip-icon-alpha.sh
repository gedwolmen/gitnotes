#!/usr/bin/env bash
# Strip alpha from iOS app-icon catalog PNGs. App Store Connect rejects
# icons with an alpha channel — even when all alpha values are 255 — and
# falls back to a wireframe placeholder in the listing UI.
#
# Expo's `expo prebuild` has historically produced an RGBA dark-variant
# entry (see ios/GitNots/Images.xcassets/AppIcon.appiconset/App-Icon-dark-
# 1024x1024@1x.png) even when the source `assets/icon-dark.png` is RGB.
# Run this script after every prebuild and before any archive upload.

set -euo pipefail

ICON_DIR="ios/GitNots/Images.xcassets/AppIcon.appiconset"
if [[ ! -d "$ICON_DIR" ]]; then
  echo "[strip-icon-alpha] $ICON_DIR not found — run 'expo prebuild' first." >&2
  exit 1
fi

python3 - <<'PY'
from pathlib import Path
from PIL import Image

icon_dir = Path("ios/GitNots/Images.xcassets/AppIcon.appiconset")
fixed = 0
for png in icon_dir.glob("*.png"):
    with Image.open(png) as img:
        if img.mode in ("RGBA", "LA", "P"):
            if img.mode == "P":
                img = img.convert("RGBA")
            bg = Image.new("RGB", img.size, (255, 255, 255))
            mask = img.split()[-1] if img.mode == "RGBA" else None
            bg.paste(img, mask=mask)
            bg.save(png, "PNG")
            print(f"flattened {png.name}: {img.mode} → RGB")
            fixed += 1
        else:
            print(f"ok       {png.name}: {img.mode}")

if fixed == 0:
    print("[strip-icon-alpha] no changes needed")
else:
    print(f"[strip-icon-alpha] flattened {fixed} icon(s)")
PY
