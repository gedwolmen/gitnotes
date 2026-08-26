/**
 * Push-recovery helpers — extracted from LocalGitWriter.ts.
 *
 * Provides:
 * - `repairCloneAfterCorruption` — remove-and-reclone a corrupted clone
 * - `pushWithRecovery` — push with non-fast-forward detection + recovery
 * - `pushWithForce` — force-push without conflict detection
 * - `classifyPushError` / `isPushRejected` — push error classification
 *
 * Internal helpers (not exported):
 * - `ensureCloneNotShallow` — convert a shallow clone to full
 * - `hasUnpushedLocalCommits` — check whether local has commits absent on remote
 */

import * as FileSystem from 'expo-file-system/legacy';
import git from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs as buildGitFs } from './gitFs';
import { gitHttp } from './gitHttp';
import { GitFsService, repairHeadRef } from './GitFsService';

const CLONES_SUBDIR = 'GitNotes/';

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/** Returns true when the raw error message indicates a push was rejected. */
export function isPushRejected(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    m.includes('push rejected') ||
    m.includes('not a simple fast-forward') ||
    m.includes('non-fast-forward') ||
    m.includes('one or more branches were not updated')
  );
}

/** Classify a raw push error string into a human-readable category. */
export function classifyPushError(raw: string): string {
  const lower = raw.toLowerCase();

  if (
    lower.includes('unauthorized') ||
    lower.includes('authentication failed') ||
    lower.includes('credentials') ||
    lower.includes('401') ||
    lower.includes('403') ||
    lower.includes('permission denied')
  ) {
    return `push failed: authentication error — ${raw}`;
  }

  if (
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('enotfound') ||
    lower.includes('fetch failed') ||
    lower.includes('connection refused') ||
    lower.includes('eai_again') ||
    lower.includes('socket')
  ) {
    return `push failed: network error — ${raw}`;
  }

  if (
    lower.includes('non-fast-forward') ||
    lower.includes('not a simple fast-forward') ||
    lower.includes('push rejected') ||
    (lower.includes('one or more branches were not updated') && lower.includes('failed'))
  ) {
    return `push failed: remote rejected non-fast-forward — ${raw}`;
  }

  if (
    lower.includes('branch') &&
    (lower.includes('not found') || lower.includes('does not exist')) &&
    !lower.includes('one or more branches were not updated')
  ) {
    return `push failed: branch not found — ${raw}`;
  }

  return `push failed — ${raw}`;
}

// ---------------------------------------------------------------------------
// Corruption detection
// ---------------------------------------------------------------------------

/** Returns true when the error message indicates git object / packfile corruption. */
export function isCorruptionError(errorMsg: string): boolean {
  return /Could not find|NotFoundError|Packfile trailer mismatch/i.test(errorMsg);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clonesRoot(): string {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) {
    throw new Error('expo-file-system documentDirectory is not available');
  }
  return docDir.endsWith('/') ? docDir + CLONES_SUBDIR : `${docDir}/${CLONES_SUBDIR}`;
}

function makeRepoFs() {
  return buildGitFs(clonesRoot());
}

function repoDirVirtual(owner: string, repo: string): string {
  return `/${owner}/${repo}`;
}

function tokenAuth(token: string | undefined) {
  if (!token) return undefined;
  return () => ({ username: 'x-access-token', password: token });
}

async function ensureOnBranch(
  fs: ReturnType<typeof makeRepoFs>,
  dir: string,
  branch: string,
  token: string | undefined,
): Promise<void> {
  await repairHeadRef(fs, dir, branch);

  const current = await git.currentBranch({ fs, dir, fullname: false }).catch(() => null);
  if (current === branch) return;

  const fullRef = `refs/heads/${branch}`;
  try {
    await git.checkout({ fs, dir, ref: fullRef });
    return;
  } catch {
    // local branch ref is missing - fetch then retry checkout below.
  }

  await git.fetch({
    fs,
    http: gitHttp,
    dir,
    ref: branch,
    singleBranch: true,
    depth: 1,
    tags: false,
    onAuth: tokenAuth(token),
  });
  await git.checkout({ fs, dir, ref: fullRef });
}

/**
 * Convert a shallow clone to a full clone by fetching the full history.
 * No-op when the clone is not shallow.
 */
