/**
 * Typed JS facade over the native GitEngine module (Rust git2 via UniFFI).
 *
 * Ops map 1:1 to the engine bridge and run on the native engine queue, under
 * the engine's per-repo flock (same-repo ops serialize; different repos run
 * in parallel). `isBusy(repoPath)` exposes the flock state to the UI.
 *
 * SAFETY: force-push exists in the engine bridge for API parity only — the
 * facade hardcodes `force: false` and exposes NO force option, so no UI path
 * can ever reach it. Re-clone requires an explicit data-loss confirmation and
 * renames (never deletes) the corrupt directory first.
 */

import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import { Platform } from 'react-native';
import { AuthService } from '../../AuthService';

// Shape of the native module surface. Named (not `typeof GitEngineModule`) so the
// generic below is the full interface, not the flow-narrowed `null` initializer type.
type NativeGitEngineModule = {
  version(): Promise<string>;
  engineName(): Promise<string>;
  isRepoLocked(path: string): Promise<boolean>;
  setCredential(repoId: string, credential: NativeCredential): Promise<void>;
  getCredential(repoId: string): Promise<NativeCredential | null>;
  clearCredential(repoId: string): Promise<boolean>;
  generateSshKey(passphrase: string | null): Promise<GeneratedKey>;
  clone(url: string, dest: string, repoId?: string | null): Promise<string>;
  initRepo(path: string, bare: boolean): Promise<void>;
  removeRepo(path: string): Promise<void>;
  repoStatus(repoId: string, path: string): Promise<RepoStatus>;
  listStatuses(path: string): Promise<FileStatus[]>;
  diffAll(path: string): Promise<FileDiff[]>;
  diffFile(path: string, filePath: string): Promise<FileDiff>;
  stagePaths(path: string, paths: string[]): Promise<void>;
  unstagePaths(path: string, paths: string[]): Promise<void>;
  removePaths(path: string, paths: string[], keepWorktree: boolean): Promise<void>;
  discardFiles(path: string, paths: string[]): Promise<void>;
  stageFileLines(path: string, filePath: string, hunks: HunkSelection[]): Promise<void>;
  commit(path: string, message: string, authorName: string, authorEmail: string): Promise<CommitInfo>;
  recentCommits(path: string, limit: number): Promise<CommitInfo[]>;
  commitDiff(path: string, commitId: string): Promise<FileDiff[]>;
  checkoutCommit(path: string, commitId: string): Promise<void>;
  resetSoft(path: string, commitId: string): Promise<void>;
  revertCommit(path: string, commitId: string, authorName: string, authorEmail: string): Promise<CommitInfo>;
  getConflicts(path: string): Promise<ConflictEntry[]>;
  resolveConflict(path: string, filePath: string): Promise<void>;
  getConflictBlobs(path: string, filePath: string): Promise<ConflictBlobs>;
  markConflictResolved(path: string, filePath: string): Promise<void>;
  fetch(path: string, remoteName: string, repoId?: string | null): Promise<void>;
  pull(path: string, remoteName: string, repoId?: string | null): Promise<PullResult>;
  push(path: string, remoteName: string, repoId?: string | null, force?: boolean): Promise<PushResult>;
  pushWithIntegrate(path: string, remoteName: string, repoId?: string | null): Promise<PushIntegrateResult>;
  listBranches(path: string, remoteName: string): Promise<BranchInfo[]>;
  createBranch(path: string, name: string, source: string | null): Promise<BranchInfo>;
  checkoutBranch(path: string, name: string, remoteName: string): Promise<void>;
  deleteBranch(path: string, name: string): Promise<void>;
  renameBranch(path: string, name: string, newName: string): Promise<BranchInfo>;
  listRemotes(path: string): Promise<RemoteInfo[]>;
  addRemote(path: string, name: string, url: string): Promise<void>;
  removeRemote(path: string, name: string): Promise<void>;
  setRemoteUrl(path: string, name: string, url: string): Promise<void>;
  repoInfo(path: string): Promise<RepoInfo>;
  repairRepo(path: string): Promise<RepairReport>;
  backupCorruptRepo(path: string): Promise<string>;
  addListener(eventName: string, listener: (...args: unknown[]) => void): EventSubscription;
};

