import * as FileSystem from 'expo-file-system/legacy';
import git from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs as buildGitFs } from './gitFs';
import { gitHttp, setActiveGitHostKind } from './gitHttp';
import { formatSyncError } from './formatSyncError';
import { GitFsService, ensureToken } from './GitFsService';
import type { GitHostKind } from './hostAdapters';

const CLONES_SUBDIR = 'GitNotes/';

/**
 * # Host context threading
 *
 * Every public method on this class (`writeAndCommit`, `deleteAndCommit`,
 * `push`) accepts an optional `hostKind` + `baseUrl` on its opts. When
 * the caller doesn't pass one, the method falls back to
 * `setActiveGitHostKind(hostKind ?? 'github')` and `ensureToken()`
 * consults the same module-level state in `gitHttp.ts`.
 *
 * **Why this is implicit today**: the 10+ existing call sites
 * (`NoteGitHubSyncService`, `TodoGitHubSyncService`,
 * `CanvasGitHubSyncService`, `TemplateGitHubSyncService`,
 * `NoteSyncQueueService`, `ConflictResolverScreen`,
 * `CloneMigrationService`) all rely on the host kind being set by
 * the *most recent* `GitFsService.clone/fetch` call against the same
 * `repoPath`. For the typical clone-then-push flow that's correct.
 *
 * **Why this is a phase-2 follow-up**: the storage layer doesn't
 * currently persist host info per-repo — the call sites have no
 * source of truth to read from. The plan is:
 *   1. `AccountStorage` learns `hostKind` + `baseUrl` per account
 *      (storage layer)
 *   2. `GitRepository` in `repoStore` carries the host info
 *   3. Every LocalGitWriter call site threads `hostKind` and
 *      `baseUrl` explicitly from the repo record
 *
 * Until then, this implicit dependency works in practice but is
 * brittle if a future code path does e.g. a clone against GitHub
 * followed by a write to a Gitea repo before any fetch. If you
 * need to add a new call site, prefer passing `hostKind` + `baseUrl`
 * explicitly when you have them; otherwise document the implicit
 * dependency in the caller's docstring.
 */

/**
 * Result shape kept identical to the existing GitHub-Contents-API write paths
 * (`NoteGitHubSyncResult`, `TodoGitHubSyncResult`, …) so callers can swap
 * transports behind the SyncEngine flag without juggling shapes.
 */
export interface LocalGitWriterResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

interface AuthorInfo {
  name: string;
  email: string;
}

interface BaseOpts {
  repoPath: string;
  branch: string;
  message: string;
  author: AuthorInfo;
  /**
   * Host kind for the Basic auth convention used when pushing
   * upstream. Defaults to `'github'`. The shared `ensureToken`
   * helper in `GitFsService` reads the module-level active host
   * context (set by the most recent clone / fetch), so callers
   * don't strictly need to pass this for the typical
   * clone-then-push flow — but it's accepted explicitly for
   * callers that issue pushes without a prior GitFsService call.
   */
  hostKind?: GitHostKind;
  baseUrl?: string;
}

interface WriteOpts extends BaseOpts {
  filePath: string;
  content: string;
  /** When true, push immediately. Defaults to true; callers can batch by passing false. */
  push?: boolean;
  token?: string;
  /** Progress callback for push operations. */
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void;
}

interface DeleteOpts extends BaseOpts {
  filePath: string;
  push?: boolean;
  token?: string;
  /** Progress callback for push operations. */
  onProgress?: (progress: { phase: string; loaded: number; total: number }) => void;
}

function clonesRoot(): string {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) {
    throw new Error('expo-file-system documentDirectory is not available');
  }
  return docDir.endsWith('/') ? docDir + CLONES_SUBDIR : `${docDir}/${CLONES_SUBDIR}`;
}

function repoDirVirtual(owner: string, repo: string): string {
  return `/${owner}/${repo}`;
}

function makeRepoFs() {
  return buildGitFs(clonesRoot());
}

