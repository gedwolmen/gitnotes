# GitSync GPL Provenance

## Upstream Attribution

**GitSync** — https://github.com/ViscousPot/GitSync
Pinned commit: `9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a`
License: GNU General Public License v3.0

GitSync is a Flutter/Rust mobile Git client that provides:
clone/fetch/pull/stage/commit/push, conflict resolution, HTTPS/SSH/OAuth auth,
offline retry, branches/tags/remotes, issues/PRs/workflows, and AI Git tools.

## Derivative Work Notice

GitNotēs is a GPL-3.0 derivative work that ports GitSync's native git2-rs
core and full Git client surface to Expo/React Native, while deliberately
removing all legacy isomorphic-git infrastructure and permanently purging
all old Git device data.

## Corresponding Source

Pursuant to GPL v3 s.1, the **corresponding source** for this derivative
work is available at the GitSync repository (pinned commit above). The
source from which this product is derived is clearly identified and
preserved in the NOTICE file at the repository root.

## Source Porting Record

Source files ported or derived from GitSync are recorded in [NOTICE](../../NOTICE)
with:
- Original GitSync path
- Date of porting
- Modification notes

The complete file inventory covers:

### Native module (`modules/expo-git2-rs/`)
- **Rust source** (17 files): `api/*.rs` (branch, clone, commit, diff, fetch,
  git_manager, log, merge, mod, pull, push, remote, status, tag), `lib.rs`,
  `error.rs`, `main.rs`, `protocol.rs`
- **TypeScript bindings** (4 files): `Git2Client.ts`, `types.ts`, `errors.ts`,
  `index.ts`
- **Build config** (4 files): `Cargo.toml`, `Cargo.lock`, `rust-toolchain.toml`,
  `scripts/build-rust.sh`
- **Native bridge, iOS** (2 files): `ios/ExpoGit2RsModule.swift`,
  `ios/ExpoGit2Rs.podspec`
- **Native bridge, Android** (4 files): `android/.../ExpoGit2RsModule.kt`,
  `android/.../ExpoGit2RsPackage.kt`, `android/app/build.gradle`,
  `android/app/src/main/AndroidManifest.xml`
- **Module metadata** (4 files): `package.json`, `README.md`, `NOTICE`, `LICENSE`

### Git2 UI features (`src/features/git2/`)
- **Auth** (3 files): `authStore.ts`, `OnboardingScreen.tsx`, barrel `index.ts`
- **Repositories** (3 files): `repoStore.ts`, `Git2ReposScreen.tsx`, `Git2RepoScreen.tsx`
- **File browser** (4 files): `fileTreeStore.ts`, `FileTreeScreen.tsx`,
  `FileViewerScreen.tsx`, barrel `index.ts`
- **History** (3 files): `CommitHistoryScreen.tsx`, `DiffScreen.tsx`, barrel `index.ts`
- **Management** (7 files): `branchStore.ts`, `BranchManagerScreen.tsx`,
  `remoteStore.ts`, `RemoteManagerScreen.tsx`, `tagStore.ts`,
  `TagManagerScreen.tsx`, barrel `index.ts`
- **Sync** (5 files): `syncState.ts`, `ConflictResolverScreen.tsx`,
  `SyncSettingsScreen.tsx`, `backgroundTask.ts`, barrel `index.ts`
- **Containers** (1 file): `containerStore.ts`
- **Settings** (4 files): `Git2SettingsScreen.tsx`, `git2SettingsStore.ts`,
  `AuthorIdentityScreen.tsx`, `CommitTemplatesScreen.tsx`
- **Auth Providers** (3 files): `oauthStore.ts`, `restClient.ts`, `types.ts`

### Compatibility layer
- `src/services/LegacyGitPurgeService.ts` (new; not from GitSync)

## Data Purge Obligations

As part of the migration from isomorphic-git to git2-rs, GitNotēs performs
a one-time data purge on first launch after upgrade. The `LegacyGitPurgeService`
removes:

1. **All stored Git credentials and tokens** from `expo-secure-store`
2. **All cloned repository directories** from `FileSystem.documentDirectory`
3. **All sync queues and operation registries** from AsyncStorage
4. **All unpushed commit records** from AsyncStorage

This purge is intentional and non-reversible. Users must re-authenticate
and re-clone after the migration. The purge ensures no stale isomorphic-git
state persists alongside the new git2-rs backend.

## No-Test Debt

The git2-rs migration introduces a new native module and UI feature set
without carrying over the isomorphic-git-era test suite. Legacy tests that
mocked `isomorphic-git` internals are not applicable to the git2-rs
implementation. New test coverage for the native module and Git2 UI features
is expected as part of ongoing development.

The existing legacy test suite (pre-migration) remains in `__tests__/` and
continues to run against the legacy compatibility shims that are still present.

## Build from Source

Both dev clients can be built from source. The Rust native module must be
compiled before running `expo run:ios` or `expo run:android`.

### Prerequisites
- Rust 1.75+ (`rustup default stable`)
- Android NDK r25+ (for Android cross-compilation)
- Xcode 15+ (for iOS builds)
- Node.js 20.18+
- Expo SDK 56+

### Build commands
```bash
# Install cross-compilation targets
cd modules/expo-git2-rs/rust
./scripts/build-rust.sh
cd ../..

# Install JS dependencies
yarn install

# iOS dev client
yarn ios

# Android dev client
yarn android
```

### Target matrix

| Platform | Rust Target | Distribution |
|----------|-------------|-------------|
| iOS Simulator | `aarch64-apple-ios-sim` | Development only |
| iOS Device | `aarch64-apple-ios` | Development only |
| Android Emulator | `x86_64-linux-android` | Development only |
| Android Device | `aarch64-linux-android` | Development only |

## App-Store Release Prohibition (HARD GATE)

**No production app-store release may be made without explicit written
legal clearance from the repository owner.**

This prohibition applies regardless of completion of development build
verification or any other technical milestone. Source development
may proceed freely; distribution through app stores requires separate,
explicit legal approval.

The `eas.json` production profile and submit configuration exist from the
pre-migration codebase. Their presence does not constitute store readiness.
The GPL-3.0 provenance obligations and the explicit owner legal-clearance
gate must be satisfied before any App Store or Play Store submission.

## GPL-3.0 Obligations

As a GPL-3.0 work, GitNotēs must:
1. Preserve all copyright and license notices from GitSync
2. Mark all modifications with date and source reference
3. Provide corresponding source for all distributed binaries
4. License the complete combined work under GPL-3.0
5. Make source available under GPL-3.0 terms
6. Include this NOTICE file and the upstream GitSync attribution in any distribution

## Legal-Clearance Gate

Before any production release, the following must be verified:
1. Repository owner has provided explicit written legal clearance
2. All source-path provenance in [NOTICE](../../NOTICE) is complete and accurate
3. The data purge path in `LegacyGitPurgeService` is functional
4. No prebuilt binaries are shipped without accompanying source
5. The GPL-3.0 license text is included in all distributed forms
6. The `eas.json` production and submit profiles are not used until clearance is granted