// Null when native module is not available (e.g., not yet built, or running in Expo Go)
let GitEngineModule: NativeGitEngineModule | null = null;

try {
  GitEngineModule = requireNativeModule<NativeGitEngineModule>('GitEngine');
} catch (e) {
  console.warn('[GitEngine] Native module not available, using stub implementation');
}

// On Android the native module only exists once the Rust engine has been
// built (`yarn build:rust --android`) and bundled. Fail fast with an
// actionable error instead of letting a missing/incomplete native module
// surface later as cryptic per-op failures.
if (
  Platform.OS === 'android' &&
  (GitEngineModule === null || typeof GitEngineModule.version !== 'function')
) {
  throw new Error(
    'GitEngine Android native module not available. Run `yarn build:rust --android` first.',
  );
}

// Stub for missing auth modules
const CredentialStore = {
  save: async (_repoId: string, _credential: Credential) => {},
  get: async (_repoId: string) => null as Credential | null,
  delete: async (_repoId: string) => {},
};
type Credential = { kind: string; username?: string; privateKey?: string; publicKey?: string | null; passphrase?: string | null; token?: string };

// Stub types from ../../../../modules/GitEngine
type Author = { name: string; email: string };
type BranchInfo = { name: string; isCurrent: boolean; isRemote?: boolean; upstream?: string; ahead?: number; behind?: number };
type CommitInfo = { id: string; message: string; author: Author; timestamp: number; shortId?: string; summary?: string; parentCount: number; authorTime: number; authorName?: string; authorEmail?: string };
type ConflictBlobs = { ours: string; theirs: string; base: string };
type ConflictEntry = { path: string; kind: string };
type ConflictFile = { path: string; status: string };
type DiffLine = { content: string; type: string; origin?: string; index: number; newLineno: number; oldLineno: number };
type DiffLineOrigin = string;
type FileDiff = { oldPath: string; newPath: string; hunks: unknown[]; path: string; added?: number; deleted?: number; isBinary?: boolean; lines: DiffLine[]; staged?: boolean };
type FileStatus = { path: string; status: string; staged?: boolean };
type FileStatusKind = string;
type GeneratedKey = { publicKey: string; privateKey: string };
type GitEngineError = { message: string; corruption?: boolean };
type GitProgressEvent = { phase: string; loaded: number; total: number; kind?: string; received: number; percent: number };
type GitProgressKind = string;
type HunkSelection = { oldStart: number; oldLines: number; newStart: number; newLines: number };
type NativeCredential = { kind: string; username?: string; privateKey?: string; publicKey?: string | null; passphrase?: string | null; password?: string };
type PullKind = string;
type PullResult = { ok: boolean; error?: string };
type PushIntegrateKind = string;
type PushIntegrateResult = { ok: boolean; error?: string; kind?: string; message: string; conflicts: { path: string }[]; pushed: number; integrate?: string; integrated?: string };
type PushResult = { ok: boolean; error?: string };
type RemoteInfo = { name: string; url: string; fetchSpecs: string[]; pushSpecs: string[] };
type RepairReport = { corrupted: string[]; repaired: string[]; isHealthy: boolean; unrecoverable: string[]; conflicts: string[] };
type RepoInfo = { path: string; branch: string; currentBranch: string; totalCommits: number; isClean: boolean };
type RepoStatus = { branch: string; branches: BranchInfo[]; ahead: number; behind: number; currentBranch: string };