async function ensureCloneNotShallow(
  fs: ReturnType<typeof makeRepoFs>,
  dir: string,
  branch: string,
  token: string | undefined,
): Promise<void> {
  const shallowPath = `${dir}/.git/shallow`;
  try {
    await fs.promises.readFile(shallowPath, 'utf8');
  } catch {
    return;
  }
  await git.fetch({
    fs,
    http: gitHttp,
    dir,
    ref: branch,
    singleBranch: true,
    tags: false,
    onAuth: tokenAuth(token),
  });
  await fs.promises.unlink(shallowPath).catch(() => undefined);
}

/**
 * Returns true when `repoPath@branch` has commits that exist locally but have
 * not been pushed to the remote. Returns false when `localOid === remoteOid`
 * (i.e., local and remote are in sync).
 */
export async function hasUnpushedLocalCommits(repoPath: string, branch: string): Promise<boolean> {
  try {
    const localRef = `refs/heads/${branch}`;
    const remoteRef = `refs/remotes/origin/${branch}`;
    const localOid = await GitFsService.getCommitOid({ repoPath, ref: localRef });
    const remoteOid = await GitFsService.getCommitOid({ repoPath, ref: remoteRef });
    if (localOid === null || remoteOid === null) return false;
    if (localOid === remoteOid) return false;
    const mergeBase = await GitFsService.findMergeBase({ repoPath, ref1: localRef, ref2: remoteRef });
    if (mergeBase === null) return false;
    if (localOid === mergeBase) return false;
    return true;
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface PushWithRecoveryOptions {
  repoPath: string;
  branch: string;
  token?: string;
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void;
}

export interface PushWithRecoveryResult {
  success: boolean;
  error?: string;
}

/**
 * Attempt a push. On non-fast-forward rejection, pull with fast-forward and retry
 * once. On corruption errors, either return hard error (if unpushed commits exist —
 * user data must not be destroyed) or remove the repo, re-clone, and retry.
 */
export async function pushWithRecovery(
  opts: PushWithRecoveryOptions,
): Promise<PushWithRecoveryResult> {
  const { repoPath, branch, token, onProgress } = opts;
  const info = parseRepoPath(repoPath);
  if (!info) return { success: false, error: `Invalid repo path: ${repoPath}` };

  const dir = repoDirVirtual(info.owner, info.repo);
  const fs = makeRepoFs();

  try {
    await ensureOnBranch(fs, dir, branch, token);
    await ensureCloneNotShallow(fs, dir, branch, token);
    await git.push({
      fs,
      http: gitHttp,
      dir,
      ref: branch,
      remoteRef: branch,
      onAuth: tokenAuth(token),
      onProgress: onProgress ?? undefined,
    });
    return { success: true };
  } catch (pushError) {
    const raw = pushError instanceof Error ? pushError.message : String(pushError);

    // Corruption error: user data must not be destroyed
    if (isCorruptionError(raw)) {
      const hasLocal = await hasUnpushedLocalCommits(repoPath, branch);
      if (hasLocal) {
        return { success: false, error: `Clone corruption with unpushed commits in ${repoPath}@${branch}. Please push or reset.` };
      }
      await GitFsService.removeRepo({ repoPath });
      await GitFsService.clone({ repoPath, branch, token });
      try {
        await git.push({
          fs,
          http: gitHttp,
          dir,
          ref: branch,
          remoteRef: branch,
          onAuth: tokenAuth(token),
          onProgress: onProgress ?? undefined,
        });
        return { success: true };
      } catch (retryError) {
        const retryRaw = retryError instanceof Error ? retryError.message : String(retryError);
        const classifiedError = classifyPushError(retryRaw);
        console.warn(`[recovery] push after clone recovery failed (branch: ${branch}):`, classifiedError);
        return { success: false, error: classifiedError };
      }
    }

    // Non-fast-forward: pull with fast-forward and retry once
    if (isPushRejected(raw)) {
      const ffResult = await GitFsService.pullWithFastForward({ repoPath, branch, token });
      if (!ffResult.ok) {
        const ffError = ffResult.error ?? '';

        // Corruption during pull — must protect user data
        if (isCorruptionError(ffError)) {
          const hasLocal = await hasUnpushedLocalCommits(repoPath, branch);
          if (hasLocal) {
            return { success: false, error: `Clone corruption with unpushed commits in ${repoPath}@${branch}. Please push or reset.` };
          }
          await GitFsService.removeRepo({ repoPath });
          await GitFsService.clone({ repoPath, branch, token });
          try {
            await git.push({
              fs,
              http: gitHttp,
              dir,
              ref: branch,
              remoteRef: branch,
              onAuth: tokenAuth(token),
              onProgress: onProgress ?? undefined,
            });
            return { success: true };
          } catch (retryError) {
            const retryRaw = retryError instanceof Error ? retryError.message : String(retryError);
            const classifiedError = classifyPushError(retryRaw);
            console.warn(`[recovery] push after clone recovery failed (branch: ${branch}):`, classifiedError);
            return { success: false, error: classifiedError };
          }
        } else if (ffResult.reason === 'diverged') {
          return { success: false, error: 'conflict-detected' };
        } else {
          return { success: false, error: `Push failed: ${ffError || ffResult.reason}` };
        }
      }

      // Retry push after successful pull
      try {
        await git.push({
          fs,
          http: gitHttp,
          dir,
          ref: branch,
          remoteRef: branch,
          onAuth: tokenAuth(token),
          onProgress: onProgress ?? undefined,
        });
        return { success: true };
      } catch (retryError) {
        const retryRaw = retryError instanceof Error ? retryError.message : String(retryError);
        const classifiedError = classifyPushError(retryRaw);
        console.warn(`[recovery] push retry failed (branch: ${branch}):`, classifiedError);
        return { success: false, error: classifiedError };
      }
    }

    // Other errors
    return { success: false, error: classifyPushError(raw) };
  }
}

// ---------------------------------------------------------------------------
// Force push — local always wins
// ---------------------------------------------------------------------------

export interface PushWithForceOptions {
  repoPath: string;
  branch: string;
  token?: string;
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void;
}

export interface PushWithForceResult {
  success: boolean;
  error?: string;
}

/**
 * Force-push to remote. Local always wins — used by CloneSyncService save()
 * to implement commit + instant force-push without any queue or conflict UI.
 */
export async function pushWithForce(
  opts: PushWithForceOptions,
): Promise<PushWithForceResult> {
  const { repoPath, branch, token, onProgress } = opts;
  const info = parseRepoPath(repoPath);
  if (!info) return { success: false, error: `Invalid repo path: ${repoPath}` };

  const dir = repoDirVirtual(info.owner, info.repo);
  const fs = makeRepoFs();

  try {
    await ensureOnBranch(fs, dir, branch, token);
    await ensureCloneNotShallow(fs, dir, branch, token);
    await git.push({
      fs,
      http: gitHttp,
      dir,
      ref: branch,
      remoteRef: branch,
      force: true,
      onAuth: tokenAuth(token),
      onProgress: onProgress ?? undefined,
    });
    return { success: true };
  } catch (pushError) {
    const raw = pushError instanceof Error ? pushError.message : String(pushError);
    const classifiedError = classifyPushError(raw);
    console.warn(`[recovery] force-push failed (branch: ${branch}):`, classifiedError);
    return { success: false, error: classifiedError };
  }
}

/**
 * Remove a corrupted clone and re-clone it. Checks for uncommitted working
 * tree changes and unpushed local commits before attempting recovery — if
 * either exists, throws instead of destroying user data.
 */
export async function repairCloneAfterCorruption(opts: {
  repoPath: string;
  branch: string;
  token?: string;
  filePathForRecoveryCheck?: string;
}): Promise<void> {
  const { repoPath, branch, token, filePathForRecoveryCheck } = opts;
  const info = parseRepoPath(repoPath);
  if (!info) throw new Error(`Invalid repo path: ${repoPath}`);

  const dir = repoDirVirtual(info.owner, info.repo);
  const fs = makeRepoFs();

  // Check for uncommitted working tree changes that would be lost
  if (filePathForRecoveryCheck !== undefined) {
    try {
      const status = await git.status({ fs, dir, filepath: filePathForRecoveryCheck });
      if (status !== 'unmodified') {
        throw new Error(
          `Clone corruption detected with uncommitted changes to '${filePathForRecoveryCheck}' in ${repoPath}@${branch}. ` +
          `Please commit your changes before continuing.`,
        );
      }
    } catch (statusCheckError) {
      // If status check itself failed (e.g., repo already corrupt), propagate
      // the original error if it was a corruption error
      if (statusCheckError instanceof Error && isCorruptionError(statusCheckError.message)) {
        throw statusCheckError;
      }
    }
  }

  const hasLocalCommits = await hasUnpushedLocalCommits(repoPath, branch);
  if (hasLocalCommits) {
    throw new Error(
      `Clone corruption detected with unpushed local commits in ${repoPath}@${branch}. ` +
      `Please push your changes or reset before continuing.`,
    );
  }

  await GitFsService.removeRepo({ repoPath });
  await GitFsService.clone({ repoPath, branch, token: token ?? undefined });
}
