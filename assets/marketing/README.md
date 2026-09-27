# Marketing Asset Pipeline

> Local, repeatable marketing asset generation for GitNotēs App Store and Google Play submissions.

## Overview

This pipeline captures deterministic app states from iOS Simulator and Android Emulator, generates validated Apple App Store and Google Play screenshots, and exports social media compositions. It is **local-only**, **English-first**, and outputs into this directory with machine-readable manifests.

**Key principles:**
- Source contracts and documentation are **tracked** in git
- Generated binaries and run artifacts are **ignored** by git
- All output paths are rooted under `assets/marketing/`
- Invalid inputs fail loudly with actionable error messages
- Marketing copy is English by design

## Quickstart

```bash
# 1. Check host prerequisites
yarn marketing:preflight

# 2. Boot a device (see Device Boot below)
# iOS:
xcrun simctl boot "iPhone 16 Pro Max"
xcrun simctl bootstatus "iPhone 16 Pro Max" -b
# Android:
emulator -avd Pixel_9_Pro_XL &

# 3. Run a full generation
yarn marketing:generate --profile iphone-6.9-inch --route home

# 4. Or step by step:
yarn marketing:capture --device iphone-6.9-inch --route home
yarn marketing:store --store apple-app-store
yarn marketing:video --input assets/marketing/captures/frame.png

# 5. Review outputs
open assets/marketing/store/apple/
open assets/marketing/social/
```

## Host Prerequisites

### Required Tools

| Tool | Purpose | Required For | Install |
|------|---------|-------------|---------|
| `xcrun simctl` | iOS Simulator control | iOS capture | Built into macOS Xcode tools |
| `adb` | Android Debug Bridge | Android capture | Android SDK platform tools |
| `ffmpeg` | Video encoding | Social video export | `brew install ffmpeg` |
| `ffprobe` | Media metadata | Video validation | Ships with ffmpeg |
| `playwright` | Browser automation | Motion composition | `npx playwright install chromium` |
| `sharp` | Image processing | Store composition | Already a dev dependency (`yarn`) |

### Checking Prerequisites

```bash
yarn marketing:preflight
# or directly:
npx tsx scripts/marketing/index.ts preflight
```

The preflight check reports availability of all tools and the state of connected devices. Run it before any capture to diagnose missing prerequisites.

### If xcrun Is Missing

Install Xcode command-line tools:

```bash
xcode-select --install
# or
xcrun --version
```

### If adb Is Missing

Install Android SDK platform tools:

```bash
# macOS with Homebrew
brew install --cask android-sdk
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools

# Verify
adb version
```

### If ffmpeg/ffprobe Are Missing

```bash
# macOS
brew install ffmpeg

# Verify
ffmpeg -version
ffprobe -version
```

### If Playwright/Chromium Is Missing

```bash
# Install Chromium via Playwright
npx playwright install chromium

# Or from the marketing directory
yarn --cwd marketing install
npx playwright install chromium --cwd marketing
```

### If sharp Fails

```bash
yarn install
# sharp is a devDependency and installs automatically
```

## Device Boot

### iOS Simulator

```bash
# List available simulators
xcrun simctl list devices available

# Boot a specific simulator
xcrun simctl boot "iPhone 16 Pro Max"

# Confirm it is booted
xcrun simctl bootstatus "iPhone 16 Pro Max" -b

# Open Simulator app (optional, for visual confirmation)
open -a Simulator
```

The simulator must be in the **Booted** state before running `yarn marketing:capture`.

### Android Emulator

```bash
# List available AVDs
emulator -list-avds

# Boot a specific emulator
emulator -avd Pixel_9_Pro_XL &

# Or with a specific skin
emulator -avd Pixel_9_Pro_XL -skin 1440x3200 &
```

The emulator must show as `device` (not `offline`) in `adb devices` before running Android capture.

### Android APK Requirement

Android capture also requires a built APK:

```bash
# Development build
yarn android
# or
eas build --profile development --platform android --local

# The APK path is auto-detected by findAPKPath() in scripts/marketing/capture/android-adb.ts
```

