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
| [E2E Sync Testing](./e2e-sync-testing.md) | E2E test harness: 6 scenarios × 2 modes, timing instrumentation, push-trigger verification, staged-visibility sub-checks, blocking overlay, remote verification |
| [Clone-Perf Optimization](./clone-perf-optimization.md) | Five ordered patches closing the simulator freeze gap: `noCheckout` + batched full checkout, 3-concurrent-pull dedup, LFS-after-clone, UTF-8 fast path, depth-3 floor measurement flag |
| [v1.5.0 App Store Rejection](./v1.5.0-app-store-rejection.md) | 2.1.0 App Completeness SIGABRT on first launch — root cause: `useNavigation()` outside `NavigationContainer` in `useProGate.ts`; fix on `main` (`c5362e86`) then hardened by splitting `useProGate` into `useProGate()`/`useProStatus()` (#1004) |
| [Git Test E2E Report](./git-test-e2e-report.md) | Live round-trip timings against `test-notes` for all 12 scenarios (6 clone-mode + 6 API-mode) with per-action breakdown, syncTiming instrumentation seam, and Mac vs simulator scope |
| [Git Test Big Repo](./git-test-big-repo.md) | Same 12-scenario matrix on a 429-file / 11MB / 28-commit synthetic repo (local bare remote) — linear scaling, no quadratic blowup; small-vs-big comparison table |
| [ForegroundSync Busy-Loop](./foreground-sync-busy-loop.md) | `ForegroundSync` skip-spam fix (#984): log throttle (10s window), busy-skip `consecutiveSkips` counter, jittered exponential interval back-off via self-scheduling `setTimeout` |
| [gitFs Write-Path Text Fast Path](./gitfs-write-text-fast-path.md) | `gitFs.writeFile` now decodes `Uint8Array` payloads for text extensions (`md/norg/org/txt/json`) with `fatal:true` UTF-8 + base64 fallback — kills the write-side base64 round-trip (#986) |
| [DevMenu Floating "Tools" Button Overlap](./dev-menu-fab-overlap.md) | expo-dev-menu's FAB defaults to the top-right corner over the header action buttons, so Edit/Add-note taps opened the DevMenu; dev-only startup disable + `EXDevMenuShowFloatingActionButton=false` default + `useProGate` split (#977, #1004) |
| [Push Stuck — 10-min Timeout + Cancel Escape](./push-timeout-cancel.md) | `git-receive-pack` pushes now fail fast (60s instead of 600s; downloads keep 600s) and `SyncBlockOverlay` gains a Cancel button that aborts the in-flight git HTTP request via `cancelInflightGitHttp()` — no more force-quit to escape a stuck push (#1013) |
| [Clone Cancel — Real HTTP Abort + Unstuck Tabs](./clone-cancel-abort.md) | `handleCancelClone` now calls `cancelInflightGitHttp()` so a clone stuck inside the HTTP fetch actually aborts (was only checked in `onProgress`, which never fires while stuck); the modal's backdrop no longer deadens the tab bar (#1016, #1017) |
| [Clone-Mode Idle Push — Deterministic 3-min Window](./clone-idle-push.md) | `onStagedChanged` only restarts the idle push countdown when the staged SET changes (pushProgress/isPushing churn no longer resets it), and `flushStaged` re-reads staged state before enqueueing — no more stranded unpushed commits (#1020) |
| [ForegroundSync Pull — Skip Idle LFS Walk](./pull-idle-lfs-skip.md) | `pullWithFastForward` runs the LFS pointer walk only when the remote ref actually moved — idle pulls (nothing new) skip the full working-tree walk, plus a `__DEV__` phase-timing log (#1022) |
| [gitHttp True Streaming — Lazy Chunk Yield](./git-http-true-streaming.md) | `gitHttp` now returns a lazy generator — the response body is read and yielded one chunk at a time as the consumer pulls, instead of buffering the whole packfile before yielding; cancel/timeout abort semantics preserved (#1021) |
| [Metro Watch — Exclude Dogfood Output](./metro-watch-dogfood-exclude.md) | `dogfood-output/` (screenshots/traces/videos written on every QA interaction) is now in Metro's `blockList` and gitignored, so artifact writes no longer churn the bundler watcher and trigger rebuilds (#1023) |
| [Clone-Mode Bulk Delete — Resurrecting Notes](./bulk-delete-clone-resurrect.md) | bulk delete now branches by mode: clone commits each delete locally (push:false) immediately so the next pull can't resurrect the file; API keeps the one-write batch (#1030) |
| [LFS Pointer Scan — Parallel Walk](./lfs-scan-parallel-walk.md) | `scanForPointers` walks the working tree with bounded concurrency (`SCAN_CONCURRENCY=16` via `mapLimit`) instead of one serial bridge round-trip per file (#980) |
| [Todo Pull Parse Errors — Silent Data Loss Fix](./todo-pull-parse-fix.md) | `pullTodosFromRepo` no longer silently swallows todo JSON parse errors: `{`-content guard skips non-JSON files silently, genuine failures log `error` with the file path, and a skipped-count summary surfaces the loss (#1008) |
| [ForegroundSync Watchdog — Sync Health Surfacing](./foreground-sync-health.md) | `ForegroundSyncService` now tracks `syncHealth` (`idle/syncing/ok/failed/timedout` + failure count), exposed via `getForegroundSyncHealth()` / `useForegroundSyncHealth()` and a Settings → Sync status row — a stalled pull is no longer invisible (#1007) |
| [gitHttp Packfile Buffering — Remove Redundant Copy](./git-http-packfile-buffering.md) | `gitHttp` yields raw response chunks instead of merging them into one `Uint8Array`, halving peak packfile memory on large clones; true disk streaming blocked by isomorphic-git's internal `collect()` (follow-up) (#982) |

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