function bindHostContext(opts: { hostKind?: GitHostKind; baseUrl?: string }): void {
  // Make the active host context correct for the upcoming
  // git.push / git.fetch call. `ensureToken` consults the same
  // context, so a single set here covers both auth and any
  // host-aware URL building we add later.
  setActiveGitHostKind(opts.hostKind ?? 'github');
}

function isCorruptionError(errorMsg: string): boolean {
  return /Could not find|not foundobject|NotFoundError|Packfile trailer mismatch/i.test(errorMsg);
}

async function handleCorruptionAndRetry<T>(
  repoPath: string,
  branch: string,
  token: string | undefined,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (!isCorruptionError(errorMsg)) throw error;
    console.warn(`[LocalGitWriter] clone corruption detected, attempting recovery...`);
    const hasLocalCommits = await hasUnpushedLocalCommits(repoPath, branch);
    if (hasLocalCommits) {
      throw new Error(
        `Clone corruption detected with unpushed local commits in ${repoPath}@${branch}. ` +
        `Please push your changes or reset before continuing.`,
      );
    }
    await GitFsService.removeRepo({ repoPath });
    await GitFsService.clone({ repoPath, branch, token: token ?? undefined });
    return operation();
  }
}

async function hasUnpushedLocalCommits(repoPath: string, branch: string): Promise<boolean> {
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
    return false;
  }
}

async function ensureParentDirs(rootDir: string, virtualPath: string): Promise<void> {
  // virtualPath is e.g. "/me/repo/notes/foo.md". The on-disk root prefix lives
  // on the FS adapter; here we walk the path segments and `mkdir` each missing
  // ancestor under the absolute clones root. expo-file-system doesn't auto-
  // create parents on writeAsStringAsync.
  const parts = virtualPath.split('/').filter(Boolean);
  parts.pop(); // drop the file segment itself
  let acc = rootDir;
  for (const part of parts) {
    acc = acc + (acc.endsWith('/') ? '' : '/') + part;
    const info = await FileSystem.getInfoAsync(acc);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(acc, { intermediates: true });
    }
  }
}

/**
 * Make sure the working tree is on `branch` before we stage / commit /
 * push. Without this, commit lands on whatever HEAD was last set to (often
 * the branch the repo was originally cloned with, e.g. `master`) and the
 * subsequent push to a different `ref` either no-ops or surfaces a stale
 * `cannot lock ref 'refs/heads/master'` error from the server.
 *
 * If the branch ref is missing locally (single-branch clone of a different
 * branch), we fetch it from origin first and then check out.
 */
async function ensureOnBranch(
  fs: ReturnType<typeof makeRepoFs>,
  dir: string,
  branch: string,
  token: string | undefined,
): Promise<void> {
  const current = await git.currentBranch({ fs, dir, fullname: false }).catch(() => null);
  if (current === branch) return;

  try {
    await git.checkout({ fs, dir, ref: branch });
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
    onAuth: ensureToken(token),
  });
  await git.checkout({ fs, dir, ref: branch });
}

/**
 * Backwards-compatible thin re-export of the shared sanitizer. New
 * callers should use `formatSyncError` directly from
 * `services/git/formatSyncError`; this wrapper keeps the existing import
 * path in `noteStore` working without a refactor cascade.
 */
export function summarizePushError(raw: string | undefined): string {
  return formatSyncError(raw);
}

/**
 * Detects the family of push errors isomorphic-git surfaces when the
 * remote rejects a non-fast-forward push. Used to decide when to
 * pull-and-retry inside `deleteAndCommit`.
 */
function isPushRejected(raw: string): boolean {
  const m = raw.toLowerCase();
  return (
    m.includes('push rejected') ||
    m.includes('not a simple fast-forward') ||
    m.includes('non-fast-forward') ||
    m.includes('one or more branches were not updated')
  );
}