## Fixture Reset

The pipeline uses deterministic fixture data so screenshots are reproducible across runs. To reset or customize fixtures:

```bash
# Fixture data lives in scripts/marketing/fixtures/
# The seed date determines all fixture timestamps
node scripts/marketing/fixtures/seed.js
```

The fixture system generates deterministic note IDs, chat thread IDs, and canvas IDs. Resetting re-generates these IDs, which changes deep link targets for `note-editor`, `canvas-editor`, and `chat-thread` routes.

## Route Checkpoints

### Automated Routes

These routes have deterministic deep links and are captured automatically:

| Route | Deep Link | Automated |
|-------|-----------|-----------|
| Home | `gitnotes://home` | Yes |
| Notes | `gitnotes://notes` | Yes |
| Note Editor | `gitnotes://note/:noteId` | Yes (requires fixture noteId) |
| Canvas Editor | `gitnotes://canvas/:canvasId` | Yes (requires fixture canvasId) |
| Todos | `gitnotes://home` | Yes (navigates via home) |
| Explore | `gitnotes://explore` | Yes |
| Settings | `gitnotes://settings` | Yes |

### Manual Checkpoint Routes

Two routes require **manual capture** because they lack deep link support or have no stable testID:

| Route | Deep Link | Status | Reason |
|-------|-----------|--------|--------|
| Graph View | `gitnotes://home` | **Manual** | No direct deep link; no stable testID |
| Chat | `gitnotes://chat` | **Manual** | Thread list has no stable testID |
| Chat Thread | `gitnotes://chat/:threadId` | **Manual** | Requires generated thread ID |

For Graph and Chat routes, capture manually using the Simulator screenshot tool or `xcrun simctl screenshot`, then place the output in `assets/marketing/captures/` and name it appropriately.

## CLI Commands

All commands use `npx tsx` to run the TypeScript entry point. The root `package.json` exposes them as named scripts.

### yarn marketing:preflight

Check host tool availability. Reports all tools and device states.

```bash
yarn marketing:preflight
npx tsx scripts/marketing/index.ts preflight
npx tsx scripts/marketing/index.ts preflight --verbose
npx tsx scripts/marketing/index.ts preflight --skip-android
npx tsx scripts/marketing/index.ts preflight --skip-playwright
```

Exit codes: `0` all available, `2` preflight failed.

### yarn marketing:capture

Capture screenshots from simulators. Writes PNG files to `assets/marketing/captures/`.

```bash
# Capture for default device (iphone-6.9-inch) and route (home)
yarn marketing:capture

# Capture with options
yarn marketing:capture --device iphone-6.9-inch --route home --orientation portrait
yarn marketing:capture --device ipad-13-inch --route notes --orientation landscape

# Dry run (no actual capture)
yarn marketing:capture:dry-run
npx tsx scripts/marketing/index.ts capture --dry-run

# Skip specific platforms
yarn marketing:capture --skip-android
yarn marketing:capture --skip-ios
```

Output files land in `assets/marketing/captures/` with names like `iphone-6.9-inch-home-portrait-<timestamp>.png`.

### yarn marketing:store

Export store-ready compositions (Apple App Store, Google Play). Reads from `assets/marketing/captures/`.

```bash
# Apple App Store, default PNG
yarn marketing:store

# Google Play, JPEG format
yarn marketing:store --store google-play --format jpeg

# Dark theme
yarn marketing:store --theme dark-bold

# Overwrite existing files
yarn marketing:store --overwrite

# Dry run
yarn marketing:store:dry-run
```

Requires source captures from the `capture` command first. Outputs land in `assets/marketing/store/apple/` or `assets/marketing/store/google-play/`.

### yarn marketing:video

Encode social video previews at multiple aspect ratios. Reads from `assets/marketing/captures/`.

```bash
# Default 15-second video from default capture
yarn marketing:video

# Custom input and duration
yarn marketing:video --input assets/marketing/captures/frame.png --duration 15

# Encoding profile
yarn marketing:video --profile social  # default: social
yarn marketing:video --profile app-store
yarn marketing:video --profile minimal

# Dry run (shows FFmpeg commands)
yarn marketing:video:dry-run
npx tsx scripts/marketing/index.ts video --dry-run --input assets/marketing/captures/frame.png
```