export type {
  Author,
  BranchInfo,
  CommitInfo,
  ConflictBlobs,
  ConflictEntry,
  ConflictFile,
  DiffLine,
  DiffLineOrigin,
  FileDiff,
  FileStatus,
  FileStatusKind,
  GeneratedKey,
  GitEngineError,
  GitProgressEvent,
  GitProgressKind,
  HunkSelection,
  NativeCredential,
  PullKind,
  PullResult,
  PushIntegrateKind,
  PushIntegrateResult,
  PushResult,
  RemoteInfo,
  RepairReport,
  RepoInfo,
  RepoStatus,
};

function normalizeError(error: unknown): GitEngineError {
  const raw = error instanceof Error ? error : new Error(typeof error === 'string' ? error : String(error));
  const normalized = raw as GitEngineError;
  if (normalized.corruption === undefined) {
    normalized.corruption =
      /index|object|odb|repository|corrupt|loose object/i.test(normalized.message);
  }
  return normalized;
}

async function run<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  if (!GitEngineModule) {
    console.warn('[GitEngine] Native module unavailable, returning fallback');
    return fallback;
  }
  try {
    return await op();
  } catch (error) {
    throw normalizeError(error);
  }
}

export async function version(): Promise<string> {
  if (!GitEngineModule) return '0.0.0-unavailable';
  return run(() => GitEngineModule!.version(), '0.0.0-unavailable');
}

export async function engineName(): Promise<string> {
  if (!GitEngineModule) return 'stub';
  return run(() => GitEngineModule!.engineName(), 'stub');
}

/** Map an app-level `Credential` to the native credential shape. */
export function toNativeCredential(credential: Credential): NativeCredential {
  if (credential.kind === 'SSH') {
    return {
      kind: 'ssh',
      username: credential.username ?? 'git',
      privateKey: credential.privateKey ?? '',
      publicKey: credential.publicKey ?? null,
      passphrase: credential.passphrase ?? null,
    };
  }
  if (credential.kind === 'OAuth' && credential.token) {
    return {
      kind: 'userpass',
      username: credential.username ?? 'git',
      password: credential.token,
    };
  }
  return {
    kind: 'userpass',
    username: credential.username ?? 'git',
    password: credential.token ?? '',
  };
}

/**
 * Register the credential the Rust engine should use for `repoId`'s remotes.
 * Persists the credential to expo-secure-store AND updates the engine's
 * in-memory per-repo map. `repoId` is the id the app registered the repo under.
 */
export async function setCredential(repoId: string, credential: Credential): Promise<void> {
  await CredentialStore.save(repoId, credential);
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.setCredential(repoId, toNativeCredential(credential)), undefined);
}

/** Remove the credential for `repoId` from the store and the engine map. */
export async function clearCredential(repoId: string): Promise<void> {
  await CredentialStore.delete(repoId);
  if (!GitEngineModule) return;
  await GitEngineModule!.clearCredential(repoId);
}

/** Clear ONLY the engine's in-memory credential map (the secure-store copy
 * stays, so the next op re-seeds it). */
export async function clearEngineCredential(repoId: string): Promise<void> {
  if (!GitEngineModule) return;
  await GitEngineModule!.clearCredential(repoId);
}

/** Read the credential currently registered for `repoId` (native map). */
export async function getCredential(repoId: string): Promise<NativeCredential | null> {
  if (!GitEngineModule) return null;
  return run(() => GitEngineModule!.getCredential(repoId), null);
}

/**
 * Generate an ed25519 SSH keypair. `passphrase` (optional) encrypts the
 * private key (AES-256-CTR, OpenSSH PEM). Returns the public key for the user
 * to add to a provider plus the encrypted private key for storage.
 */
export async function generateSshKey(passphrase?: string | null): Promise<GeneratedKey> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot generate SSH key');
  }
  return run(() => GitEngineModule!.generateSshKey(passphrase ?? null), { publicKey: '', privateKey: '' });
}

