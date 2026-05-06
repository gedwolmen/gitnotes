import * as FileSystem from 'expo-file-system/legacy';
import git from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs as buildGitFs } from './gitFs';
import { gitHttp } from './gitHttp';
import { formatSyncError } from './formatSyncError';
import { GitFsService } from './GitFsService';

const CLONES_SUBDIR = 'GitNotes/';

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
}

interface WriteOpts extends BaseOpts {
  filePath: string;
  content: string;
  /** When true, push immediately. Defaults to true; callers can batch by passing false. */
  push?: boolean;
  token?: string;
}

interface DeleteOpts extends BaseOpts {
  filePath: string;
  push?: boolean;
  token?: string;
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

function tokenAuth(token: string | undefined) {
  if (!token) return undefined;
  return () => ({ username: 'x-access-token', password: token });
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
  } catch (error) {
    void error;
    // local branch ref is missing — fetch then retry checkout below.
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
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    const fsRoot = clonesRoot();

    try {
      await ensureOnBranch(fs, dir, opts.branch, opts.token);

      const absVirtual = `${dir}/${opts.filePath}`;
      const absUri = `${fsRoot}${absVirtual.replace(/^\//, '')}`;
      await ensureParentDirs(fsRoot, absVirtual);
      await FileSystem.writeAsStringAsync(absUri, opts.content);

      await git.add({ fs, dir, filepath: opts.filePath });

      // Skip empty commits when the file content already matches HEAD. This
      // matters for the coalesced-push retry path: after a failed group-
      // flush in `NoteSyncQueueService.drain`, the same item is re-run on
      // the next drain. The file write replays identical content, so
      // `git.add` is a no-op and committing again would pollute history
      // with an empty commit. Net effect: failed pushes self-heal without
      // history churn.
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
            onAuth: tokenAuth(opts.token),
          });
        } catch (pushError) {
          // Same pull-then-retry shape as deleteAndCommit: when the
          // remote rejects as non-fast-forward, pull once and try the
          // push again. Doesn't re-stage / re-write — the local commit
          // is already made and a clean fast-forward will replay it.
          const raw = pushError instanceof Error ? pushError.message : String(pushError);
          if (!isPushRejected(raw)) throw pushError;
          await GitFsService.pullWithFastForward({
            repoPath: opts.repoPath,
            branch: opts.branch,
            token: opts.token,
          });
          await git.push({
            fs,
            dir,
            http: gitHttp,
            ref: opts.branch,
            remoteRef: opts.branch,
            onAuth: tokenAuth(opts.token),
          });
        }
      }

      return { success: true, filePath: opts.filePath };
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
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    const fsRoot = clonesRoot();

    try {
      await ensureOnBranch(fs, dir, opts.branch, opts.token);

      // Best-effort pull so we delete from the latest tree state. Diverged
      // local commits keep the existing path (commit lands locally and
      // push will retry with a stricter error if the server rejects).
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

      // git.remove can fail when the path moved upstream / was already
      // removed in a fresh pull. Treat NotFoundError as a no-op and
      // short-circuit; the file is already gone, deletion is complete.
      try {
        await git.remove({ fs, dir, filepath: opts.filePath });
      } catch (removeError) {
        const code = (removeError as { code?: string }).code;
        if (code === 'NotFoundError' || code === 'ENOENT') {
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
            onAuth: tokenAuth(opts.token),
          });
        } catch (pushError) {
          const raw = pushError instanceof Error ? pushError.message : String(pushError);
          if (!isPushRejected(raw)) throw pushError;
          // Pull again and retry push exactly once. Anything still
          // refusing means the upstream truly diverged and the user
          // needs to reconcile manually — propagate.
          await GitFsService.pullWithFastForward({
            repoPath: opts.repoPath,
            branch: opts.branch,
            token: opts.token,
          });
          await git.push({
            fs,
            dir,
            http: gitHttp,
            ref: opts.branch,
            remoteRef: opts.branch,
            onAuth: tokenAuth(opts.token),
          });
        }
      }

      return { success: true, filePath: opts.filePath };
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
  static async push(opts: { repoPath: string; branch: string; token?: string }): Promise<
    LocalGitWriterResult
  > {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    try {
      await ensureOnBranch(fs, dir, opts.branch, opts.token);
      try {
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: tokenAuth(opts.token),
        });
      } catch (pushError) {
        const raw = pushError instanceof Error ? pushError.message : String(pushError);
        if (!isPushRejected(raw)) throw pushError;
        await GitFsService.pullWithFastForward({
          repoPath: opts.repoPath,
          branch: opts.branch,
          token: opts.token,
        });
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: tokenAuth(opts.token),
        });
      }
      return { success: true };
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      console.warn('[LocalGitWriter] push failed:', raw);
      return { success: false, error: raw };
    }
  }
}
