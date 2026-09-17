# Git Engine

> The Rust native module that powers Git operations in GitNotēs. See [Architecture](./architecture.md) for context.

## Overview

GitNotēs uses a **custom Rust Git library** (`git2`-based) compiled as a native module and exposed to JavaScript via Turbo Module (New Architecture). This provides significant performance benefits over pure-JavaScript git implementations for large repositories.

**Package name:** `gitnotes-git-engine` (local npm package at `modules/GitEngine/`)

## Module Location

```
gitnotes/
├── modules/
│   └── GitEngine/               # Rust crate (git2-based)
│       ├── Cargo.toml           # Rust dependencies (git2, serde, etc.)
│       └── src/                 # Rust source (lib.rs + ops modules)
├── src/
│   └── services/
│       └── git/
│           └── engine/
│               └── GitEngine.ts  # JavaScript/TypeScript facade
└── package.json
```

> The Rust crate's internal module structure (`lib.rs`, `git_ops.rs`, etc.) is an implementation detail — consult the crate directly for the canonical list.

## TypeScript Bindings

**File:** `src/services/git/engine/GitEngine.ts`

Exports the native module as `GitEngine`. The JS side imports it as:

```typescript
import * as GitEngine from './engine/GitEngine';
```

## Exported Operations

These are the JS facade operations in `src/services/git/engine/GitEngine.ts`. The facade is a typed wrapper around the native Rust module. All ops run on the native engine queue under a per-repo flock.

### Clone & Init

### `GitEngine.clone(url: string, dest: string, repoId?: string): Promise<string>`

Clones a repository to the local dest path.

**Parameters:**
- `url` — Git remote URL
- `dest` — local destination path
- `repoId` — optional repo identifier

**Returns:** `Promise<string>` — final path after clone

---

### `GitEngine.initRepo(repoPath: string, bare: boolean): Promise<void>`

Initializes a new repository (`bare = true` creates a push-ready local remote).

---

### Repo Maintenance

### `GitEngine.removeRepo(repoPath: string): Promise<void>`

Removes a cloned repository and its working tree.

---

### `GitEngine.repairRepo(repoPath: string): Promise<RepairReport>`

Repairs a corrupted repository. Returns a report listing what was corrupted, repaired, and unrecoverable.

---

### Status & Diff

### `GitEngine.status(repoId: string, repoPath: string): Promise<RepoStatus>`

Returns the current branch, ahead/behind count, and branch list for a repo.

**Returns:**
```typescript
interface RepoStatus {
  branch: string;
  branches: BranchInfo[];
  ahead: number;
  behind: number;
  currentBranch: string;
}
```

---

### `GitEngine.statuses(repoPath: string): Promise<FileStatus[]>`

Lists the status of all files — staged, modified, untracked.

---

### `GitEngine.diffAll(repoPath: string): Promise<FileDiff[]>`

Computes a diff of all changed files between HEAD and working tree.

---

### `GitEngine.diffFile(repoPath: string, filePath: string): Promise<FileDiff>`

Computes a diff for a single file.

---

### Staging

### `GitEngine.stage(repoPath: string, paths: string[]): Promise<void>`

Stages file changes for the next commit.

---

### `GitEngine.unstage(repoPath: string, paths: string[]): Promise<void>`

Unstages files.

---

### `GitEngine.remove(repoPath: string, paths: string[], keepWorktree?: boolean): Promise<void>`

Removes files from the repository. `keepWorktree` preserves the working tree file.

---

### `GitEngine.discardFiles(repoPath: string, paths: string[]): Promise<void>`

Discards working tree changes for the given files (git checkout --).

---

### `GitEngine.stageFileLines(repoPath: string, filePath: string, hunks: HunkSelection[]): Promise<void>`

Line-level partial staging — stage only selected diff hunks.

---

### Commits

### `GitEngine.commit(repoPath: string, message: string, author: Author): Promise<CommitInfo>`

Creates a commit with the staged changes.