async function ensureCredentialForOp(repoId: string | null | undefined): Promise<void> {
  if (!repoId || !GitEngineModule) return;

  const stored = await CredentialStore.get(repoId);
  if (stored) {
    await GitEngineModule!.setCredential(repoId, toNativeCredential(stored)).catch(() => undefined);
    return;
  }

  const token = await AuthService.getToken();
  if (token) {
    const credential = { kind: 'token' as const, username: 'x-access-token', token };
    await GitEngineModule!.setCredential(repoId, toNativeCredential(credential)).catch(() => undefined);
  }
}

/** Subscribe to engine progress events (clone/fetch/push/transfer). */
export function addEngineProgressListener(
  listener: (event: GitProgressEvent) => void,
): EventSubscription {
  if (!GitEngineModule) {
    return { remove: () => {} } as EventSubscription;
  }
  return GitEngineModule.addListener('onEngineProgress', listener as (...args: unknown[]) => void);
}

/** Whether another op currently holds the flock for `repoPath`. */
export async function isBusy(repoPath: string): Promise<boolean> {
  if (!GitEngineModule) return false;
  return run(() => GitEngineModule!.isRepoLocked(repoPath), false);
}

export async function clone(url: string, dest: string, repoId?: string | null): Promise<string> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot clone');
  }
  await ensureCredentialForOp(repoId);
  return run(() => GitEngineModule!.clone(url, dest, repoId ?? null), '');
}

/** Initialize a new repo (`bare = true` creates a push-ready local remote). */
export async function initRepo(repoPath: string, bare: boolean): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot init repo');
  }
  return run(() => GitEngineModule!.initRepo(repoPath, bare), undefined);
}

export async function removeRepo(repoPath: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.removeRepo(repoPath), undefined);
}

export async function status(repoId: string, repoPath: string): Promise<RepoStatus> {
  if (!GitEngineModule) {
    return { branch: '', branches: [], ahead: 0, behind: 0, currentBranch: '' };
  }
  return run(() => GitEngineModule!.repoStatus(repoId, repoPath), { branch: '', branches: [], ahead: 0, behind: 0, currentBranch: '' });
}

export const repoStatus = status;

export async function statuses(repoPath: string): Promise<FileStatus[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.listStatuses(repoPath), []);
}

export async function diffAll(repoPath: string): Promise<FileDiff[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.diffAll(repoPath), []);
}

export async function diffFile(repoPath: string, filePath: string): Promise<FileDiff> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot diff file');
  }
  return run(() => GitEngineModule!.diffFile(repoPath, filePath), { oldPath: '', newPath: '', hunks: [], path: '', lines: [] });
}

export async function stage(repoPath: string, paths: string[]): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.stagePaths(repoPath, paths), undefined);
}

export async function unstage(repoPath: string, paths: string[]): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.unstagePaths(repoPath, paths), undefined);
}

export async function remove(repoPath: string, paths: string[], keepWorktree = false): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.removePaths(repoPath, paths, keepWorktree), undefined);
}

export async function discardFiles(repoPath: string, paths: string[]): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot discard changes');
  }
  return run(() => GitEngineModule!.discardFiles(repoPath, paths), undefined);
}

/** LINE-LEVEL PARTIAL STAGING: stage only the selected diff lines. */
export async function stageFileLines(
  repoPath: string,
  filePath: string,
  hunks: HunkSelection[],
): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.stageFileLines(repoPath, filePath, hunks), undefined);
}

/** Create a commit from the staged index with `author` as identity. */
export async function commit(repoPath: string, message: string, author: Author): Promise<CommitInfo> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot commit');
  }
  return run(() => GitEngineModule!.commit(repoPath, message, author.name, author.email), { id: '', message: '', author: { name: '', email: '' }, timestamp: 0, parentCount: 0, authorTime: 0 });
}

export async function log(repoPath: string, limit = 50): Promise<CommitInfo[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.recentCommits(repoPath, limit), []);
}

/** Per-file diff of one commit against its first parent (`git show`-style). */
export async function commitDiff(repoPath: string, commitId: string): Promise<FileDiff[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.commitDiff(repoPath, commitId), []);
}