Exports three ratios simultaneously: 9:16 (1080x1920), 1:1 (1080x1080), 16:9 (1920x1080). Outputs land in `assets/marketing/video/exports/`.

### yarn marketing:generate

Run the full pipeline: preflight, capture, store, video. A single command to produce all artifacts.

```bash
# Full generation
yarn marketing:generate --profile iphone-6.9-inch --route home

# Skip store or video steps
yarn marketing:generate --profile iphone-6.9-inch --skip-store
yarn marketing:generate --profile iphone-6.9-inch --skip-video

# Dry run
yarn marketing:generate:dry-run
npx tsx scripts/marketing/index.ts generate --dry-run --profile iphone-6.9-inch
```

### yarn marketing:clean

Remove generated marketing assets. Scoped to `assets/marketing/` directories only.

```bash
# Clean all marketing output (with confirmation prompt)
yarn marketing:clean

# Clean specific subdirectories
yarn marketing:clean --runs        # only assets/marketing/runs/
yarn marketing:clean --exports      # only assets/marketing/exports/
yarn marketing:clean --captures     # only assets/marketing/captures/
yarn marketing:clean --all          # all subdirectories

# Skip confirmation
yarn marketing:clean --force

# Dry run (safe to run first)
yarn marketing:clean:dry-run
npx tsx scripts/marketing/index.ts clean --dry-run
```

**Safety**: `clean` only removes files under `assets/marketing/`. It will not delete files outside this tree. Manifest files in `exports/` are preserved.

### yarn marketing:manifest

Validate a manifest file and compute its checksum.

```bash
yarn marketing:manifest assets/marketing/store/apple/run-xxx.manifest.json
npx tsx scripts/marketing/index.ts manifest assets/marketing/runs/run-xxx/manifest.json
```

### yarn marketing:studio

Print instructions for the standalone marketing composition studio (Motion/React package under `marketing/`).

```bash
yarn marketing:studio
npx tsx scripts/marketing/index.ts studio
```

Then run `yarn --cwd marketing dev` to start the dev server.

### yarn marketing:help

Show full CLI help with all commands and options.

```bash
yarn marketing:help
npx tsx scripts/marketing/index.ts --help
```

## Output Directory Tree

```
assets/marketing/
├── README.md              # This file (tracked)
├── runs/                  # Per-run working output (ignored)
│   └── run-*/            # One per pipeline run
│       └── manifest.json  # Run manifest (tracked pattern)
├── exports/               # Final export artifacts (ignored)
├── captures/              # Raw simulator captures (ignored)
│   └── *.png             # Screenshots from simulators
├── store/                 # Store-ready compositions
│   ├── apple/            # Apple App Store screenshots
│   │   └── *.png
│   └── google-play/      # Google Play screenshots
│       └── *.png
└── social/                # Social media video exports (ignored)
    ├── 9x16/             # 1080x1920 Instagram Reels / TikTok
    ├── 1x1/              # 1080x1080 Instagram / Facebook
    └── 16x9/             # 1920x1080 YouTube / Twitter
```

The `runs/` directory stores per-run manifests with source/destination tracking. The `store/` and `social/` directories hold the final deliverables.

## Manifest Schema

Every pipeline run produces a manifest tracking sources, artifacts, tool versions, and a git commit reference.

```json
{
  "runId": "run-2024-01-15T10-30-00-abc123",
  "generatedAt": "2024-01-15T10:30:00.000Z",
  "pipelineVersion": "1.0.0",
  "sources": [
    {
      "route": "home",
      "device": "iphone-6.9-inch",
      "orientation": "portrait",
      "locale": "en",
      "deepLink": "gitnotes://home",
      "capturedAt": "2024-01-15T10:29:55.000Z"
    }
  ],
  "artifacts": [
    {
      "relativePath": "store/apple/iphone-69-inch-home-portrait-01.png",
      "format": "png",
      "width": 1290,
      "height": 2796,
      "checksum": "sha256:abc123...",
      "sizeBytes": 245000,
      "store": "apple-app-store"
    }
  ],
  "tools": [
    { "name": "node", "version": "20.18.0" },
    { "name": "yarn", "version": "1.22.22" }
  ],
  "gitCommit": "abc1234def567"
}
```

