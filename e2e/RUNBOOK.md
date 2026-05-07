# Maestro E2E Execution Runbook

## Prerequisites

### macOS (iOS testing)

1. Xcode 16+ with iOS Simulator runtime
2. Node.js >= 20.18
3. Yarn classic (1.x)
4. Maestro CLI: `curl -Ls 'https://get.maestro.mobile.dev' | bash`

### macOS/Linux (Android testing)

1. Android Studio with emulator (API 34)
2. Java 17
3. Maestro CLI

## Quick Start

```bash
# Install dependencies
yarn install

# iOS: Boot simulator + build app
yarn e2e:ios:boot
npx expo run:ios

# iOS: Run smoke tests
yarn e2e:ios:smoke

# iOS: Run full suite
yarn e2e:ios:full

# Android: Boot emulator + build app
bash e2e/scripts/boot-android-emulator.sh
cd android && ./gradlew assembleDebug && adb install app/build/outputs/apk/debug/app-debug.apk

# Android: Run smoke tests
yarn e2e:android:smoke

# Android: Run full suite
yarn e2e:android:full
```

## Validation Commands

```bash
# Validate testID contract (no duplicates, no empty, no index-only)
yarn e2e:testid:validate

# Validate coverage matrix
yarn e2e:coverage:validate

# Jest unit/integration tests
yarn test

# TypeScript check
yarn ts:check
```

## CI Pipeline

The CI workflow (`.github/workflows/ci.yml`) runs three jobs:

1. **build-test**: TypeScript check + lint + format + Jest + testID validation
2. **maestro-ios**: Maestro iOS smoke tests (retry once on failure)
3. **maestro-android**: Maestro Android smoke tests (retry once on failure)

All three are required checks.

## Test Structure

```
e2e/
├── config.yaml                    # Maestro global config
├── coverage-manifest.json         # 302 interactive element entries
├── TESTID_CONTRACT.md             # testID naming convention
├── maestro-mcp.json               # Maestro MCP config
├── ios/
│   ├── smoke/                     # Smoke tests (fast, core flows)
│   │   ├── navigation.yaml
│   │   └── home.yaml
│   └── full/                      # Full exhaustive suites
│       ├── notes-list.yaml
│       ├── todos.yaml
│       ├── settings.yaml
│       └── templates.yaml
├── android/
│   ├── smoke/
│   │   └── navigation.yaml
│   └── full/
│       ├── notes-list.yaml
│       ├── todos.yaml
│       └── settings.yaml
├── scripts/
│   ├── boot-ios-simulator.sh
│   ├── boot-android-emulator.sh
│   ├── seed.ts
│   ├── reset-app.ts
│   ├── validate-testids.ts
│   └── validate-coverage.ts
├── shared/
├── fixtures/
```

## Failure Triage

### Test fails to find element by testID

1. Check testID exists: `yarn e2e:testid:validate`
2. Check app is built with latest code
3. Check element is visible on screen (not in hidden modal/tab)

### Test times out

1. Check simulator/emulator is booted
2. Check app is installed and launches
3. Add `extendedWait` before the failing step

### Flaky tests

1. Run with retry: Maestro supports `--retry` flag
2. CI uses retry-once policy automatically
3. Report flake in `.sisyphus/evidence/`

## Evidence Artifacts

All evidence saved to `.sisyphus/evidence/`:

- `task-{N}-{scenario-slug}.txt` - validation output
- `maestro-ios-results.xml` - JUnit results from CI
- `maestro-android-results.xml` - JUnit results from CI
