# GitNotēs Wiki

> Project knowledge base for contributors and AI agents.

> **Single-PR fixes and narrow bug-fix pages now live in [CHANGELOG.md](../../CHANGELOG.md)** at the repo root. The wiki is reserved for architecture, services, contributor guides, and feature deep-dives. When you fix a bug, add an entry to `CHANGELOG.md` (grouped by date descending) — only architecture-level changes get a new wiki page.

## Pages

### Contributor guides

| Page | Description |
|------|-------------|
| [Architecture](./architecture.md) | Project structure, key modules, data flow |
| [Services](./services.md) | Service layer design and responsibilities |
| [Development Guide](./development-guide.md) | Local setup, build, test, lint workflow |
| [Testing Guide](./testing-guide.md) | Test patterns, mocking, CI configuration |
| [E2E Sync Testing](./e2e-sync-testing.md) | E2E test harness: 6 scenarios × 2 modes, timing instrumentation, push-trigger verification |

### Architecture & sync engine

| Page | Description |
|------|-------------|
| [Sync Engine](./sync-engine.md) | Git sync architecture, push model, error handling |
| [Sync Engine Modes](./sync-engine-modes.md) | Per-repo clone vs API mode selection, defaults, switching, large-repo preflight |
| [Sync Write Modes](./sync-write-modes.md) | Sync contract: clone stage-then-push vs API write-through; blocking overlay; import-on-add |
| [Clone-Perf Optimization](./clone-perf-optimization.md) | Five ordered patches closing the simulator freeze gap: `noCheckout` + batched full checkout, 3-concurrent-pull dedup, LFS-after-clone, UTF-8 fast path, depth-3 floor measurement flag |
| [Git Core Hardening](./git-core-hardening.md) | git-core test-campaign fixes: binary decode integrity, case collisions, auth/preflight, API batch writes, pull/reconcile fixes (#876–#892) |

### Features

| Page | Description |
|------|-------------|
| [AI Integration](./ai-integration.md) | Vercel AI SDK, providers, token budgeting |
| [AI Providers](./ai-providers.md) | Provider types, Anthropic defaults, adding providers |
| [Pro Paywall & Monetization](./paywall-pro.md) | StoreKit 2 revenue model: 30-day trial / $2.99 mo / $40 lifetime, grandfathering, show-locked feature UX, gating map, impressions & analytics, restore flow, intro-eligibility policy, legal links, bento grid layout (#921), store setup checklist |
| [Branding Asset Pipeline](./branding-pipeline.md) | one-master-SVG → generated icons/splash/favicon via sharp (`npm run branding`, #930) |
| [Daily Quote Settings](./daily-quote-settings.md) | Dataset audit/expansion to 454 verified quotes with sources + two new settings: AI personalization toggle and source visibility toggle (#933, #934) |
| [Quote Content Policy & Regression Gate](./quote-content-policy.md) | AGENTS.md Quote Content Policy enforced by `__tests__/data/philosopherQuotes.policy.test.ts`: schema/source/uniqueness/count/keyword-scan/tag-vocabulary checks with a documented secular allowlist (#933) |
| [Explore Repo Hub](./explore-repo-hub.md) | Hub page for selected repo with Browse Files / Pull Requests / Issues / branch selector; multi-provider data layer (#937) |
| [Filter Persistence](./filter-persistence.md) | Filter state architecture and AsyncStorage |
| [Importers](./importers.md) | Removed Google Keep and Apple Notes importers, for later re-integration |
| [Pro Dev Override](./pro-dev-override.md) | `__DEV__`-only iOS-simulator override that forces Pro gate for QA — NOT a payment bypass; RevenueCat unchanged; gate triple `__DEV__ && Platform.OS==='ios' && !Device.isDevice` |
| [Token Removal Repo Cascade](./repo-removal-cascade.md) | removing a token also removes its synced repos, with a confirmation warning |
| [Report Bugs & Feature Requests](./report-issue-links.md) | Settings About-row + onboarding footer link to `github.com/gedwolmen/gitnotes/issues`, i18n'd across all six locales |

### Theming, i18n, quality

| Page | Description |
|------|-------------|
| [Theme & Styling](./theme-styling.md) | NativeWind v5, theme tokens, dark mode |
| [i18n](./i18n.md) | Localization setup, adding languages, testing |
| [v1.5.0 App Store Rejection](./v1.5.0-app-store-rejection.md) | 2.1.0 App Completeness SIGABRT on first launch — root cause: `useNavigation()` outside `NavigationContainer` in `useProGate.ts`; fix on `main` (`c5362e86`) then hardened by splitting `useProGate` into `useProGate()`/`useProStatus()` (#1004) |
| [Code Quality Findings](./codeql-quality-findings.md) | GitHub "Security and quality" Standard findings: 46 dead-code removals across 28 files (`yarn ts:check` / `yarn jest` 2752 tests / `yarn eslint` / `yarn format:check` all green); 78 findings remain — mostly `'worklet'` directives and a CodeQL `__setProState` resolution false-positive — documented for manual dismissal |
| [Security & Dependabot Alerts](./security-dependabot.md) | GitHub security surface, `uuid` fix via yarn resolutions (#4), `image-size` alerts deferred (no patched release, build-time only) |

### Test reports

| Page | Description |
|------|-------------|
| [Git Test E2E Report](./git-test-e2e-report.md) | Live round-trip timings against `test-notes` for all 12 scenarios (6 clone-mode + 6 API-mode) with per-action breakdown, syncTiming instrumentation seam, and Mac vs simulator scope |
| [Git Test Big Repo](./git-test-big-repo.md) | Same 12-scenario matrix on a 429-file / 11MB / 28-commit synthetic repo (local bare remote) — linear scaling, no quadratic blowup; small-vs-big comparison table |

## Quick Start

```bash
# Install
yarn install

# Run
yarn ios          # iOS
yarn android      # Android
yarn dev          # Web

# Test
yarn ts:check     # Type check
yarn jest         # Run tests
yarn eslint . --ext .ts,.tsx  # Lint
```

## Project Structure

```
src/
├── components/       # Reusable UI components
├── contexts/         # React contexts (ThemeContext, NoteContext)
├── hooks/            # Custom React hooks
├── i18n/             # Localization (en/es/fr/de/ja/ko)
├── models/           # TypeScript interfaces
├── navigation/       # Navigation configuration
├── screens/          # Screen components
├── services/         # Business logic (AI, Git, quotes, etc.)
├── stores/           # Zustand stores
├── theme/            # NativeWind theme configuration
└── types/            # Shared type definitions
```

## Key Files

| File | Purpose |
|------|---------|
| `AGENTS.md` | Rules for AI coding agents |
| `CHANGELOG.md` | Single-PR fixes and narrow bug-fix entries, grouped by date descending |
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `jest.config.js` | Jest configuration |
| `babel.config.cjs` | Babel configuration |
