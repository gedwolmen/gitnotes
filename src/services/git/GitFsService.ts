import * as FileSystem from 'expo-file-system/legacy';
import git, { TREE } from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';
import { gitHttp } from './gitHttp';
import { LfsService } from './lfs';

const CLONES_SUBDIR = 'GitNotes/';

/**
 * Tree entry shape that mirrors `GitHubService.getTreeRecursiveOrThrow` so
 * later phases can swap one for the other behind the SyncEngine flag without
 * the callers caring which transport produced the listing.
 */
export interface GitTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}

interface RepoLocator {
  /** "owner/repo" — same canonical shape as GitRepository.path */
  repoPath: string;
}

interface CloneOpts extends RepoLocator {
  branch: string;
  token?: string;
  depth?: number;
  onProgress?: (phase: string, loaded: number, total: number | null) => void;
}

interface FetchOpts extends RepoLocator {
  branch: string;
  token?: string;
  depth?: number;
}

interface ReadOpts extends RepoLocator {
  ref: string;
  filepath: string;
}

interface ListOpts extends RepoLocator {
  ref: string;
}

function clonesRoot(): string {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) {
    throw new Error('expo-file-system documentDirectory is not available in this environment');
  }
  return docDir.endsWith('/') ? docDir + CLONES_SUBDIR : `${docDir}/${CLONES_SUBDIR}`;
}

function repoDirVirtual(owner: string, repo: string): string {
  // Virtual path passed to isomorphic-git. Stays free of the `file://` prefix
  // so any internal path normalisation (collapsing `//` etc.) doesn't damage
  // the URI; the real prefix lives on the FS adapter's root and gets joined
  // back on at FS-call time.
  return `/${owner}/${repo}`;
}

function makeRepoFs() {
  return makeGitFs(clonesRoot());
}

function ensureToken(token: string | undefined) {
  // GitHub PAT auth via Basic with a sentinel username. Same convention the
  // existing GitHubService uses through Authorization: Bearer; isomorphic-git
  // wants a username/password pair.
  if (!token) return undefined;
  return () => ({ username: 'x-access-token', password: token });
}

