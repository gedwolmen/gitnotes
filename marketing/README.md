# Marketing Composition Package

> Standalone Motion/React composition package for deterministic social story preview and checkpoint rendering.

## Overview

This package provides:

- **Social Story Preview**: Animated story compositions (TitleCard → AppScreenshot → FeatureCallout → EndCard)
- **Deterministic Timeline**: Controls at 0, duration/2, and duration checkpoints
- **Image Preloading**: All images loaded before rendering to ensure consistent output
- **Diagnostics**: Visible overlay and CI/CD-friendly exit codes for missing images, missing Chromium, and unsupported configs
- **Reduced Motion**: Respects `prefers-reduced-motion` system setting
- **Frame Hashing**: Deterministic rendering produces identical frame hashes across runs

## Prerequisites

- **Node.js** >= 20.0.0
- **Chromium** (for Playwright tests)

### Installing Chromium

```bash
# Install Chromium via Playwright
npx playwright install chromium

# Or via the package script
yarn playwright:install
```

## Quick Start

### Installation

```bash
# From the marketing directory
yarn install
```

### Development

```bash
# Start the dev server
yarn dev

# Server runs at http://localhost:5173
```

### Production Build

```bash
yarn build
yarn preview
```

### Running Tests

```bash
# Run all tests
yarn test

# Run checkpoint tests specifically
yarn test:checkpoints

# Run with Playwright UI
npx playwright test --ui
```

## Architecture

```
marketing/
├── src/
│   ├── compositions/       # Slide components
│   │   ├── TitleCard.tsx
│   │   ├── AppScreenshot.tsx
│   │   ├── FeatureCallout.tsx
│   │   └── EndCard.tsx
│   ├── hooks/
│   │   └── useReducedMotion.ts
│   ├── page.tsx           # Main story page
│   ├── timeline.ts        # Deterministic timeline controls
│   ├── preload.ts         # Image preloader
│   ├── diagnostics.ts     # Error detection and reporting
│   ├── types.ts           # TypeScript types (consumes Todo 4 contracts)
│   └── main.tsx           # Entry point
├── tests/
│   └── checkpoints.test.ts # Three-checkpoint validation tests
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── playwright.config.ts
```

## Story Composition

### Default Story Flow

1. **TitleCard** (0 - duration/4): GitNotēs branding with tagline
2. **AppScreenshot** (duration/4 - duration/2): App interface screenshot
3. **FeatureCallout** (duration/2 - 3*duration/4): Feature highlight
4. **EndCard** (3*duration/4 - duration): Download CTAs

### Custom Configuration

```typescript
import { MarketingPage, createDefaultStory } from './page';
import { THEME_CLEAN_LIGHT } from './types';

const config = createDefaultStory({
  duration: 8000, // 8 seconds
  theme: THEME_CLEAN_LIGHT,
  width: 1080,
  height: 1920,
  slides: [
    { id: 'title', layout: 'hero', headline: 'My App', subtitle: 'Tagline', ... },
    // ... more slides
  ],
});

<MarketingPage config={config} showDiagnostics={true} />
```

## Timeline Checkpoints

The story provides three deterministic checkpoints:

| Checkpoint | Time | Expected Slide |
|------------|------|----------------|
| start | 0 | 0 (TitleCard) |
| middle | duration/2 | ~slides.length/2 |
| end | duration | slides.length-1 (EndCard) |

Click the colored dots at the bottom of the preview to seek to specific checkpoints.

## Diagnostics

When `showDiagnostics={true}`, an overlay displays:

```
[DIAGNOSTICS]
Chromium: ✓ available
Images: ✓ all loaded
Status: ✓ healthy
```

### Exit Codes

For CI/CD integration:

| Code | Meaning |
|------|---------|
| 0 | Healthy - all checks passed |
| 10 | Chromium not available |
| 11 | Images failed to load |
| 12 | Unsupported slide config |

### Programmatic Access

```typescript
// Access diagnostics from window
const diag = window.__DIAGNOSTICS__;
if (!diag.healthy) {
  process.exit(diagnosticsToExitCode(diag));
}
```

## Reduced Motion

The package respects `prefers-reduced-motion`:

- System setting is automatically detected via Motion's `useReducedMotion`
- Manual override via `localStorage.setItem('gitnotes-reduce-motion', 'true')`
- Animation duration reduced to 0.3s when enabled

## Image Preloading

Images are preloaded before playback starts:

```typescript
const result = await preloadSlideImages(slides, 5000);
// result.allLoaded === true if all images loaded
// result.preloadTimeMs === time taken
// result.images === array of ImageLoadState
```

## Deterministic Rendering

Frame hashes are computed using SHA-256:

```typescript
const screenshot = await page.screenshot();
const hash = createHash('sha256').update(screenshot).digest('hex');
```

Two renders at the same checkpoint time will produce identical hashes.

## Todo 4 Store Contracts

This package **consumes** the following contracts from `scripts/marketing/store/`:

- `DeviceProfile` enum
- `StoreTheme` interface
- `SlideLayout` type
- `DEVICE_DIMENSIONS` constants
- `THEME_CLEAN_LIGHT` and `THEME_DARK_BOLD` themes

These are re-exported via `src/types.ts` to maintain standalone package isolation.

## Limitations

- **No FFmpeg encoding**: Todo 6 owns video encoding
- **No root workspace assumption**: Package is fully standalone
- **No Expo dependencies**: Package cannot import from the main app

## Contributing

1. Make changes in the `.worktrees/app-store-social-assets/` worktree
2. Run `yarn --cwd marketing install` to verify dependencies
3. Run `yarn --cwd marketing dev` to test changes
4. Run `yarn --cwd marketing test:checkpoints` to validate checkpoints

## References

- [Motion Documentation](https://motion.dev/docs/react-animation)
- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Apple Screenshot Specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
- [Google Play Preview Assets](https://support.google.com/googleplay/android-developer/answer/9866151)