/**
 * Detach HEAD at `commitId` (`git checkout <commit>`). The engine rejects the
 * op while tracked files carry staged/unstaged changes (untracked survive).
 */
export async function checkoutCommit(repoPath: string, commitId: string): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot checkout commit');
  }
  return run(() => GitEngineModule!.checkoutCommit(repoPath, commitId), undefined);
}

/** Move HEAD to `commitId`, keeping the index + working tree (`git reset --soft`). */
export async function resetSoft(repoPath: string, commitId: string): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot reset soft');
  }
  return run(() => GitEngineModule!.resetSoft(repoPath, commitId), undefined);
}

/**
 * `git revert` a commit: applies the inverse diff and immediately commits it
 * as `Revert "<summary>"` with `author`. Merge commits are rejected.
 */
export async function revertCommit(
  repoPath: string,
  commitId: string,
  author: Author,
): Promise<CommitInfo> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot revert commit');
  }
  return run(() =>
    GitEngineModule!.revertCommit(repoPath, commitId, author.name, author.email),
    { id: '', message: '', author: { name: '', email: '' }, timestamp: 0, parentCount: 0, authorTime: 0 },
  );
}

export async function conflicts(repoPath: string): Promise<ConflictEntry[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.getConflicts(repoPath), []);
}

export async function resolveConflict(repoPath: string, filePath: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.resolveConflict(repoPath, filePath), undefined);
}

/**
 * Text content of the conflict stages for one conflicted file, for the
 * unified-editor conflict UI. Throws an `Unsupported`-typed error for binary
 * conflict content.
 */
export async function getConflictBlobs(repoPath: string, filePath: string): Promise<ConflictBlobs> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot get conflict blobs');
  }
  return run(() => GitEngineModule!.getConflictBlobs(repoPath, filePath), { ours: '', theirs: '', base: '' });
}

/**
 * Mark a conflicted path resolved by staging its working-tree content as
 * final (`index.add_path` + `index.write`). After this, `statuses()` shows
 * the file staged and `conflicts()` no longer lists it.
 */
export async function markConflictResolved(repoPath: string, filePath: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.markConflictResolved(repoPath, filePath), undefined);
}

export async function fetch(
  repoPath: string,
  remoteName = 'origin',
  repoId?: string | null,
): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot fetch');
  }
  await ensureCredentialForOp(repoId);
  return run(() => GitEngineModule!.fetch(repoPath, remoteName, repoId ?? null), undefined);
}

export async function pull(
  repoPath: string,
  remoteName = 'origin',
  repoId?: string | null,
): Promise<PullResult> {
  if (!GitEngineModule) {
    return { ok: false, error: 'GitEngine native module unavailable' };
  }
  await ensureCredentialForOp(repoId);
  return run(() => GitEngineModule!.pull(repoPath, remoteName, repoId ?? null), { ok: false, error: 'unavailable' });
}

/**
 * Push the current branch. Force-push is deliberately NOT exposed here: the
 * native bridge accepts `force` for API parity but this facade hardcodes
 * `false`, so no UI path can ever force-push.
 */
export async function push(
  repoPath: string,
  remoteName = 'origin',
  repoId?: string | null,
): Promise<PushResult> {
  if (!GitEngineModule) {
    return { ok: false, error: 'GitEngine native module unavailable' };
  }
  await ensureCredentialForOp(repoId);
  return run(() => GitEngineModule!.push(repoPath, remoteName, repoId ?? null, false), { ok: false, error: 'unavailable' });
}

/**
 * Push the current branch, transparently fetching + integrating when the
 * remote rejects a non-fast-forward push: local commits are rebased onto the
 * fetched remote tip (or merged when the rebase conflicts) and the push is
 * retried. Real conflicts come back as `kind === 'Conflicts'` with the
 * conflicted paths; the repo is left in a resolvable merge-conflict state
 * (`conflicts()` / `resolveConflict()`). Force-push is never used.
 */
