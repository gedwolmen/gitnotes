import * as FileSystem from 'expo-file-system/legacy';
import git, { TREE } from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';
import { gitHttp } from './gitHttp';
import { LfsService } from './lfs';

const CLONES_SUBDIR = 'GitNotes/';

/**
 * Minimum history depth we fetch so merge-base detection stays reachable.
 * `findMergeBase` needs ~2-3 commits of shared ancestry to compute a common
 * ancestor; a depth-1 shallow fetch cannot compute merge bases, which silently
 * disables divergence-conflict recording (the conflict-store branch surfaced by
 * `surfaceConflictsOnDiverged` in LocalGitWriter and RepoPullService's divergence
 * detection). Fetching ≥3 commits is a small constant cost (a few objects) and
 * makes the merge-base-based divergence detection in pull/push actually reachable.
 */
const MIN_DIVERGENCE_HISTORY_DEPTH = 3;

/**
 * Experiment flag: allows depth-2 fetches for the divergence-conflict E2E scenario.
 * When `GITNOTES_EXPERIMENT_DEPTH_2` is set, fetch/pull operations use depth 2 instead
 * of the default depth-3 floor. This lets the E2E harness measure whether depth 2
 * still produces correct conflict detection. Default (flag absent) is unchanged.
 */
const DEPTH_FOR_FETCH =
  process.env.GITNOTES_EXPERIMENT_DEPTH_2 === '1' ? 2 : MIN_DIVERGENCE_HISTORY_DEPTH;

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

/**
 * In-flight clone promises keyed by `${repoPath}::${branch}`. Imports at
 * add-time run OUTSIDE the sync gate (#938), so a startup/foreground pull's
 * lazy `getRepoReader` clone can race the add-time clone on the same repoPath
 * — both see `isCloned === false`. Concurrent callers for one key await the
 * same promise instead of cloning twice. Entries are dropped on settle; a
 * REJECTED clone is never cached, so a retry re-runs the clone instead of
 * awaiting the failure forever.
 */
const inflightClones = new Map<string, Promise<void>>();

/**
 * Thrown when the JS heap can't hold the incoming packfile. isomorphic-git
 * itself collects the whole packfile into one Buffer before indexing
 * (the `gitHttp` streaming patch removed only the app-side second copy), so
 * very large repos can OOM Hermes. The picker / clone toggle treats this as
 * a recommendation to switch to API mode instead of clone mode.
 */
export class CloneOutOfMemoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CloneOutOfMemoryError';
  }
}