**Parameters:**
- `repoPath` — local repository path
- `message` — commit message
- `author` — `{ name: string; email: string }`

**Returns:** `Promise<CommitInfo>` — commit SHA, message, author, timestamp

---

### `GitEngine.log(repoPath: string, limit?: number): Promise<CommitInfo[]>`

Returns recent commits (default limit: 50).

---

### `GitEngine.commitDiff(repoPath: string, commitId: string): Promise<FileDiff[]>`

Per-file diff of one commit against its first parent (`git show`-style).

---

### `GitEngine.checkoutCommit(repoPath: string, commitId: string): Promise<void>`

Detaches HEAD at a commit (`git checkout <commit>`). Rejected if tracked files have staged/unstaged changes.

---

### `GitEngine.resetSoft(repoPath: string, commitId: string): Promise<void>`

Moves HEAD to a commit, keeping index + working tree (`git reset --soft`).

---

### `GitEngine.revertCommit(repoPath: string, commitId: string, author: Author): Promise<CommitInfo>`

`git revert` a commit. Merge commits are rejected.

---

### Conflicts

### `GitEngine.conflicts(repoPath: string): Promise<ConflictEntry[]>`

Lists currently conflicted files.

---

### `GitEngine.resolveConflict(repoPath: string, filePath: string): Promise<void>`

Marks a conflicted file as resolved.

---

### `GitEngine.getConflictBlobs(repoPath: string, filePath: string): Promise<ConflictBlobs>`

Returns the `ours`, `theirs`, and `base` blob content for a conflicted file (for unified-editor conflict UI).

---

### `GitEngine.markConflictResolved(repoPath: string, filePath: string): Promise<void>`

Marks a conflicted path resolved by staging its working tree content as final.

---

### Network

### `GitEngine.fetch(repoPath: string, remoteName?: string, repoId?: string | null): Promise<void>`

Fetches from a remote.

---

### `GitEngine.pull(repoPath: string, remoteName?: string, repoId?: string | null): Promise<PullResult>`

Pulls changes from the remote. The native module returns `{ kind, message, conflicts }`; the facade maps `FastForward`, `UpToDate`, and `Merged` to `{ ok: true }` and all other pull kinds to `{ ok: false, error }`.

---

### `GitEngine.push(repoPath: string, remoteName?: string, repoId?: string | null): Promise<PushResult>`

Pushes the current branch. Force-push is deliberately NOT exposed — the facade hardcodes `force: false`. Returns `{ ok: boolean; error?: string }`.

---

### `GitEngine.pushWithIntegrate(repoPath: string, remoteName?: string, repoId?: string | null): Promise<PushIntegrateResult>`

Pushes with transparent fetch + integrate (rebase or merge) when non-fast-forward. Returns `{ ok, error?, conflicts, pushed, integrated }`.

---

### Branches

### `GitEngine.listBranches(repoPath: string, remoteName?: string): Promise<BranchInfo[]>`

Lists all branches.

---

### `GitEngine.createBranch(repoPath: string, name: string, source?: string): Promise<BranchInfo>`

Creates a new branch.

---

### `GitEngine.checkoutBranch(repoPath: string, name: string, remoteName?: string): Promise<void>`

Checks out a branch. If checkout fails because the remote tracking ref is missing, callers should fetch from the remote first and retry.

> **Note:** For remote-to-local checkout, callers (e.g., `GitBranchCoordinator`) handle the fetch-and-retry logic. See `GitBranchCoordinator.checkout()` for the full remote branch checkout flow.

---

### `GitEngine.deleteBranch(repoPath: string, name: string): Promise<void>`

Deletes a branch.

---

### `GitEngine.renameBranch(repoPath: string, name: string, newName: string): Promise<BranchInfo>`

Renames a branch.

---

### Remotes

### `GitEngine.listRemotes(repoPath: string): Promise<RemoteInfo[]>`

Lists configured remotes.

---

### `GitEngine.addRemote(repoPath: string, name: string, url: string): Promise<void>`

