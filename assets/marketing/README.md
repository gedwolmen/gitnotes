# Marketing Asset Pipeline

> Local, repeatable marketing asset generation for GitNotēs App Store and Google Play submissions.

## Overview

This pipeline captures deterministic app states from iOS Simulator and Android Emulator, generates validated Apple App Store and Google Play screenshots, and exports social media compositions. It is **local-only**, **English-first**, and outputs into this directory with machine-readable manifests.

**Key principles:**
- Source contracts and documentation are **tracked** in git
- Generated binaries and run artifacts are **ignored** by git
- All output paths are rooted under `assets/marketing/`
- Invalid inputs fail loudly with actionable error messages

## Directory Structure

```
assets/marketing/
├── README.md              # This file (tracked)
├── runs/                  # Per-run working output (ignored)
├── exports/               # Final export artifacts (ignored)
├── captures/              # Raw simulator captures (ignored)
├── store/                 # Store-ready compositions
│   ├── apple/             # Apple App Store assets
│   └── google-play/       # Google Play assets
└── social/                # Social media exports
    ├── 9x16/              # 1080x1920 Instagram Reels / TikTok
    ├── 1x1/               # 1080x1080 Instagram / Facebook
    └── 16x9/              # 1920x1080 YouTube / Twitter
```

## Source Routes

The pipeline captures these app routes (deep link targets):

| Route | Deep Link | Notes |
|-------|-----------|-------|
| Home | `gitnotes://home` | Dashboard with quick access |
| Notes | `gitnotes://notes` | Note list browser |
| Note Editor | `gitnotes://note/:noteId` | Requires fixture noteId |
| Canvas Editor | `gitnotes://canvas/:canvasId` | Requires fixture canvasId |
| Todos | `gitnotes://home` | No direct deep link, uses home |
| Explore | `gitnotes://explore` | Git repository explorer |
| Chat | `gitnotes://chat` | Chat thread list |
| Chat Thread | `gitnotes://chat/:threadId` | Requires fixture threadId |
| Settings | `gitnotes://settings` | App settings |
| Graph View | `gitnotes://home` | No direct deep link |

## Device Profiles

### Apple App Store

| Profile | Dimensions (portrait) | Dimensions (landscape) |
|---------|----------------------|------------------------|
| iPhone 6.9" | 1290 × 2796 px | 2796 × 1290 px |
| iPad 13" | 2048 × 2732 px | 2732 × 2048 px |

### Google Play

| Profile | Dimensions (portrait) | Dimensions (landscape) |
|---------|----------------------|------------------------|
| Phone | 1080 × 2340 px | 2340 × 1080 px |
| 7" Tablet | 1080 × 1920 px | 1920 × 1080 px |
| 10" Tablet | 1600 × 2560 px | 2560 × 1600 px |

## Output Formats

- **PNG**: Lossless, for screenshots requiring sharp text
- **JPEG**: Lossy, for photographic content (quality: 90%)

## Safe Areas

Safe area insets (px) for text placement:

| Profile | Top | Bottom | Left | Right |
|---------|-----|--------|------|-------|
| iPhone 6.9" | 63 | 51 | 0 | 0 |
| Others | 0 | 0 | 0 | 0 |

## Pipeline Commands

### Configuration Contract

```typescript
// scripts/marketing/config.ts
import { buildMarketingConfig, validateOutputPath, getDimensions } from './config';

// Validate and build a config
const config = buildMarketingConfig({
  device: 'iphone-6.9-inch',
  route: 'home',
  orientation: 'portrait',
  format: 'png',
});

// Get dimensions for a device/orientation
const { width, height } = getDimensions('iphone-6.9-inch', 'portrait');
// width = 1290, height = 2796
```

### Manifest Generation

```typescript
// scripts/marketing/manifest.ts
import { buildManifest, writeManifest, computeManifestChecksum } from './manifest';

// Build a manifest
const manifest = buildManifest({
  runId: 'run-2024-01-15T10-30-00-abc123',
  sources: [sourceCapture],
  artifacts: [outputArtifact],
});

// Write to file
writeManifest(manifest, 'assets/marketing/runs/run-2024-01-15T10-30-00-abc123/manifest.json');

// Verify deterministic serialization
const checksum = computeManifestChecksum(manifest);
```

## Manifest Schema

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
  "gitCommit": "abc1234"
}
```

## Validation Rules

### Path Safety

All output paths MUST:
- Be relative (no leading `/`)
- Stay within `assets/marketing/`
- Not contain `..` traversal sequences

### Profile Validation

Unknown device profiles or formats cause a `ZodError` with details.

### Checksums

Every artifact records a SHA-256 checksum. The manifest itself can be checksummed for identity comparison across runs.

## Host Prerequisites

Required tools for full pipeline execution:

| Tool | Purpose | Detection |
|------|---------|-----------|
| `xcrun simctl` | iOS Simulator control | iOS capture |
| `adb` | Android Debug Bridge | Android capture |
| `ffmpeg` | Video encoding | Social video export |
| `ffprobe` | Media metadata | Video validation |
| `playwright` | Browser automation | Motion composition |
| `sharp` | Image processing | Store composition |

## Limitations

- **Local-only**: Pipeline runs locally, not in CI by default
- **English-only**: Marketing copy is English by design
- **Manual checkpoints**: Graph View and Chat routes require manual verification
- **No store submission**: Pipeline generates assets; submission is a separate workflow

## References

- [Apple Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Google Play Preview Assets](https://support.google.com/googleplay/android-developer/answer/9866151)
- [App Deep Links (screens.md)](../../docs/wiki/screens.md)
