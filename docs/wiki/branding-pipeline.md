# Branding Asset Pipeline

> One master SVG → every app-branding asset via a single command. Implemented per issue #930.

## Workflow

Maintain **one** master file:

```text
assets/logo.svg
```

Regenerate all branding assets:

```bash
npm run branding        # generate
npm run branding:check  # verify outputs exist + correct dimensions (exit non-zero on failure)
```

Then build/run normally:

```bash
npx expo start          # dev
npm run branding && eas build   # production
```

## Generated assets

`scripts/generate-branding.js` reads `assets/logo.svg` and writes to `assets/generated/` (auto-created, safe overwrite, deterministic):

| File | Size | Purpose |
|------|------|---------|
| `icon.png` | 1024×1024 | iOS / Expo generic app icon (no rounded corners — iOS masks) |
| `adaptive-icon.png` | 1024×1024 | Android adaptive icon **foreground** (transparent bg, artwork in safe zone) |
| `splash-icon.png` | 1024×1024 | Square splash source with transparent padding |
| `favicon.png` | 512×512 | Web favicon source |
| `monochrome-icon.png` | 1024×1024 | Android themed icon — grayscale depth mask |

Pipeline details:

- The SVG is supersampled (2048px), alpha-cropped to its bounding box, scaled to a target fraction of the canvas, and composited centered on a transparent square canvas. Aspect ratio is preserved, so artwork is always square and centered.
- Icon fraction 0.82 (padding for iOS mask); adaptive/monochrome 0.62 (inside Android's circular safe zone); splash 0.96 (on-screen size is controlled by `imageWidth`); favicon 0.85.
- Monochrome is a **grayscale depth mask**: each pixel's RGB is set to its BT.601 luminance of the source color, and alpha is preserved at full opacity. The SVG's distinct color sections naturally become distinct gray levels (e.g. three paths → three shades), so the monochrome icon keeps the visual depth of the full-color artwork where it is shown raw. Android still tints the alpha mask with the system theme color.

## Expo config (`app.json`)

All generated assets are wired in `app.json` (merge — every existing plugin/setting preserved):

```jsonc
{
  "expo": {
    "icon": "./assets/generated/icon.png",
    "ios": { "icon": "./assets/generated/icon.png" },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/generated/adaptive-icon.png",
        "backgroundColor": "#ffffff",
        "monochromeImage": "./assets/generated/monochrome-icon.png"
      }
    },
    "web": { "favicon": "./assets/generated/favicon.png" },
    "plugins": [
      [
        "expo-splash-screen",
        {
          "image": "./assets/generated/splash-icon.png",
          "imageWidth": 300,
          "resizeMode": "contain",
          "backgroundColor": "#ffffff",
          "dark": {
            "image": "./assets/generated/splash-icon.png",
            "imageWidth": 300,
            "resizeMode": "contain",
            "backgroundColor": "#0E0E0E"
          }
        }
      ]
    ]
  }
}
```

The `expo-notifications` plugin keeps its own `./assets/icon.png` reference (notification icon is separate from the app icon).

## Splash sizing decision

The logo renders at **~75% of device width, square**:

- `imageWidth: 300` (dp) ≈ 75% of a typical ~400dp phone (iPhone 375–428pt / Android 360–432dp land within ~70–83%).
- The square source + `resizeMode: contain` guarantees rendered height == width.
- Light splash uses `#ffffff`, dark uses `#0E0E0E` (the app's existing brand backgrounds).

## Changing the logo

1. Replace `assets/logo.svg` (keep the same artwork — one or more filled paths; the pipeline handles any square-ish viewBox).
2. `npm run branding`
3. Commit `assets/generated/` — **do not** gitignore it (EAS/cloud builds need the files at build time).

## Validation

```bash
npm run branding:check                 # file existence + dimensions
npx expo config --type public          # config parses, generated paths resolve
yarn ts:check && yarn eslint . --ext .ts,.tsx
```

## Script contract (`scripts/generate-branding.js`)

- Exits non-zero if `assets/logo.svg` is missing or generation fails.
- Creates `assets/generated/` automatically; overwrites stale outputs.
- `--check` mode verifies every expected file + dimension without regenerating.
- Deterministic PNG output (fixed compression level, no timestamps).
