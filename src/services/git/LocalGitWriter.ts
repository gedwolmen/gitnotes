import * as FileSystem from 'expo-file-system/legacy';
import git from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs as buildGitFs } from './gitFs';
import { gitHttp } from './gitHttp';

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
      const absVirtual = `${dir}/${opts.filePath}`;
      const absUri = `${fsRoot}${absVirtual.replace(/^\//, '')}`;
      await ensureParentDirs(fsRoot, absVirtual);
      await FileSystem.writeAsStringAsync(absUri, opts.content);

      await git.add({ fs, dir, filepath: opts.filePath });
      await git.commit({
        fs,
        dir,
        message: opts.message,
        author: { name: opts.author.name, email: opts.author.email },
      });

      if (opts.push !== false) {
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: tokenAuth(opts.token),
        });
      }

      return { success: true, filePath: opts.filePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Remove a tracked file from the working tree, stage + commit, optionally
   * push.
   */
  static async deleteAndCommit(opts: DeleteOpts): Promise<LocalGitWriterResult> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    const fsRoot = clonesRoot();

    try {
      const absUri = `${fsRoot}${info.owner}/${info.repo}/${opts.filePath}`;
      await FileSystem.deleteAsync(absUri, { idempotent: true });

      await git.remove({ fs, dir, filepath: opts.filePath });
      await git.commit({
        fs,
        dir,
        message: opts.message,
        author: { name: opts.author.name, email: opts.author.email },
      });

      if (opts.push !== false) {
        await git.push({
          fs,
          dir,
          http: gitHttp,
          ref: opts.branch,
          remoteRef: opts.branch,
          onAuth: tokenAuth(opts.token),
        });
      }

      return { success: true, filePath: opts.filePath };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /**
   * Push pending local commits to the remote without staging or committing
   * anything new. Used to flush a debounced batch of write calls that ran
   * with `push: false`.
   */
  static async push(opts: { repoPath: string; branch: string; token?: string }): Promise<
    LocalGitWriterResult
  > {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    try {
      await git.push({
        fs,
        dir,
        http: gitHttp,
        ref: opts.branch,
        remoteRef: opts.branch,
        onAuth: tokenAuth(opts.token),
      });
      return { success: true };
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