Adds a remote.

---

### `GitEngine.removeRemote(repoPath: string, name: string): Promise<void>`

Removes a remote.

---

### `GitEngine.setRemoteUrl(repoPath: string, name: string, url: string): Promise<void>`

Updates a remote's URL.

---

### Credentials

### `GitEngine.setCredential(repoId: string, credential: Credential): Promise<void>`

Registers the credential the engine should use for a repo's remotes. Persists to expo-secure-store.

---

### `GitEngine.getCredential(repoId: string): Promise<NativeCredential | null>`

Reads the currently registered credential.

---

### `GitEngine.clearCredential(repoId: string): Promise<void>`

Removes the credential for a repo.

---

### Other

### `GitEngine.repoInfo(repoPath: string): Promise<RepoInfo>`

Returns repo metadata — path, branch, commit count, isClean.

---

### `GitEngine.backupCorruptRepo(repoPath: string): Promise<string>`

Backs up a corrupt repo to a timestamped directory (never deletes). Used by `reclone()`.

---

### `GitEngine.isBusy(repoPath: string): Promise<boolean>`

Returns whether another op currently holds the flock for the repo.

---

### `GitEngine.version(): Promise<string>`

Returns the native module version string.

---

### `GitEngine.engineName(): Promise<string>`

Returns the engine name (`'git2'` when Rust module is active, `'stub'` when unavailable).

---

## Building the Rust Module

### Build Script

**File:** `scripts/build-rust.sh`

```
--ios        Build for iOS (iOS device + simulator slices)
--android    Build for Android (arm64-v8a + armeabi-v7a)
--all        Build for all platforms
--bindings   Build only the JSI bindings (faster iteration)
```

**Dependencies:**
- Rust toolchain (`rustc`, `cargo`)
- `cargo-lipo` — for iOS fat library
- `cargo-ndk` — for Android NDK

### iOS Build

```bash
./scripts/build-rust.sh --ios
```

Outputs: `modules/GitEngine/target/aarch64-apple-ios/release/libgitnotes_git_engine.a` + `modules/GitEngine/target/aarch64-apple-ios-sim/release/libgitnotes_git_engine.a`

### Android Build

```bash
./scripts/build-rust.sh --android
```

Outputs: `modules/GitEngine/target/aarch64-linux-android/release/libgitnotes_git_engine.a`

## Expo Autolinking

The module is linked via Expo's autolinking system. The `package.json` entry:

```json
{
  "dependencies": {
    "gitnotes-git-engine": "file:./modules/GitEngine"
  }
}
```

Expo reads `modules/GitEngine/package.json` and links the native module automatically during prebuild.

## Android Release Build (R8 / minification)

Release builds on Android use R8 minification (enabled via `enableMinifyInReleaseBuilds: true` in `app.json` under `expo-build-properties`). The GitEngine module depends on JNA (declared as `net.java.dev.jna:jna:5.17.0@aar` in `modules/GitEngine/android/build.gradle`), and the UniFFI Kotlin bindings call into the native cdylib through JNA's `Pointer` class. R8 stripping the `Pointer` class or its `peer` field causes `GitEngine` native library to be unavailable at runtime with the error `Can't obtain peer field ID for class com.sun.jna.Pointer`. Additionally, R8 can strip JNA's `Native` class entirely, causing `Can't obtain static method dispose from class com.sun.jna.Native` at runtime. ProGuard/R8 keep rules for BOTH classes are required:

```
-keep class com.sun.jna.Native { *; }
-keep class com.sun.jna.Pointer { protected long peer; }
```

`-keepclassmembers` alone is insufficient because it does not retain the class itself.

## Android CA Store Configuration

GitHub HTTPS clones use TLS certificate verification. The vendored OpenSSL build in the Rust cdylib does not auto-detect Android's system CA certificate directories. On Android, git2's OpenSSL adapter must be explicitly pointed at the platform's CA store before any network operation.

### How it works