### Validating a Manifest

```bash
yarn marketing:manifest assets/marketing/store/apple/run-xxx.manifest.json
```

This verifies the JSON structure and computes the checksum. Use the checksum to confirm artifact integrity:

```bash
# Verify artifact matches manifest checksum
sha256sum assets/marketing/store/apple/iphone-69-inch-home-portrait-01.png
# Compare output to the checksum in manifest.json
```

### Checksum Workflow

1. Run the pipeline to generate artifacts
2. The manifest records each artifact's SHA-256 checksum at generation time
3. Before submission, run `manifest` to verify the manifest itself is valid
4. Optionally re-compute checksums on artifact files and compare against manifest values

## Device Profiles

### Apple App Store

| Profile | Portrait | Landscape |
|---------|----------|-----------|
| iPhone 6.9" | 1290 x 2796 px | 2796 x 1290 px |
| iPad 13" | 2048 x 2732 px | 2732 x 2048 px |

### Google Play

| Profile | Portrait | Landscape |
|---------|----------|-----------|
| Phone | 1080 x 2340 px | 2340 x 1080 px |
| 7" Tablet | 1080 x 1920 px | 1920 x 1080 px |
| 10" Tablet | 1600 x 2560 px | 2560 x 1600 px |

### Output Formats

- **PNG**: Lossless, for screenshots with sharp text
- **JPEG**: Lossy, quality 90%, for photographic content

### Safe Area Insets (px)

| Profile | Top | Bottom | Left | Right |
|---------|-----|--------|------|-------|
| iPhone 6.9" | 63 | 51 | 0 | 0 |
| Others | 0 | 0 | 0 | 0 |

## Overwrite Policy

By default, existing output files are **not** overwritten. Attempting to write to an existing file returns an error:

```
Output file exists (use --overwrite to replace): assets/marketing/store/apple/iphone-69-inch-home-portrait-01.png
```

To overwrite:

```bash
yarn marketing:store --overwrite
yarn marketing:video --overwrite
```

## Safe Cleanup

The `clean` command is scoped strictly to `assets/marketing/`:

```bash
# Safe: dry run first
yarn marketing:clean:dry-run

# Confirm targets are all under assets/marketing/
# Then run for real
yarn marketing:clean --force
```

The clean command:
- Rejects any path that escapes `assets/marketing/`
- Preserves manifest files in `exports/` directories
- Reports file counts and total size before deleting
- Is idempotent (running clean on an already-clean directory succeeds)

## Troubleshooting

### xcrun not found

```
✗ xcrun not found: /usr/bin/xcrun
```

**Fix**: Install Xcode command-line tools:
```bash
xcode-select --install
```

### No booted iOS device

```
iOS capture skipped: no booted device or xcrun unavailable
```

**Fix**: Boot a simulator before running capture:
```bash
xcrun simctl boot "iPhone 16 Pro Max"
xcrun simctl bootstatus "iPhone 16 Pro Max" -b
```

### adb not found

```
✗ adb not found
```

**Fix**: Install Android SDK platform tools:
```bash
brew install --cask android-sdk
export ANDROID_HOME=~/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools
```

### No running Android emulator

```
Android capture skipped: no running emulator or adb unavailable
```

**Fix**: Start an emulator and confirm it is available:
```bash
emulator -avd Pixel_9_Pro_XL &
adb devices
# Should show: emulator-xxxx device
```

### Android APK not found

```
Android capture skipped: no APK found. Build with `yarn android` or `eas build`
```

**Fix**: Build a debug APK first:
```bash
yarn android
# or
eas build --profile development --platform android --local
```

### ffmpeg not found

```
✗ ffmpeg not found
```