function authedRemote(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}.git`;
}

// Cache object for isomorphic-git operations - improves performance for large repos
const repoCaches = new Map<string, object>();

function getRepoCache(repoPath: string): object {
  if (!repoCaches.has(repoPath)) {
    repoCaches.set(repoPath, {});
  }
  return repoCaches.get(repoPath)!;
}

function clearRepoCache(repoPath: string): void {
  repoCaches.delete(repoPath);
}

/**
 * Remove corrupted packfiles from a repo's .git/objects/pack directory.
 * When a fetch times out, partial packfile data may be left on disk, causing
 * "Packfile trailer mismatch" errors on subsequent operations. Cleaning these
 * before clone/fetch prevents the error.
 */
async function cleanCorruptedPackfiles(repoPath: string): Promise<void> {
  const info = parseRepoPath(repoPath);
  if (!info) return;
  const packDir = `${clonesRoot()}${info.owner}/${info.repo}/.git/objects/pack`;
  try {
    const stat = await FileSystem.getInfoAsync(packDir);
    if (stat.exists && stat.isDirectory) {
      const files = await FileSystem.readDirectoryAsync(packDir);
      for (const file of files) {
        if (file.endsWith('.pack') || file.endsWith('.idx')) {
          await FileSystem.deleteAsync(`${packDir}/${file}`, { idempotent: true });
        }
      }
    }
  } catch {
    // If pack dir doesn't exist or can't be read, no cleanup needed
  }
}

export class GitFsService {
  /**
   * Clone a repo into the per-app document directory. Defaults to depth=1
   * (shallow) — Phase 1 only consumes file contents, full history isn't
   * needed and burns disk + bandwidth.
   */
  static async clone(opts: CloneOpts): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);

    const dir = repoDirVirtual(info.owner, info.repo);
    // expo-file-system won't auto-create ancestors when isomorphic-git first
    // touches the working tree. Pre-create the clones root + owner segment so
    // git.clone's own mkdir of the repo dir succeeds on a clean install.
    const fsRoot = clonesRoot();
    await FileSystem.makeDirectoryAsync?.(`${fsRoot}${info.owner}/`, { intermediates: true });

    await cleanCorruptedPackfiles(opts.repoPath);

    try {
      await git.clone({
        fs: makeRepoFs(),
        http: gitHttp,
        dir,
        url: authedRemote(info.owner, info.repo),
        ref: opts.branch,
        singleBranch: true,
        depth: opts.depth ?? 1,
        onAuth: ensureToken(opts.token),
        onProgress: opts.onProgress
          ? (event) => opts.onProgress!(event.phase, event.loaded, event.total ?? null)
          : undefined,
        cache: getRepoCache(opts.repoPath),
      });
    } catch (cloneError) {
      clearRepoCache(opts.repoPath);
      await GitFsService.removeRepo({ repoPath: opts.repoPath }).catch(() => undefined);
      throw cloneError;
    }

    // isomorphic-git has no smudge filter pipeline, so any LFS-tracked
    // binaries land on disk as ~130-byte pointer text files. Scan now and
    // remember them so the UI can surface a "Download" affordance and the
    // user isn't left wondering why their PDF won't open.
    try {
      await LfsService.scanRepo(opts.repoPath, GitFsService.workingTreeUri({ repoPath: opts.repoPath }));
    } catch {
      // best-effort; pointer detection failure shouldn't fail the clone.
    }
  }

  /** Fetch updates for the cloned repo. Caller must have run `clone` first. */
  static async fetch(opts: FetchOpts): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const dir = repoDirVirtual(info.owner, info.repo);

    try {
      await git.fetch({
        fs: makeRepoFs(),
        http: gitHttp,
        dir,
        ref: opts.branch,
        singleBranch: true,
        depth: opts.depth ?? 1,
        tags: false,
        onAuth: ensureToken(opts.token),
        cache: getRepoCache(opts.repoPath),
      });
    } catch (fetchError) {
      clearRepoCache(opts.repoPath);
      await cleanCorruptedPackfiles(opts.repoPath);
      throw fetchError;
    }
  }

  /**
   * Fetch from origin then fast-forward the local branch if possible. Returns
   * `{ ok: true }` on success and `{ ok: false, reason }` when the local
   * branch has diverged from upstream. The pull-side caller (#514 phase 5)
   * uses this in place of a plain fetch so we never silently overwrite local
   * write commits the user hasn't pushed yet.
   *
   * Real 3-way merge / rebase + multi-file conflict UI are deferred — phase 5
   * deliberately stops at "detect divergence and skip reconcile" so a stale
   * upstream snapshot can't drop in-flight local edits. Conflict resolution
   * UX is a separate, larger product surface.
   */
  static async pullWithFastForward(opts: FetchOpts): Promise<
    { ok: true } | { ok: false; reason: 'diverged' | 'unknown'; error?: string }
  > {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { ok: false, reason: 'unknown', error: `Invalid repo path: ${opts.repoPath}` };
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();

    try {
      await git.fetch({
        fs,
        http: gitHttp,
        dir,
        ref: opts.branch,
        singleBranch: true,
        depth: opts.depth ?? 1,
        tags: false,
        onAuth: ensureToken(opts.token),
        cache: getRepoCache(opts.repoPath),
      });
      await git.fastForward({
        fs,
        http: gitHttp,
        dir,
        ref: opts.branch,
        singleBranch: true,
        onAuth: ensureToken(opts.token),
      });
      try {
        await LfsService.scanRepo(opts.repoPath, GitFsService.workingTreeUri({ repoPath: opts.repoPath }));
      } catch {
        // best-effort
      }
      return { ok: true };
    } catch (e) {
      clearRepoCache(opts.repoPath);
      const message = e instanceof Error ? e.message : String(e);
      // isomorphic-git surfaces fast-forward failure as MergeNotSupportedError
      // / FastForwardError; treat both as "diverged".
      const code = (e as { code?: string }).code;
      if (
        code === 'FastForwardError' ||
        code === 'MergeNotSupportedError' ||
        /not.*fast.?forward/i.test(message)
      ) {
        return { ok: false, reason: 'diverged', error: message };
      }
      await cleanCorruptedPackfiles(opts.repoPath);
      return { ok: false, reason: 'unknown', error: message };
    }
  }

  /**
   * Recursive tree listing at the given ref. Output mirrors
   * `GitHubService.getTreeRecursiveOrThrow` so the Phase 2 swap is a transport
   * change, not a shape change.
   */
  static async listTree(opts: ListOpts): Promise<GitTreeEntry[]> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const dir = repoDirVirtual(info.owner, info.repo);

    const fs = makeRepoFs();
    const out: GitTreeEntry[] = [];
    await git.walk({
      fs,
      dir,
      trees: [TREE({ ref: opts.ref })],
      map: async (filename, entries) => {
        if (filename === '.') return;
        const entry = entries?.[0];
        if (!entry) return;
        const type = await entry.type();
        if (type !== 'blob' && type !== 'tree') return;
        const sha = await entry.oid();
        out.push({ path: filename, type, sha });
      },
    });
    return out;
  }

  /**
   * Read a single file's contents at a ref. Returns null when missing so
   * callers can keep their existing `null === missing` shape.
   */
  static async readFile(opts: ReadOpts): Promise<string | null> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const dir = repoDirVirtual(info.owner, info.repo);

    try {
      const oid = await git.resolveRef({ fs: makeRepoFs(), dir, ref: opts.ref });
      const { blob } = await git.readBlob({
        fs: makeRepoFs(),
        dir,
        oid,
        filepath: opts.filepath,
      });
      return new TextDecoder('utf-8').decode(blob);
    } catch (e) {
      const code = (e as { code?: string }).code;
      const msg = e instanceof Error ? e.message : String(e);
      if (code === 'NotFoundError' || code === 'ENOENT') {
        if (/Could not find|not foundobject|NotFoundError/i.test(msg)) {
          throw e;
        }
        return null;
      }
      throw e;
    }
  }

  /** Returns true when a clone exists locally for this repo. */
  static async isCloned(opts: RepoLocator): Promise<boolean> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return false;
    const dir = repoDirVirtual(info.owner, info.repo);
    try {
      await git.resolveRef({ fs: makeRepoFs(), dir, ref: 'HEAD' });
      return true;
    } catch {
      return false;
    }
  }

  /** Drop the on-disk clone for a repo. Idempotent. */
  static async removeRepo(opts: RepoLocator): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return;
    const fsRoot = clonesRoot();
    const dir = `${fsRoot}${info.owner}/${info.repo}`;
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await LfsService.clearRepo(opts.repoPath).catch(() => undefined);
    clearRepoCache(opts.repoPath);
  }

  /** Absolute on-disk URI of a repo's working tree. */
  static workingTreeUri(opts: RepoLocator): string {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    return `${clonesRoot()}${info.owner}/${info.repo}`;
  }

  /**
   * Resolves the local clone's current branch (HEAD ref). Returns null when
   * the repo isn't cloned, HEAD is detached, or the lookup fails. Used by
   * `resolveBranch` (#543) so clone-mode operations don't push to a
   * hardcoded `main` ref the cloned repo may not have.
   */
  static async getCurrentBranch(opts: RepoLocator): Promise<string | null> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return null;
    const dir = repoDirVirtual(info.owner, info.repo);
    try {
      const branch = await git.currentBranch({ fs: makeRepoFs(), dir, fullname: false });
      return branch ?? null;
    } catch {
      return null;
    }
  }

  static async getCommitOid(opts: RepoLocator & { ref: string }): Promise<string | null> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return null;
    const dir = repoDirVirtual(info.owner, info.repo);
    try {
      const oid = await git.resolveRef({ fs: makeRepoFs(), dir, ref: opts.ref });
      return oid;
    } catch {
      return null;
    }
  }

  static async findMergeBase(opts: {
    repoPath: string;
    ref1: string;
    ref2: string;
  }): Promise<string | null> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return null;
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    try {
      const oid1 = await git.resolveRef({ fs, dir, ref: opts.ref1 });
      const oid2 = await git.resolveRef({ fs, dir, ref: opts.ref2 });
      const bases = await git.findMergeBase({ fs, dir, oids: [oid1, oid2] });
      return bases?.[0] ?? null;
    } catch {
      return null;
    }
  }

  static async mergeCommit(opts: {
    repoPath: string;
    branch: string;
    oursRef: string;
    theirsRef: string;
    message: string;
    author: { name: string; email: string };
    token?: string;
  }): Promise<{ sha: string } | { error: string }> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { error: `Invalid repo path: ${opts.repoPath}` };
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();

    try {
      const oursOid = await git.resolveRef({ fs, dir, ref: opts.oursRef });
      const theirsOid = await git.resolveRef({ fs, dir, ref: opts.theirsRef });

      const sha = await git.commit({
        fs,
        dir,
        message: opts.message,
        author: opts.author,
        parent: [oursOid, theirsOid],
        ref: opts.branch,
      });

      await git.push({
        fs,
        dir,
        http: gitHttp,
        ref: opts.branch,
        remoteRef: opts.branch,
        onAuth: ensureToken(opts.token),
      });

      return { sha };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { error: message };
    }
  }

  static async readBlobAtRef(opts: {
    repoPath: string;
    ref: string;
    filepath: string;
  }): Promise<{ content: string; oid: string } | null> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return null;
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();

    try {
      const resolved = await git.resolveRef({ fs, dir, ref: opts.ref });
      const blob = await git.readBlob({ fs, dir, oid: resolved, filepath: opts.filepath });
      return { content: new TextDecoder('utf-8').decode(blob.blob), oid: blob.oid };
    } catch {
      return null;
    }
  }
}
