# Changelog

All notable fixes and feature changes to GitNotēs are documented here.

> **Format**: loosely based on [Keep a Changelog](https://keepachangelog.com/), grouped by date descending. Each entry references the originating PR (when available) and names the area from the conventional-commit prefix.
>
> **Wiki**: the [GitHub Wiki](https://github.com/gedwolmen/gitnotes/wiki) is the public-facing main wiki — architecture, services, contributor guides, and feature deep-dives. Source-controlled editing surface is `docs/wiki/` in this repo; CI (`.github/workflows/sync-wiki.yml`) mirrors it to the GitHub Wiki on every merge to `main`. New single-PR fixes should be added here, not as new wiki pages.
>
> **History**: prior fixes (pre-2026-08) lived in single-PR wiki pages. Those pages were retired in [#1047](https://github.com/gedwolmen/gitnotes/pull/1047); their full diagnostic content is preserved in git history via `git log -p -- docs/wiki/<file>.md`.

## 2026-08-26 — GPL-3.0 Relicensing

### chore(license) — Convert repository from MPL-2.0 to GPL-3.0

**What:** Converted GitNotēs from Mozilla Public License 2.0 to GNU General Public License v3.0 as a derivative work of GitSync.

**Details:**
- Replaced `LICENSE` with full GPL-3.0 license text
- Updated `package.json` license field from `MPL-2.0` to `GPL-3.0`
- Updated README.md license badge and description
- Created `NOTICE` file with GitSync provenance and derivative work attribution
- Created `docs/wiki/gitsync-gpl-provenance.md` documenting GPL obligations
- This product is now a GPL-3.0 derivative of GitSync at commit `9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a`
- Deliberate purge of all legacy isomorphic-git data and sync infrastructure
- **App-store release is blocked pending explicit owner legal clearance** — this is a hard prerequisite

**Related:**
- [GitSync](https://github.com/ViscousPot/GitSync) — GPL-3.0 Flutter/Rust Git client
- See [NOTICE](NOTICE) and [docs/wiki/gitsync-gpl-provenance.md](docs/wiki/gitsync-gpl-provenance.md) for provenance details

## [Unreleased] — git2-rs migration

### chore(migration) — git-free husk, data purge, and git2-rs native rebuild

**What:** The entire isomorphic-git backend was ripped out and replaced with a git2-rs native module. Between removal and re-implementation, the app existed as a "git-free husk" with no working Git operations at all. A deliberate data purge runs on first launch to clear all legacy state.

**Migration summary:**
- Removed `isomorphic-git` as a dependency along with all JavaScript Git plumbing (`gitHttp`, `gitFs`, `CommitService` clone-mode paths, `LocalGitWriter`, `ForegroundSyncService` clone orchestration, `CloneSyncService`, `ClonePendingQueue`, `ClonePushTriggers`)
- Removed legacy sync infrastructure: `StagingService`, `StagePushScheduler`, `stageStore`, `StagingService.stageDelete` paths
- Purged all stored legacy Git data on first launch via `LegacyGitPurgeService`: credentials/tokens in SecureStore, cloned repository directories in `documentDirectory`, sync queues and operation registries in AsyncStorage, unpushed commit records
- New `modules/expo-git2-rs/` Rust native module provides all Git operations through `git2-rs` bindings, exposed to TypeScript via `Git2Client`
- New `src/features/git2/` feature set: auth, repositories, file browser, commit history, diff viewer, branch/remote/tag management, sync engine with state machine, conflict resolution, settings, background tasks
- Some legacy services (`SyncEngineService`, `GitService`, `GitFsService`, `NoteSyncQueueService`, `GitHubService`, `AuthService`) remain as compatibility shims or for API-mode paths; they are not used by the git2-rs UI
- App-store release remains blocked pending legal clearance

**Related:**
- [NOTICE](NOTICE) for complete source-path provenance
- [docs/wiki/gitsync-gpl-provenance.md](docs/wiki/gitsync-gpl-provenance.md) for GPL obligations

### refactor(core) — Migrate from isomorphic-git to git2-rs native module

**What:** Replaced the JavaScript-based isomorphic-git implementation with a native git2-rs module for Git operations.

**Details:**
- New `modules/expo-git2-rs/` native module with Rust git2-rs bindings
- New `src/features/git2/` UI feature set: file browser, history, diff viewer, branch/remote/tag management, sync settings
- Removed all legacy isomorphic-git infrastructure and dependencies
- Deliberate purge of all legacy Git device data at first launch (via `LegacyGitPurgeService`)
- This is a development-only build. **App-store release is blocked pending explicit owner legal clearance.**

**Git2Client capabilities:**
- Clone, fetch, pull, push, commit operations
- Branch management (list, create, checkout, delete)
- Remote management (list, add, remove)
- Tag operations (available in Rust, exposed to UI)
- File status and staging
- Commit history and diff viewing

**Not yet available (future work):**
- Merge and rebase operations
- Full conflict resolution with 3-way merge
- SSH authentication

**Build from source:**
```bash
# iOS (requires Rust toolchain)
cd modules/expo-git2-rs/rust
rustup default stable
cargo build --release
cd ../..
yarn ios

# Android (requires Rust toolchain)
cd modules/expo-git2-rs/rust
cargo build --release
cd ../..
yarn android
```

**Related:**
- [NOTICE](NOTICE) for complete source-path provenance
- [docs/wiki/gitsync-gpl-provenance.md](docs/wiki/gitsync-gpl-provenance.md) for GPL obligations

## [Unreleased] — Write-through clone mode

### refactor(sync) — Clone mode is now write-through

**What:** Clone mode now commits and pushes immediately when online (8s budget), queues offline changes in a durable pending queue, and blocks on `ConflictResolverScreen` with editor-first UX on conflict. Previously clone mode committed locally and required a separate push step.

**PRs:** #1299 (foundation), #1300 (entry points), #1301 (push callers), #1302 (triggers + settings)

**Breaking:** None — clone mode was previously an opt-in beta feature.

**Details:**
- New `CloneSyncService` with `save`, `tryPushNow`, `pushPending` — all pushes go through one pipeline
- New `ClonePendingQueue` with AsyncStorage durability and exponential backoff retry
- New `ClonePushTriggers` — foreground-active, online-transition, 3-min idle, OS background triggers
- FAB and PushScreen now use event subscription instead of 30s polling
- ConflictResolverScreen now shows editor-first UX for text conflicts (Save button only, no Keep mine/Keep theirs)
- Settings: Auto-push on idle (3 min) and Background-task push toggles
- i18n: 6 locales updated with clone mode description

## 2026-08-26

### Push pre-pulls origin into local before attempting the push

**fix(git)** — `LocalGitWriter.push` now runs `GitFsService.pullWithFastForward` *before* the push attempt (it was previously only run on push-rejection as a retry). When origin has diverged from local, the conflict is detected and surfaced via `ConflictBanner` / Conflicts screen **before** the push has even been tried — instead of after the push has failed and forced a retry. The post-rejection pull fallback is kept for the rare case where origin moves during the in-flight push. Cost in the common path (local is ahead of origin): one extra `fetch` + resolveRef call; `git.fastForward` no-ops when local is already ahead.

### Push-timeout alert offers a Pull action

**fix(ui)** — When `LocalGitWriter.push` times out after 60s, the alert now offers a real **Pull** button instead of telling the user to "Pull and try again" without a way to do so. Tapping it runs `pullFromSingleRepo(repoPath)` for the active repo. Applied to both the `FloatingPushButton` long-press flow and the `PushScreen.handlePushAll` flow.

### Floating push button shows optimistic count + spinner while commits are in flight

**fix(ui)** — `FloatingPushButton` now reflects an in-flight local commit immediately. `noteStore.createNote` (clone mode) and `noteStore.updateNote` (clone-mode rename) wrap their `CommitService.commit` calls in `gitOperationRegistry.begin({kind:'upsert'|'rename', status:'running'})` and `succeed`/`fail` on completion. The FAB subscribes to `useGitOperationStore` and, in clone mode, adds the count of those running ops to its displayed number — so the button appears the moment the user taps save, before the local git commit completes — and swaps the cloud-upload icon for an `ActivityIndicator` (badge background also swaps to the primary color) so the user sees that work is happening. The display reverts to the real unpushed-commit count once the op succeeds.

### Unify pending-work indicator into a single floating push button

**fix(ui)** — `FloatingPushButton` is now the only surface for "unpushed work" pending notification. In **clone mode** it counts unpushed git commits (`UnpushedCommitsService.count`); in **API mode** it counts pending sync-queue items for the active repo+branch (`NoteSyncQueueService.getAll`, filtered). Each mode refreshes on its own trigger (commit revision + 30s poll for clone; queue subscription for API). The long-press action is also mode-aware: clone mode pushes unpushed commits as before; API mode drains the queue then pulls. The duplicate top-right `UnpushedQueueBadge` rendered inside `NotesListScreen` is removed — it tracked a different counter and caused two push indicators to appear at once.

### Immediate floating push-button refresh (#1287)

**fix(git)** — Clone-mode writes and deletes performed through `LocalGitWriter` now increment the Git activity revision immediately after their local commit succeeds. The floating push button refreshes its unpushed-commit count at once rather than waiting for its 30-second polling interval.

### CI: clear 8 remaining failures after #1284 (#1285)

**fix(sync)** — `ForegroundSyncService.isForegroundSyncInFlight()` no longer returns true forever after a pull times out: `pendingBackgroundWork` stays as the "skip a new foreground sync while the gate cycle is held" gate, but the in-flight predicate drops it so the UI releases the busy state. `LocalGitWriter.ensureOnBranch` passes the full `refs/heads/<branch>` ref to `git.checkout` instead of the short ref, completing the HEAD-ref-repair path from #1189.

**feat(ui)** — Notes list now shows a persistent cloud-upload badge (`icon-cloud-upload` testID + count) when there are pending queue items, so users can see unpushed work between transient activity affordances. Hidden during active sync.

**fix(ui)** — `CloneProgressModal` clone progress now shows the cycling-dot alive indicator (`.` → `..` → `...` at 400ms) when the total size is unknown, instead of a static label.

**test(infra)** — Added a `@shopify/react-native-skia` jest mock (mapped via `jest.config.js`) so canvas-touching suites render without the native binary.

**test(sync)** — `OnboardingScreen.pro-gate` mocks `useAccounts`/`useAuth` so the screen renders without `AccountsProvider`. `GitSyncGate` "throwing drain body" test switched from `mockRejectedValueOnce` to `mockRejectedValue` so the retry-clearing-by-default path doesn't mask the error. `git-state-ui` sync-button-on-cloud-icon test (removed when FAB replaced it in #1249) marked `.skip`. `header-blur` padding assertion updated to the wrapping View introduced by #1278.

### CI: backfill i18n locales and align 4 stale tests with #1249 (#1284)

**fix(i18n)** — Recent PRs added 4 keys to `en.json` (`common.connecting`, `settings.unpushedCommitsTitle`, `settings.unpushedCommitsBody`, `hints.settings.pauseForegroundSync`) without mirroring them in `es/fr/de/ja/ko`. The i18n-key-parity test treated every missing key as a failure and broke CI on every locale. Translations backfilled for all 5 locales.

**test(sync)** — Four test files were left referring to the staging layer deleted by #1249 (`StagingService`, `stageStore`). Updated to assert the new commit-on-save flow: `HomeScreen.color-select` asserts `NoteSyncQueueService.enqueueNoteUpsert`; `todo-delete-sync` and `notes-delete-lock` drop drain-on-save assertions (#927 tracks the API-mode write-through gap); `sync-locking.integration` S2 checks the queue holds the mutation, S3 marked `.skip`. Before: 14 suites / 27 tests failed. After: 9 suites / 13 tests fail (separate categories: Skia mocks, `AccountsProvider` wrap, behavior gaps in `localGitWriter` / `GitSyncGate` / `ForegroundSyncService` / `git-state-ui` / `header-blur` / `CloneProgressModal`).
### iPad Notes grid shows all Markdown files (#1280)

**fix(ui)** — `SwipeableListItem` now uses `flex: 1` instead of claiming the full row with `width: '100%'`, so every Markdown note remains visible in its assigned iPad multi-column grid slot. The regression test covers four notes in a two-column layout while preserving single- and three-column coverage.

### Push screen bottom button spacing (#1281)

**fix(ui)** — Added `mb-3` to the "Push N commits" `TouchableOpacity` on `PushScreen` so the button has visible breathing room below it instead of sitting flush against the bottom edge of the screen.

## 2026-08-25

### Git Sync: Remove staging, move to commit-based model (#1249)

**refactor(sync)** — Replaces Clone-mode stage-then-push with isomorphic-git commit-on-save + explicit push-with-diff. `CommitService.commit()` creates local `push:false` commits on every save. `UnpushedCommitsService` tracks unpushed commits. Push triggers: FAB press-and-hold, Push/Push-all buttons on PushScreen, 3-min foreground idle, OS background task (≤10 files). API mode unchanged.

**fix(sync)** — Fixes 19 bugs: FloatingPushButton replaces FloatingStageButton; full-page spinner during conflict resolution; pull-to-refresh spinner positioning; push auth error surfaces real message; Settings sync-frequency defaults off for new users; folder selector shows current branch; custom-folder notes persist; and more.

**fix(ui)** — Removes Sync button from Notes toolbar. Canvas list shows previews. Template editor full-width on iPad.

**docs** — Updates 10 wiki pages, removes all staging/StagePushScheduler/StagingService references.

## 2026-08-24

### Play Console Deobfuscation Warning — EAS Mapping Upload Setup (#1046)

**chore(android)** — Added wiki documentation for EAS mapping-file auto-upload setup. The Play Console warning for version code 10 is resolved by enabling "Auto-upload mapping files" in EAS Project Settings → Submit → Google Play Store. Wiki page added at `docs/wiki/eas-mapping-upload.md`.

## 2026-08-23

### Simulator Keychain Entitlement (#1036)

**fix(sync)** — `expo-secure-store` and `expo-notifications` no longer throw `ERR_KEY_CHAIN` / `ERR_NOTIFICATIONS_KEYCHAIN_ACCESS` on the iOS simulator. A new config plugin (`plugins/withKeychainAccessGroup.js`) injects `keychain-access-groups` into the entitlements plist at prebuild time so the generated `ios/` keeps the entitlement across `expo prebuild` runs.

### Hide push button in API mode (#1035)

**fix(sync)** — `StagingService.pushStaged` and `StagePushScheduler.drainPushQueue` no longer get stuck in a grayed-spinner state after a long-held sync-gate cycle or a slow push. Two race windows fixed: state-reset moved into the OUTER `finally`, plus a `forceUnlockPushState()` escape hatch for `SyncBlockOverlay` cancel handlers and mode switches. Large repos now recommend API mode and the API warning is dropped.

## 2026-08-22

### Clone-mode bulk delete can't resurrect (#1030)

**fix(clone)** — bulk delete in clone mode no longer leaves files in the working tree where the next ForegroundSync pull re-imports them. `NotesListScreen.handleBulkDelete` now branches by sync mode per note: clone mode routes each delete through `deleteNote(id)` → `StagingService.stageDelete` (immediate `deleteAndCommit({ push: false })`); API mode keeps the batched `enqueueNoteDeletes` path.

### Clone cancel aborts in-flight HTTP (#1016, #1017)

**fix(clone)** — tapping Cancel during a clone now actually aborts the in-flight `git-upload-pack` request via `cancelInflightGitHttp()` instead of only checking a flag inside isomorphic-git's `onProgress` (which never fires while stuck in the HTTP fetch). Also fixes the dead-tab-bar symptom (#1017): the modal's blocking backdrop lifts immediately on cancel.

### Clone-mode idle push 3-min window (#1020)

**fix(sync)** — the foreground idle-push countdown now resets only when the staged _set_ changes (`stagedSignature` diff), not on every `pushProgress` / `isPushing` / `pushQueue` store churn. `flushStaged` now `await loadStaged()` first so a timer firing against a stale store still picks up the just-staged clone-mode commit. Stranded unpushed commits are gone.

### Fail-fast push timeout + cancel escape (#1013)

**fix(sync)** — pushes now use a 60-second timeout (`PUSH_TIMEOUT_MS`) for `git-receive-pack` URLs while downloads keep the 600-second budget. New `cancelInflightGitHttp()` aborts the in-flight request and is wired to a Cancel button on `SyncBlockOverlay` that arms after 5 seconds. The overlay lifts on cancel; staged commits remain staged for the next push trigger.

### Skip LFS working-tree walk on no-op pulls (#1022)

**perf(sync)** — `pullWithFastForward` resolves `refs/remotes/origin/<branch>` before and after the fetch and runs the LFS pointer scan only when the ref moved. No-op pulls skip the entire working-tree walk; the fetch/fast-forward path is unchanged. Adds a `__DEV__` timing log so pull-phase costs stay observable.

### Lazy chunk yield in `gitHttp` (#1021)

**perf(http)** — `gitHttp.request` is now a lazy async generator: chunks flow to isomorphic-git as the network delivers them, not after the whole packfile is buffered in the JS heap. First-byte latency drops to network time; `cancelInflightGitHttp()` still aborts mid-stream. The non-streaming `arrayBuffer()` fallback is unchanged.

### Remove redundant packfile merge (#982)

**perf(http)** — `gitHttp.request` no longer merges streamed chunks into a single `Uint8Array` before yielding. Peak memory for a large clone drops from ~2× the packfile size to ~1× (isomorphic-git still buffers on its side — see the #982 follow-up). Bytes and order are identical to the merged-buffer implementation.

### Sync health row in Settings (#1007)

**fix(sync)** — `ForegroundSyncService` now tracks `ForegroundSyncHealth` (`idle/syncing/ok/failed/timedout` plus `lastRunAt`, `lastCompletedAt`, `consecutiveFailures`) and exposes `getForegroundSyncHealth()` / `useForegroundSyncHealth()`. A stalled pull is no longer invisible: the Sync group renders a sync status row with relative-time subtitles.

### Surface todo parse errors instead of swallowing (#1008)

**fix(pull)** — `pullTodosFromRepo` no longer silently swallows todo JSON parse failures. Non-JSON content (markdown/frontmatter/arrays/empty) is skipped silently (out-of-schema, not an error); genuine failures log `error` with `todos/<file>.json` in the message, and a `Skipped N todo file(s): <paths>` summary surfaces the loss at a glance.

### Hide expo-dev-menu FAB that overlaps header buttons (#977)

**fix(dev)** — `expo-dev-menu`'s top-right floating "Tools" FAB overlapped the Notes header's Add-note and Sync buttons, so taps on those buttons opened the DevMenu. `App.tsx` calls `hideDevMenuFloatingActionButton()` in `__DEV__`; `app.json` sets `EXDevMenuShowFloatingActionButton=false`. `useProGate` was split into `useProGate()` / `useProStatus()` to fix the underlying conditional-hook LogBox violation.

### Skip-spam fix in ForegroundSync scheduler (#984)

**fix(sync)** — three busy-skip branches (`inFlight`, `pendingBackgroundWork`, coalesce) no longer log on every tick while a timed-out pull is settling. Adds a 10-second log throttle (`SKIP_LOG_THROTTLE_MS`), `consecutiveSkips` exponential back-off (`baseMs * 2^consecutiveSkips` capped at `SKIP_BACKOFF_MAX_MS` ± 10% jitter), and converts the fixed `setInterval` to a self-scheduling `setTimeout`.

### Parallelize LFS pointer scan (#980)

**perf(lfs)** — `scanForPointers` now walks the working tree with `SCAN_CONCURRENCY = 16` bounded concurrency (`mapLimit`) instead of one serial RN-bridge round-trip per file. ~10× faster scan on repos with thousands of working-tree files; identical `Map<relPath, LfsPointer>` output and `.git`/size skips.

### UTF-8 fast path on `gitFs.writeFile` (#986)

**perf(gitFs)** — `writeFile` decodes `Uint8Array` payloads for text extensions (`md`, `markdown`, `norg`, `org`, `txt`, `json`) with `TextDecoder('utf-8', { fatal: true })` and writes them as strings, killing the base64 round-trip for `.md` / `.norg` / `.json` working-tree files. Non-UTF-8 payloads fall through to the existing base64 path; bytes are exact.

### Floating push button hides after push (#925 follow-up)

**fix(sync)** — `pushStaged()` now broadcasts `notifyStagedChanged()` after the clone-mode push loop succeeds, so `pendingCount` drops to 0 and the floating push button hides immediately instead of lingering until the Stage screen is opened. Only fires on success; API-mode pushes keep the existing queue subscription contract.

### Center New Chat button label

**fix(ui)** — `Button`'s edge mode now handles leading icons (pinned `absolute left-5` + equal side spacers), so the full-width New Chat button's label sits at the button's true center instead of ~half-an-icon right.

### Guard header back on deep-linked root screens

**fix(navigation)** — tapping the header back button on a deep-link root screen (`gitnotes://chat`, `gitnotes://stage`, …) no longer throws `The action 'GO_BACK' was not handled by any navigator`. New `useSafeBack()` hook pops via `navigation.goBack()` when `canGoBack()`, otherwise falls back to `navigation.navigate('MainTabs')`.

## 2026-08-21

### Inline clone progress in Add-Repository picker (#953)

**fix(settings)** — clicking a GitHub repo row no longer shows a stuck spinner with no Cancel: `CloneProgressContent` renders inline inside the picker bottom sheet (no second native `Modal`), so iOS Fabric stops rejecting the stacked modal presentation. The `connectHost` flow now hydrates the legacy `GitHubService` singleton (the earlier `addAccount`-only fix missed the first-run path). Also: delete-note reports success when the write-through side channel already removed the row.

### Add-Repository progress + pull visibility

**fix(settings)** — adding a repo (clone mode) no longer freezes the app or hides the post-clone pull. Three fixes: (1) `createThrottledEmitter` coalesces isomorphic-git progress events to ~200ms with phase-change immediate flush + terminal-event guaranteed flush; (2) `yieldToMain()` inserts macrotask yields between `fetchInBatches` pulls and every ~25 upsert items; (3) `RepoPullService.pullFromSingleRepo` accepts an optional `CloneProgressCallback` so the pull phase renders in the same in-picker progress bar. Stores always refresh on a successful import (zero-count outcome logs a warning).

### Re-entrancy guard on floating-button collision (#floating-collision)

**fix(ui)** — `publishButtonRect` no longer overflows the JS stack when two FABs (AI button + stage push button) have overlapping rects. A `notifying` flag prevents publish-from-subscriber re-notification, and the collision listener reads the _published_ rect instead of the stale shared value so resolution converges.

### Push button missing on folder-backed updates

**fix(git)** — `LocalGitWriter.writeAndCommit` and `deleteAndCommit` now normalize leading slashes (`toRepoRelativePath()`) so folder-backed note/canvas/todo updates with `filePath = '/notes/foo.md'` produce a real local commit. Root-level notes (`notes/foo.md`) were never affected; this closes the gap.

### Daily Quote settings grouped, settings keyboard fixed

**fix(ui)** — extracted the three Daily Quote rows into their own **Daily Quote** group in Settings → Artificial Intelligence. Also: `ModelSelector`, `RenderStyleEditorScreen`, and `ChatScreen` get keyboard handling (`KeyboardAvoidingView`, `keyboardShouldPersistTaps="handled"`, `automaticallyAdjustKeyboardInsets`) so text inputs are no longer covered by the iOS keyboard.

### Thought Dump repo picker + distinct errors

**feat(thought-dump)** — Thought Dump now lets the user pick the destination repo and branch, persists the choice through `ThoughtDumpRepoPreferenceService` (`@gitnotes:thought_dump_repo`, with last-used/first-repo fallback), and surfaces four distinct save-time errors (`errorNotAuthenticated`, `errorNoRepo`, `errorInvalidRepo`, `errorWriteFailed`) instead of a single generic alert. Empty state distinguishes Connect account / No repository set up / No thought dumps yet.

### Clone-phase yield patch (isomorphic-git)

**fix(clone)** — adds a `patch-package` patch on `isomorphic-git` that inserts a macrotask yield every 256 objects inside `GitPackIndex.fromPack`'s CRC loop and delta/object decode loop, so a large-repo clone stays tappable during pack parsing. `scripts/patch-isomorphic-git-umd.js` applies the same one-liner to the pre-bundled UMD build; `__tests__/patches/patch-package.test.ts` is the CI guard. Also tightens 7 corruption-classifier sites to require `Could not find object` so a config error like `Could not find a fetch refspec for remote "origin"` no longer triggers a destructive `removeRepo` + re-clone.

## 2026-08-20

### iPad multi-column card collapse fix (#940, #941)

**fix(ui)** — `SwipeableListItem` root now has `{ width: '100%' }` as the first style entry, so on iPad's multi-column layouts (Todos ~90px, Notes grid ~263px in a ~330px column) the cards fill their column instead of collapsing to their content's intrinsic width. Single-column phone layouts are unaffected (`width: '100%'` matches the already-stretched item width).

## 2026-08-17

### Surface required GitHub token scopes in 403 messages

**fix(sync)** — `formatSyncError` separates rate-limit 403s from permission/scope 403s. Rate-limit still says "GitHub rate limit hit — try again in a few minutes" (must match first); a permission 403 now tells the user exactly which scopes they need (fine-grained `Contents: Read and write` with the repo selected, or a classic token with the `repo` scope). `extractGitHubReason` keeps GitHub's sanitized reason in the error message and scrubs bearer tokens defensively. Token-add UI spells out the same scopes in all six locales.

### Stage → Push UX overhaul

**fix(ux)** — single coordination point is the push button (not row locks). Removed all per-row lock UI (`useEntityLock` deleted). Push buttons keep their label and render no `ActivityIndicator`; they gray out during a push. Push progress flows through `githubActivity` with a determinate `ProgressBar` from `LocalGitWriter.push`'s `onProgress`. Push notifications fire under `PUSH_NOTIFICATION_ID = 'gitnotes-push-progress'` (start / progress / complete body-text updates, throttled to 1/sec, suppressed in foreground). `drainPushQueue()` runs immediately on explicit push (floating button long-press, Stage Push / Push-all) instead of waiting for the 3-min idle timer. Push session marker (`gitnotes-push-session`) lets `ForegroundSyncService.handleAppStateChange` resume a push on `AppState → active`. Deletes are staged not pinned — drop failures surface on the Stage screen's **Failed to delete** section, not on a row.

### Settings → Add Repository invisible primary button

**fix(ui)** — `Button`'s `variant="primary"` now fills `colors.primary` as the surface background with white text. The "Add" manual-repo button (and every other `variant="primary"` that overrode its text to white) was rendering as a blank white rectangle in light mode.

### "No repositories found" after adding a token

**fix(settings)** — `AccountsContext.addAccount` now calls `GitHubService.setToken(token, user)` after a successful connect (mirroring `setToken`/`switchToHost`), so the repo list and write preflight work immediately after adding an account. Earlier, only the "change token" path synced.

### Add-Repository row busy-state + re-entry guard (#936)

**fix(settings)** — tapping a GitHub repo row during a pending add no longer fires a second concurrent `addRepository`. `SettingsScreen.isAddingRepo` becomes `isAddingRepoPath: string | null`; both `handleSelectGithubRepo` and `handleAddManualRepo` short-circuit when `isAddingRepoPath !== null`. Picker rows show an inline `ActivityIndicator` while busy, dim non-tapped rows to `opacity: 0.5`, and the manual Add button mirrors the same busy indicator via its `trailingIcon`.