**Fix**:
```bash
brew install ffmpeg
```

Video export requires ffmpeg. Without it, `video` command fails with exit code 3 (missing tool).

### ffprobe not found

```
✗ ffprobe not found
```

**Fix**: ffprobe ships with ffmpeg. Reinstall ffmpeg:
```bash
brew install ffmpeg
```

Video validation requires ffprobe. Without it, video validation is skipped but encoding may still succeed.

### Chromium not found

```
Chromium not available - video rendering will fail
```

**Fix**:
```bash
npx playwright install chromium
```

Chromium is required for the `marketing/` standalone studio (Motion composition package). It is not required for the root CLI capture pipeline.

### Rust/APK not built

```
Android capture skipped: no APK found
```

The Android capture path requires a compiled APK. Build with Expo:
```bash
yarn android
# or for a specific build:
eas build --profile development --platform android --local
```

### No capture files found

```
No capture files found in assets/marketing/captures/. Run 'capture' command first.
```

The `store` command requires PNG or JPEG files in `assets/marketing/captures/`. Run capture first:
```bash
yarn marketing:capture --device iphone-6.9-inch --route home
```

### Input file not found (video)

```
Input file not found: assets/marketing/captures/frame.png
```

The `video` command needs a source image. Use `--input` to specify a different path:
```bash
yarn marketing:video --input assets/marketing/captures/iphone-6.9-inch-home-portrait-xxx.png
```

### Preflight fails in CI

The pipeline is **local-only by design**. It requires:
- A macOS or Linux host with GUI access (for simulators)
- Booted devices or emulators
- Host toolchain (xcrun, adb, ffmpeg)

CI environments typically lack these. The pipeline is intended for local developer workstations. Do not configure automated CI runs for the marketing pipeline.

### Clean command fails with "Unsafe path rejected"

The clean command detected a path outside `assets/marketing/` and refused to run. This is a safety guard. To clean artifacts manually:
```bash
rm -rf assets/marketing/runs/*
rm -rf assets/marketing/captures/*
rm -rf assets/marketing/store/apple/*
rm -rf assets/marketing/store/google-play/*
rm -rf assets/marketing/social/*
```

## Limitations

- **Local-only**: Pipeline runs on a local developer workstation, not in CI. No automated runs are configured.
- **English-only**: Marketing copy is English by design. All slide text, headlines, and body copy use English.
- **Manual checkpoints**: Graph View and Chat routes require manual screenshot capture because they lack deep link support or stable testIDs.
- **No store submission**: Pipeline generates assets. Submitting to the App Store or Google Play is a separate human-performed workflow.
- **Host prerequisites required**: The pipeline cannot generate assets without the host toolchain (xcrun, adb, ffmpeg, etc.). It fails loudly when prerequisites are absent rather than silently skipping.
- **Generated media is local**: All output binaries (screenshots, videos, compositions) are written to `assets/marketing/` which is gitignored. They are not committed.
- **No CI promises**: Do not configure this pipeline in a CI system. It requires a macOS host with Xcode, simulators, and an Android emulator running.

## Environment Variables

Override tool paths if needed:

| Variable | Default | Purpose |
|----------|---------|---------|
| `XCRUN_PATH` | `xcrun` | Path to xcrun binary |
| `ADB_PATH` | `adb` | Path to adb binary |
| `FFMPEG_PATH` | `ffmpeg` | Path to ffmpeg binary |
| `FFPROBE_PATH` | `ffprobe` | Path to ffprobe binary |
| `PLAYWRIGHT_PATH` | auto-detected | Path to playwright binary |

Example:
```bash
XCRUN_PATH=/custom/xcrun ADB_PATH=/custom/adb yarn marketing:preflight
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Preflight failed (missing tools) |
| 3 | Missing tool |
| 4 | Missing input file |
| 5 | Invalid configuration |
| 6 | Clean failed (unsafe path) |
| 7 | Manifest invalid |

## References

- [Apple Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Google Play Preview Assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- [App Deep Links (screens.md)](../../docs/wiki/screens.md)
- [Marketing Studio Package](../marketing/README.md)
