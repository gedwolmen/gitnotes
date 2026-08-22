# GitNotēs Wiki

> Project knowledge base for contributors and AI agents.

## Pages

| Page | Description |
|------|-------------|
| [Architecture](./architecture.md) | Project structure, key modules, data flow |
| [Services](./services.md) | Service layer design and responsibilities |
| [Development Guide](./development-guide.md) | Local setup, build, test, lint workflow |
| [Testing Guide](./testing-guide.md) | Test patterns, mocking, CI configuration |
| [Sync Engine](./sync-engine.md) | Git sync architecture, push model, error handling |
| [Sync Engine Modes](./sync-engine-modes.md) | Per-repo clone vs API mode selection, defaults, switching |
| [Sync Write Modes](./sync-write-modes.md) | Sync contract: clone stage-then-push vs API write-through; blocking overlay; import-on-add |
| [AI Integration](./ai-integration.md) | Vercel AI SDK, providers, token budgeting |
| [i18n](./i18n.md) | Localization setup, adding languages, testing |
| [Theme & Styling](./theme-styling.md) | NativeWind v5, theme tokens, dark mode |
| [AI Providers](./ai-providers.md) | Provider types, Anthropic defaults, adding providers |
| [Filter Persistence](./filter-persistence.md) | Filter state architecture and AsyncStorage |
| [Importers](./importers.md) | Removed Google Keep and Apple Notes importers, for later re-integration |
| [Git Core Hardening](./git-core-hardening.md) | git-core test-campaign fixes: binary decode integrity, case collisions, auth/preflight, API batch writes, pull/reconcile fixes (#876–#892) |
| [Stage → Push UX](./stage-push-ux.md) | no row locks, vanish-immediate deletes, spinner-free grayed push buttons, determinate progress ring, body-text notifications, resume-on-foreground |
| [Push Button Missing on Folder-Backed Updates](./push-button-update-fix.md) | `LocalGitWriter` normalizes leading-slash `filePath`s so folder-backed note/canvas/todo updates commit locally and surface the push button |
| [Token Removal Repo Cascade](./repo-removal-cascade.md) | removing a token also removes its synced repos, with a confirmation warning |
| [Token Scope Error Messaging](./token-scope-error-messaging.md) | 403s surface needed token scopes in the sync message and token-add UI |
| [Pro Paywall & Monetization](./paywall-pro.md) | StoreKit 2 revenue model: 30-day trial / $2.99 mo / $40 lifetime, grandfathering, show-locked feature UX, gating map, impressions & analytics, restore flow, intro-eligibility policy, legal links, bento grid layout (#921), store setup checklist |
| [Branding Asset Pipeline](./branding-pipeline.md) | one-master-SVG → generated icons/splash/favicon via sharp (`npm run branding`, #930) |
| [Daily Quote Settings](./daily-quote-settings.md) | Dataset audit/expansion to 454 verified quotes with sources + two new settings: AI personalization toggle and source visibility toggle (#933, #934) |
| [Quote Content Policy & Regression Gate](./quote-content-policy.md) | AGENTS.md Quote Content Policy enforced by `__tests__/data/philosopherQuotes.policy.test.ts`: schema/source/uniqueness/count/keyword-scan/tag-vocabulary checks with a documented secular allowlist (#933) |
| [Explore Repo Hub](./explore-repo-hub.md) | Hub page for selected repo with Browse Files / Pull Requests / Issues / branch selector; multi-provider data layer (#937) |
| [Settings — Add Repo Fixes](./settings-add-repo-fixes.md) | Invisible primary-button fix + repo list not loading after adding a token + busy-state re-entry guard on Add-Repo picker (#936) |
| [iPad Multi-Column Card Collapse Fix](./ipad-multicolumn-card-collapse-fix.md) | SwipeableListItem root `width: '100%'` so multi-column FlatList cards fill their column (#940, #941) |
| [Add Repo Picker — Clone Progress & First-Connect Fixes](./add-repo-picker-clone-progress.md) | Inline clone progress in the repo picker (no stacked native modal), manual-Add spinner padding, connectHost hydrating GitHubService, delete-note false-failure fix (#953, QA #932) |
| [Add Repo Progress & Live Pull](./add-repo-progress-live-pull.md) | Throttled clone progress (createThrottledEmitter), pull-phase yielding (yieldToMain), pull shown in the same progress bar, animated status line, always-refresh stores after add-time import |
| [Clone-Phase Yield Patch](./clone-phase-yield-patch.md) | isomorphic-git pack-indexing yields via patch-package (clone freeze), corruption-classifier over-match fix (zero-content imports), CI guard |
| [Thought Dump Repo Picker](./thought-dump-repo-picker.md) | "Save to \<repo\> · \<branch\>" picker row + repo/branch modal, `ThoughtDumpRepoPreferenceService` persistence, distinct save errors, and empty-state disambiguation |
| [Code Quality Findings](./codeql-quality-findings.md) | GitHub "Security and quality" Standard findings: 46 dead-code removals across 28 files (`yarn ts:check` / `yarn jest` 2752 tests / `yarn eslint` / `yarn format:check` all green); 78 findings remain — mostly `'worklet'` directives and a CodeQL `__setProState` resolution false-positive — documented for manual dismissal |
| [Settings Keyboard & Quote Grouping](./settings-keyboard-quote-grouping.md) | iOS keyboard no longer covers inputs in Settings/AI (ModelSelector KAV, RenderStyleEditor scroll insets, ChatScreen persist-taps) + Daily Quote settings grouped under their own section |
| [Floating Button Collision — Crash Fix](./floating-button-collision-crash-fix.md) | Re-entrancy guard on `publishButtonRect` + collision listener reads published rect so both FABs coexist without a stack-overflow recursion killing the AI button's hold animation |
| [Security & Dependabot Alerts](./security-dependabot.md) | GitHub security surface, `uuid` fix via yarn resolutions (#4), `image-size` alerts deferred (no patched release, build-time only) |
| [Report Bugs & Feature Requests](./report-issue-links.md) | Settings About-row + onboarding footer link to `github.com/gedwolmen/gitnotes/issues`, i18n'd across all six locales |
| [Pro Dev Override](./pro-dev-override.md) | `__DEV__`-only iOS-simulator override that forces Pro gate for QA — NOT a payment bypass; RevenueCat unchanged; gate triple `__DEV__ && Platform.OS==='ios' && !Device.isDevice` |
| [E2E Sync Testing](./e2e-sync-testing.md) | E2E test harness: 6 scenarios × 2 modes, timing instrumentation, push-trigger verification, staged-visibility sub-checks, blocking overlay, remote verification

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
| `package.json` | Dependencies and scripts |
| `tsconfig.json` | TypeScript configuration |
| `jest.config.js` | Jest configuration |
| `babel.config.cjs` | Babel configuration |