export class LocalGitWriter {
  /**
   * Write content into the working tree, stage + commit, optionally push.
   * Caller must have already cloned the repo (Phase 3 toggle handles that).
   * Returns the same `{ success, filePath?, error? }` shape the existing
   * Contents-API writers return.
   */
  static async writeAndCommit(opts: WriteOpts): Promise<LocalGitWriterResult> {
    bindHostContext(opts);
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (opts.content.length > MAX_FILE_SIZE) {
      return { success: false, error: `Refusing to write file exceeding 5 MB (${Math.round(opts.content.length / 1024 / 1024)} MB) — possible data corruption` };
    }

    try {
      return await handleCorruptionAndRetry(opts.repoPath, opts.branch, opts.token, async () => {
        const dir = repoDirVirtual(info.owner, info.repo);
        const fs = makeRepoFs();
        const fsRoot = clonesRoot();

        await ensureOnBranch(fs, dir, opts.branch, opts.token);

        const absVirtual = `${dir}/${opts.filePath}`;
        const absUri = `${fsRoot}${absVirtual.replace(/^\//, '')}`;
        await ensureParentDirs(fsRoot, absVirtual);
        await FileSystem.writeAsStringAsync(absUri, opts.content);

        await git.add({ fs, dir, filepath: opts.filePath });

        const fileStatus = await git.status({ fs, dir, filepath: opts.filePath });
        const hasTreeChange = fileStatus !== 'unmodified';
        if (hasTreeChange) {
          await git.commit({
            fs,
            dir,
            message: opts.message,
            author: { name: opts.author.name, email: opts.author.email },
          });
        }

        if (opts.push !== false) {
          try {
            await git.push({
              fs,
              dir,
              http: gitHttp,
              ref: opts.branch,
              remoteRef: opts.branch,
              onAuth: ensureToken(opts.token),
            });
          } catch (pushError) {
            const raw = pushError instanceof Error ? pushError.message : String(pushError);
            if (!isPushRejected(raw)) throw pushError;
            const ffResult = await GitFsService.pullWithFastForward({
              repoPath: opts.repoPath,
              branch: opts.branch,
              token: opts.token,
            });
            if (!ffResult.ok) {
              const ffError = ffResult.error ?? '';
              if (isCorruptionError(ffError)) {
                const hasLocal = await hasUnpushedLocalCommits(opts.repoPath, opts.branch);
                if (hasLocal) {
                  throw new Error(
                    `Clone corruption detected with unpushed local commits in ${opts.repoPath}@${opts.branch}. ` +
                    `Please push your changes or reset before continuing.`,
                  );
                }
                await GitFsService.removeRepo({ repoPath: opts.repoPath });
                await GitFsService.clone({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token });
                await ensureOnBranch(fs, dir, opts.branch, opts.token);
                await ensureParentDirs(fsRoot, absVirtual);
                await FileSystem.writeAsStringAsync(absUri, opts.content);
                await git.add({ fs, dir, filepath: opts.filePath });
                const replayStatus = await git.status({ fs, dir, filepath: opts.filePath });
                if (replayStatus !== 'unmodified') {
                  await git.commit({
                    fs,
                    dir,
                    message: opts.message,
                    author: { name: opts.author.name, email: opts.author.email },
                  });
                }
                await git.push({
                  fs,
                  dir,
                  http: gitHttp,
                  ref: opts.branch,
                  remoteRef: opts.branch,
                  onAuth: ensureToken(opts.token),
                });
                return { success: true, filePath: opts.filePath };
              } else if (ffResult.reason === 'diverged') {
                const remoteRef = `refs/remotes/origin/${opts.branch}`;
                const remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef });
                await git.writeRef({
                  fs,
                  dir,
                  ref: `refs/heads/${opts.branch}`,
                  value: remoteOid,
                  force: true,
                });
                await git.checkout({ fs, dir, ref: opts.branch, force: true });
                await ensureParentDirs(fsRoot, absVirtual);
                await FileSystem.writeAsStringAsync(absUri, opts.content);
                await git.add({ fs, dir, filepath: opts.filePath });
                const replayStatus = await git.status({ fs, dir, filepath: opts.filePath });
                if (replayStatus !== 'unmodified') {
                  await git.commit({
                    fs,
                    dir,
                    message: opts.message,
                    author: { name: opts.author.name, email: opts.author.email },
                  });
                }
                await git.push({
                  fs,
                  dir,
                  http: gitHttp,
                  ref: opts.branch,
                  remoteRef: opts.branch,
                  onAuth: ensureToken(opts.token),
                });
                return { success: true, filePath: opts.filePath };
              }
            }
            await git.push({
              fs,
              dir,
              http: gitHttp,
              ref: opts.branch,
              remoteRef: opts.branch,
              onAuth: ensureToken(opts.token),
            });
          }
        }

        return { success: true, filePath: opts.filePath };
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.warn('[LocalGitWriter] writeAndCommit failed:', raw);
      return { success: false, error: raw };
    }
  }

