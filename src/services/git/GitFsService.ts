import * as FileSystem from 'expo-file-system/legacy';
import git, { TREE } from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';
import { gitHttp } from './gitHttp';

const CLONES_SUBDIR = 'gitnotes-clones/';

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
    });
  }

  /** Fetch updates for the cloned repo. Caller must have run `clone` first. */
  static async fetch(opts: FetchOpts): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const dir = repoDirVirtual(info.owner, info.repo);

    await git.fetch({
      fs: makeRepoFs(),
      http: gitHttp,
      dir,
      ref: opts.branch,
      singleBranch: true,
      depth: opts.depth ?? 1,
      tags: false,
      onAuth: ensureToken(opts.token),
    });
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
      if (code === 'NotFoundError' || code === 'ENOENT') return null;
      throw e;
    }
  }

  /** Returns true when a clone exists locally for this repo. */
  static async isCloned(opts: RepoLocator): Promise<boolean> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return false;
    const fsRoot = clonesRoot();
    const head = `${fsRoot}${info.owner}/${info.repo}/.git/HEAD`;
    const stat = await FileSystem.getInfoAsync(head);
    return !!stat.exists && !stat.isDirectory;
  }

  /** Drop the on-disk clone for a repo. Idempotent. */
  static async removeRepo(opts: RepoLocator): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return;
    const fsRoot = clonesRoot();
    const dir = `${fsRoot}${info.owner}/${info.repo}`;
    await FileSystem.deleteAsync(dir, { idempotent: true });
  }

  /** Absolute on-disk URI of a repo's working tree. */
  static workingTreeUri(opts: RepoLocator): string {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    return `${clonesRoot()}${info.owner}/${info.repo}`;
  }
}