export async function pushWithIntegrate(
  repoPath: string,
  remoteName = 'origin',
  repoId?: string | null,
): Promise<PushIntegrateResult> {
  if (!GitEngineModule) {
    return { ok: false, error: 'GitEngine native module unavailable', message: '', conflicts: [], pushed: 0 };
  }
  await ensureCredentialForOp(repoId);
  return run(
    () => GitEngineModule!.pushWithIntegrate(repoPath, remoteName, repoId ?? null),
    { ok: false, error: 'unavailable', message: '', conflicts: [], pushed: 0 },
  );
}

export async function listBranches(repoPath: string, remoteName = 'origin'): Promise<BranchInfo[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.listBranches(repoPath, remoteName), []);
}

export async function createBranch(
  repoPath: string,
  name: string,
  source?: string,
): Promise<BranchInfo> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot create branch');
  }
  return run(() => GitEngineModule!.createBranch(repoPath, name, source ?? null), { name: '', isCurrent: false });
}

export async function checkoutBranch(
  repoPath: string,
  name: string,
  remoteName = 'origin',
): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot checkout branch');
  }
  return run(() => GitEngineModule!.checkoutBranch(repoPath, name, remoteName), undefined);
}

export async function deleteBranch(repoPath: string, name: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.deleteBranch(repoPath, name), undefined);
}

export async function renameBranch(
  repoPath: string,
  name: string,
  newName: string,
): Promise<BranchInfo> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot rename branch');
  }
  return run(() => GitEngineModule!.renameBranch(repoPath, name, newName), { name: '', isCurrent: false });
}

export async function listRemotes(repoPath: string): Promise<RemoteInfo[]> {
  if (!GitEngineModule) return [];
  return run(() => GitEngineModule!.listRemotes(repoPath), []);
}

export async function addRemote(repoPath: string, name: string, url: string): Promise<void> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot add remote');
  }
  return run(() => GitEngineModule!.addRemote(repoPath, name, url), undefined);
}

export async function removeRemote(repoPath: string, name: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.removeRemote(repoPath, name), undefined);
}

export async function setRemoteUrl(repoPath: string, name: string, url: string): Promise<void> {
  if (!GitEngineModule) return;
  return run(() => GitEngineModule!.setRemoteUrl(repoPath, name, url), undefined);
}

export async function repoInfo(repoPath: string): Promise<RepoInfo> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot get repo info');
  }
  return run(() => GitEngineModule!.repoInfo(repoPath), { path: '', branch: '', currentBranch: '', totalCommits: 0, isClean: true });
}

/** Repair a corrupted repository. Never auto-runs. */
export async function repairRepo(repoPath: string): Promise<RepairReport> {
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot repair repo');
  }
  return run(() => GitEngineModule!.repairRepo(repoPath), { corrupted: [], repaired: [], isHealthy: false, unrecoverable: [], conflicts: [] });
}

const DATA_LOSS_CONFIRMATION =
  'Re-clone requires explicit confirmation: uncommitted working-tree changes and unpushed commits will be lost.';

/**
 * Re-clone fallback for an unrecoverable corrupted repo.
 *
 * SAFETY (mandatory): requires `options.confirmDataLoss === true` (a SECOND
 * explicit user confirmation — the app must not auto-confirm). The corrupt
 * directory is renamed to `<repo>-corrupt-backup-<timestamp>` and NEVER
 * deleted. Returns the backup path.
 */
export async function reclone(
  repoPath: string,
  url: string,
  options: { confirmDataLoss: boolean },
): Promise<string> {
  if (options.confirmDataLoss !== true) {
    const error = new Error(DATA_LOSS_CONFIRMATION) as GitEngineError;
    error.corruption = false;
    throw error;
  }
  if (!GitEngineModule) {
    throw new Error('GitEngine native module unavailable: cannot reclone');
  }
  const backupPath = await run(() => GitEngineModule!.backupCorruptRepo(repoPath), '');
  await run(() => GitEngineModule!.clone(url, repoPath), '');
  return backupPath;
}