function looksLikeOutOfMemory(error: unknown): boolean {
  if (error instanceof RangeError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /out of memory|allocation failed|Array buffer allocation failed|exceeded memory|heap/i.test(message);
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
    const fsRoot = clonesRoot();
    await FileSystem.makeDirectoryAsync?.(`${fsRoot}${info.owner}/`, { intermediates: true });

    await cleanCorruptedPackfiles(opts.repoPath);

    // Retry clone once on packfile corruption. Memory pressure or partial
    // downloads can leave isomorphic-git with a corrupt packfile; the
    // streaming fix in gitHttp reduces the frequency dramatically but doesn't
    // eliminate it entirely. One retry is sufficient for the vast majority of
    // transient corruption; we cap at 1 to avoid retry storms (issue #790).
    const MAX_CLONE_RETRIES = 1;
    let lastError: unknown;
    for (let attempt = 0; attempt <= MAX_CLONE_RETRIES; attempt++) {
      try {
        await git.clone({
          fs: makeRepoFs(),
          http: gitHttp,
          dir,
          url: authedRemote(info.owner, info.repo),
          ref: opts.branch,
          singleBranch: true,
          depth: opts.depth ?? 1,
          noCheckout: true,
          onAuth: ensureToken(opts.token),
          onProgress: opts.onProgress
            ? (event) => opts.onProgress!(event.phase, event.loaded, event.total ?? null)
            : undefined,
        });
        await git.checkout({
          fs: makeRepoFs(),
          dir,
          ref: opts.branch,
          batchSize: 64,
        });
        lastError = undefined;
        break;
      } catch (cloneError) {
        lastError = cloneError;
        await GitFsService.removeRepo({ repoPath: opts.repoPath }).catch(() => undefined);
        const msg = cloneError instanceof Error ? cloneError.message : String(cloneError);
        const isCorruption = /Packfile trailer mismatch|Could not find object|not foundobject|NotFoundError|internal error caused this command to fail/i.test(msg);
        if (looksLikeOutOfMemory(cloneError)) {
          throw new CloneOutOfMemoryError(
            `Out of memory while cloning ${opts.repoPath}. The repo is too large for clone mode on this device — switch to API mode.`,
          );
        }
        if (!isCorruption || attempt === MAX_CLONE_RETRIES) {
          throw cloneError;
        }
        await FileSystem.makeDirectoryAsync?.(`${fsRoot}${info.owner}/`, { intermediates: true }).catch(() => undefined);
        await cleanCorruptedPackfiles(opts.repoPath);
      }
    }
    if (lastError) throw lastError;

    // isomorphic-git has no smudge filter pipeline, so any LFS-tracked
    // binaries land on disk as ~130-byte pointer text files. Scan after clone
    // resolves so the object-download phase is never blocked by the tree walk.
    // Pointer detection is eventually-consistent — the UI must check
    // LfsService.isPending / hasUnresolved before surfacing a Download button.
    void LfsService.scanRepo(
      opts.repoPath,
      GitFsService.workingTreeUri({ repoPath: opts.repoPath }),
    ).catch((err: unknown) => console.warn('[GitFsService] LFS scan failed:', err));
  }

  /**
   * Deduplicated clone: concurrent callers for the same `${repoPath}::${branch}`
   * share ONE underlying `clone` promise, and callers arriving after a
   * successful clone short-circuit via `isCloned`. Use this instead of `clone`
   * wherever parallel code paths (add-time import, lazy pull-reader clone) can
   * race on the same repo (#938). The packfile-corruption retry inside `clone`
   * is preserved — dedup wraps it, never replaces it.
   */
  static cloneExclusive(opts: CloneOpts): Promise<void> {
    const key = `${opts.repoPath}::${opts.branch}`;
    const inflight = inflightClones.get(key);
    if (inflight) return inflight;
    const promise = (async () => {
      if (await GitFsService.isCloned({ repoPath: opts.repoPath })) return;
      await GitFsService.clone(opts);
    })().finally(() => {
      inflightClones.delete(key);
    });
    inflightClones.set(key, promise);
    return promise;
  }

  /** Test seam — drop all in-flight clone dedup entries. */
  static __resetCloneDedupForTest(): void {
    inflightClones.clear();
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
        depth: Math.max(opts.depth ?? DEPTH_FOR_FETCH, DEPTH_FOR_FETCH),
        tags: false,
        onAuth: ensureToken(opts.token),
      });
    } catch (fetchError) {
      const msg = fetchError instanceof Error ? fetchError.message : String(fetchError);
      if (/Packfile trailer mismatch|Could not find object|not foundobject|NotFoundError/i.test(msg)) {
        await cleanCorruptedPackfiles(opts.repoPath);
      }
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
      const remoteRef = `refs/remotes/origin/${opts.branch}`;
      const refBefore = await git.resolveRef({ fs, dir, ref: remoteRef }).catch(() => null);
      const startedAt = Date.now();
      await git.fetch({
        fs,
        http: gitHttp,
        dir,
        ref: opts.branch,
        singleBranch: true,
        depth: Math.max(opts.depth ?? DEPTH_FOR_FETCH, DEPTH_FOR_FETCH),
        tags: false,
        onAuth: ensureToken(opts.token),
      });
      await git.fastForward({
        fs,
        http: gitHttp,
        dir,
        ref: opts.branch,
        singleBranch: true,
        onAuth: ensureToken(opts.token),
      });
      // The LFS pointer walk is the most expensive step after a fetch. Skip it
      // when the remote ref did not move — no new objects arrived, so no new
      // placeholders can exist. This makes idle pulls (nothing changed on the
      // remote) avoid the full working-tree walk (#1022).
      const refAfter = await git.resolveRef({ fs, dir, ref: remoteRef }).catch(() => null);
      if (refBefore !== refAfter) {
        try {
          await LfsService.scanRepo(opts.repoPath, GitFsService.workingTreeUri({ repoPath: opts.repoPath }));
        } catch {
          // best-effort
        }
      }
      if (__DEV__) {
        console.log(`[GitFsService] pullWithFastForward (${opts.repoPath}@${opts.branch}) in ${Date.now() - startedAt}ms (${refBefore === refAfter ? 'no new objects' : 'fetched'})`);
      }
      return { ok: true };
    } catch (e) {
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
        if (/Could not find object|not foundobject|NotFoundError/i.test(msg)) {
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
    const fsRoot = clonesRoot();
    const head = `${fsRoot}${info.owner}/${info.repo}/.git/HEAD`;
    try {
      const stat = await FileSystem.getInfoAsync(head);
      if (!stat.exists || stat.isDirectory) return false;
      const content = await FileSystem.readAsStringAsync(head);
      const trimmed = content.trim();
      return trimmed.startsWith('ref: ') || /^[a-f0-9]{40}$/.test(trimmed);
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

  static async getChangedFilesBetweenRefs(opts: {
    repoPath: string;
    fromRef: string;
    toRef: string;
    maxCommits?: number;
  }): Promise<string[]> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return [];
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    const files = new Set<string>();
    const depth = opts.maxCommits ?? 20;

    try {
      const commits = await git.log({ fs, dir, ref: opts.toRef, depth });
      for (const commit of commits) {
        if (commit.oid === opts.fromRef) break;
        const tree = await git.readTree({ fs, dir, oid: commit.commit.tree });
        const parentOid = commit.commit.parent[0] ?? null;
        if (parentOid) {
          const parentTree = await git.readTree({ fs, dir, oid: parentOid });
          const parentMap = new Map(parentTree.tree.map((e) => [e.path, e.oid]));
          for (const entry of tree.tree) {
            const prevOid = parentMap.get(entry.path);
            if (!prevOid || prevOid !== entry.oid) {
              files.add(entry.path);
            }
          }
          for (const entry of parentTree.tree) {
            if (!tree.tree.find((e) => e.path === entry.path)) {
              files.add(entry.path);
            }
          }
        } else {
          for (const entry of tree.tree) {
            files.add(entry.path);
          }
        }
      }
    } catch {
      // Shallow clone may not have full history; return empty to trigger placeholder
    }
    return [...files];
  }

  static async mergeCommit(opts: {
    repoPath: string;
    branch: string;
    oursRef: string;
    theirsRef: string;
    message: string;
    author: { name: string; email: string };
    token?: string;
    /** Commit locally only (push deferred to the stage engine) when false. Defaults to true. */
    push?: boolean;
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

      if (opts.push !== false) {
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: ensureToken(opts.token),
        });
      }

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

  static async unstageFiles(opts: { repoPath: string; files: string[] }): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return;
    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    for (const file of opts.files) {
      await git.resetIndex({ fs, dir, ref: 'HEAD', filepath: file });
    }
  }
}