  /**
   * Remove a tracked file from the working tree, stage + commit,
   * optionally push. Pulls upstream first so the delete commit lands on
   * top of any concurrent edits — otherwise the push gets rejected as
   * non-fast-forward and the local row gets stranded (#567 fix C, the
   * single most common clone-mode delete failure).
   *
   * Push gets one auto-retry after a fresh pull when the server returns
   * a fast-forward / push-rejected error.
   */
  static async deleteAndCommit(opts: DeleteOpts): Promise<LocalGitWriterResult> {
    bindHostContext(opts);
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    try {
      return await handleCorruptionAndRetry(opts.repoPath, opts.branch, opts.token, async () => {
        const dir = repoDirVirtual(info.owner, info.repo);
        const fs = makeRepoFs();
        const fsRoot = clonesRoot();

        await ensureOnBranch(fs, dir, opts.branch, opts.token);

        try {
          await GitFsService.pullWithFastForward({
            repoPath: opts.repoPath,
            branch: opts.branch,
            token: opts.token,
          });
        } catch (pullError) {
          console.warn('[LocalGitWriter] deleteAndCommit pull failed (continuing):', pullError);
        }

        const absUri = `${fsRoot}${info.owner}/${info.repo}/${opts.filePath}`;
        await FileSystem.deleteAsync(absUri, { idempotent: true });

        try {
          await git.remove({ fs, dir, filepath: opts.filePath });
        } catch (removeError) {
          const code = (removeError as { code?: string }).code;
          const errorMsg = removeError instanceof Error ? removeError.message : String(removeError);
          if (code === 'NotFoundError' || code === 'ENOENT') {
            if (isCorruptionError(errorMsg)) throw removeError;
            return { success: true, filePath: opts.filePath };
          }
          throw removeError;
        }

        await git.commit({
          fs,
          dir,
          message: opts.message,
          author: { name: opts.author.name, email: opts.author.email },
        });

        if (opts.push !== false) {
          try {
            await git.push({
              fs,
              dir,
              http: gitHttp,
              ref: opts.branch,
              remoteRef: opts.branch,
              onAuth: ensureToken(opts.token),
            });
          } catch (pushError) {
            const raw = pushError instanceof Error ? pushError.message : String(pushError);
            if (!isPushRejected(raw)) throw pushError;
            const ffResult = await GitFsService.pullWithFastForward({
              repoPath: opts.repoPath,
              branch: opts.branch,
              token: opts.token,
            });
            if (!ffResult.ok) {
              const ffError = ffResult.error ?? '';
              if (isCorruptionError(ffError)) {
                const hasLocal = await hasUnpushedLocalCommits(opts.repoPath, opts.branch);
                if (hasLocal) {
                  throw new Error(
                    `Clone corruption detected with unpushed local commits in ${opts.repoPath}@${opts.branch}. ` +
                    `Please push your changes or reset before continuing.`,
                  );
                }
                await GitFsService.removeRepo({ repoPath: opts.repoPath });
                await GitFsService.clone({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token });
                await ensureOnBranch(fs, dir, opts.branch, opts.token);
                const absUri = `${fsRoot}${info.owner}/${info.repo}/${opts.filePath}`;
                await FileSystem.deleteAsync(absUri, { idempotent: true });
                await git.remove({ fs, dir, filepath: opts.filePath });
                await git.commit({
                  fs,
                  dir,
                  message: opts.message,
                  author: { name: opts.author.name, email: opts.author.email },
                });
                await git.push({
                  fs,
                  dir,
                  http: gitHttp,
                  ref: opts.branch,
                  remoteRef: opts.branch,
                  onAuth: ensureToken(opts.token),
                });
                return { success: true, filePath: opts.filePath };
              } else {
                throw new Error(`Push failed: ${ffResult.error ?? ffResult.reason}`);
              }
            }
            await git.push({
              fs,
              dir,
              http: gitHttp,
              ref: opts.branch,
              remoteRef: opts.branch,
              onAuth: ensureToken(opts.token),
            });
          }
        }

        return { success: true, filePath: opts.filePath };
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.warn('[LocalGitWriter] deleteAndCommit failed:', raw);
      return { success: false, error: raw };
    }
  }

  /**
   * Push pending local commits to the remote without staging or committing
   * anything new. Used by `NoteSyncQueueService.drain` to flush a coalesced
   * batch of write calls that ran with `push: false` (issue #565 phase
   * B.1). On non-fast-forward rejection we pull once and retry the push,
   * mirroring the pattern in `writeAndCommit` / `deleteAndCommit`.
   */
  static async push(opts: {
    repoPath: string;
    branch: string;
    token?: string;
    hostKind?: GitHostKind;
    baseUrl?: string;
  }): Promise<LocalGitWriterResult> {
    bindHostContext(opts);
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    try {
      await ensureOnBranch(fs, dir, opts.branch, opts.token);
      await git.push({
        fs,
        dir,
        http: gitHttp,
        ref: opts.branch,
        remoteRef: opts.branch,
        onAuth: ensureToken(opts.token),
      });
      return { success: true };
    } catch (pushError) {
      const raw = pushError instanceof Error ? pushError.message : String(pushError);
      if (isCorruptionError(raw)) {
        const hasLocal = await hasUnpushedLocalCommits(opts.repoPath, opts.branch);
        if (hasLocal) {
          return { success: false, error: `Clone corruption with unpushed commits in ${opts.repoPath}@${opts.branch}. Please push or reset.` };
        }
        await GitFsService.removeRepo({ repoPath: opts.repoPath });
        await GitFsService.clone({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token });
        return { success: false, error: 'Clone corruption detected, push failed. Please retry.' };
      }
      if (!isPushRejected(raw)) {
        console.warn('[LocalGitWriter] push failed:', raw);
        return { success: false, error: raw };
      }
      const ffResult = await GitFsService.pullWithFastForward({
        repoPath: opts.repoPath,
        branch: opts.branch,
        token: opts.token,
      });
      if (!ffResult.ok) {
        const ffError = ffResult.error ?? '';
        if (isCorruptionError(ffError)) {
          const hasLocal = await hasUnpushedLocalCommits(opts.repoPath, opts.branch);
          if (hasLocal) {
            return { success: false, error: `Clone corruption with unpushed commits in ${opts.repoPath}@${opts.branch}. Please push or reset.` };
          }
          await GitFsService.removeRepo({ repoPath: opts.repoPath });
          await GitFsService.clone({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token });
          return { success: false, error: 'Clone corruption detected, push failed. Please retry.' };
        }
        return { success: false, error: `Push failed: ${ffResult.error ?? ffResult.reason}` };
      }
      try {
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: ensureToken(opts.token),
        });
        return { success: true };
      } catch (retryError) {
        const retryRaw = retryError instanceof Error ? retryError.message : String(retryError);
        console.warn('[LocalGitWriter] push retry failed:', retryRaw);
        return { success: false, error: retryRaw };
      }
    }
  }
}