The Kotlin `GitEngineModule.OnCreate` calls `configureAndroidCa()` — a UniFFI-exported function backed by `engine::android_ca::configure_android_ca()` in `rust/src/engine/android_ca.rs`. That function:

1. Checks for `/apex/com.android.conscrypt/cacerts` (Android 10+, **preferred** — Conscrypt APEX module).
2. Falls back to `/system/etc/security/cacerts` (legacy path) only if the APEX path does not exist.
3. Validates the directory is readable and non-empty before passing it to `git2::opts::set_ssl_cert_dir`.
4. If validation fails, the function returns silently and **does not** configure the directory — git2's default behaviour (system CA store) remains active.

On non-Android platforms the function is a no-op.

### Safety contract

`git2::opts::set_ssl_cert_dir` calls into `git_libgit2_opts(GIT_OPT_SET_SSL_CERT_LOCATIONS, …)` which mutates a C global (`git__ssl_ctx`) inside libgit2's OpenSSL adapter. This is **process-global state, not thread-local**. The function is therefore `unsafe`, and the Kotlin call site must satisfy these conditions:

- The call runs **once**, on the **main thread**, before any async engine operations are dispatched.
- No other thread can be inside a git2 call at the moment of invocation.

`GitEngineModule.OnCreate` satisfies both: it runs on the Android main thread during app startup, before the React Native JS thread has posted any engine work.

### Certificate verification

No certificate bypass is involved. `set_ssl_cert_dir` directs OpenSSL to the Android CA directory; it does not disable verification. GitHub's TLS certificate remains validated against trusted system CAs.

### Rust module: `rust/src/engine/android_ca.rs`

```rust
// Errors from Android CA configuration.
pub enum AndroidCaError {
    SetCertDir(git2::Error),
    NotReadable(std::io::Error),
}

// Returns the best available Android CA certificate directory.
// Pass None for both to use the hardcoded defaults.
pub fn android_ca_dir(apex_override: Option<&Path>, legacy_override: Option<&Path>) -> Option<PathBuf>

// Configures git2's SSL CA directory for Android.
// SAFETY: must be called from main thread before any git2 operations.
pub fn configure_android_ca() -> Result<(), AndroidCaError>
```

The `#[uniffi::export]` wrapper in `rust/src/api/bridge.rs` exposes `configure_android_ca` as `configureAndroidCa()` to Kotlin. The UniFFI layer maps `AndroidCaError` to `BridgeError::Other`, so Kotlin callers can catch `BridgeException` if the CA configuration fails.

## Integration with JavaScript Services

The TypeScript facade at `src/services/git/engine/GitEngine.ts` is the single import point for all native Git operations. Services call it directly — there is no intermediate stub layer for real operations.

```typescript
// CloneSyncService.save() — the actual clone-mode write path
import * as GitEngine from './git/engine/GitEngine';

await FileSystem.writeAsStringAsync(fullPath, content);
// The user stages and commits from the Git workspace or floating Git button.
```

Key integration points:
- **`CloneSyncService.save()`** (`src/services/cloneSyncServiceImpl.ts`) — writes the file without staging it
- **`CommitService`** or **`commitOps.ts`** — stages and creates explicit commits
- **`ConflictResolverScreen`** — calls `GitEngine.conflicts()`, `GitEngine.getConflictBlobs()`, `GitEngine.markConflictResolved()`
- **`BackgroundSyncService`** / **`ForegroundSyncService`** — call `GitEngine.push()` and `GitEngine.pull()`

## Why Rust?

- **Performance:** Git operations on large repos (thousands of files) are fast
- **Memory:** Rust's zero-cost abstractions keep memory footprint low
- **Safety:** No garbage collection pauses during sync operations
- **Portability:** Rust compiles to iOS, Android, and desktop from the same codebase

---

## See Also

- [Sync Architecture](./sync-architecture.md) — How GitEngine fits into sync
- [Services](./services.md) — CloneSyncService that uses GitEngine
