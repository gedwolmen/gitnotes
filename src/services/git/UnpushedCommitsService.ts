import * as FileSystem from 'expo-file-system/legacy';
import git from 'isomorphic-git';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';
import { GitFsService } from './GitFsService';

const CLONES_SUBDIR = 'GitNotes/';
const MAX_COMMITS = 20;

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
  return makeGitFs(clonesRoot());
}

export interface CommitSummary {
  subject: string;
  oid: string;
  author: string;
  timestamp: number;
  filesChangedCount: number;
}

export interface ChangedFile {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

interface UnpushedOpts {
  repo: string;
  branch: string;
}

interface ListFilesOpts extends UnpushedOpts {
  oid: string;
}

export class UnpushedCommitsService {
  static async list(opts: UnpushedOpts): Promise<CommitSummary[]> {
    const info = parseRepoPath(opts.repo);
    if (!info) return [];

    const localRef = `refs/heads/${opts.branch}`;
    const remoteRef = `refs/remotes/origin/${opts.branch}`;

    const localOid = await GitFsService.getCommitOid({ repoPath: opts.repo, ref: localRef });
    const remoteOid = await GitFsService.getCommitOid({ repoPath: opts.repo, ref: remoteRef });

    if (!localOid) return [];

    const hasRemote = remoteOid !== null;
    if (hasRemote && localOid === remoteOid) return [];

    const mergeBase = hasRemote
      ? await GitFsService.findMergeBase({
          repoPath: opts.repo,
          ref1: localRef,
          ref2: remoteRef,
        })
      : null;

    if (hasRemote && mergeBase !== null && localOid === mergeBase) return [];

    // Stop point is the merge base OID (or the remote OID when merge base
    // could not be computed). This is an OID, not a ref string, so the
    // comparison against `commit.oid` in the log walk below works correctly.
    const stopOid = mergeBase ?? remoteOid;

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();
    const commits: CommitSummary[] = [];

    try {
      const log = await git.log({ fs, dir, ref: localRef, depth: MAX_COMMITS });
      for (const entry of log) {
        if (stopOid && entry.oid === stopOid) break;

        commits.push({
          subject: (entry.commit.message.split('\n')[0] ?? '').trim(),
          oid: entry.oid,
          author: entry.commit.author.name ?? entry.commit.author.email ?? 'unknown',
          timestamp: entry.commit.author.timestamp,
          filesChangedCount: await countFilesChanged(fs, dir, entry),
        });
      }
    } catch {
    }

    return commits;
  }

  static async count(opts: UnpushedOpts): Promise<number> {
    return (await this.list(opts)).length;
  }

  static async listFiles(opts: ListFilesOpts): Promise<ChangedFile[]> {
    const info = parseRepoPath(opts.repo);
    if (!info) return [];

    const dir = repoDirVirtual(info.owner, info.repo);
    const fs = makeRepoFs();

    try {
      const commit = await git.readCommit({ fs, dir, oid: opts.oid });
      const parentOid = commit.commit.parent[0] ?? null;

      const currentTree = await git.readTree({ fs, dir, oid: commit.commit.tree });
      const currentPaths = new Set(currentTree.tree.map((e) => e.path));

      if (!parentOid) {
        return currentTree.tree.map((entry) => ({ path: entry.path, status: 'added' as const }));
      }

      const parentTree = await git.readTree({ fs, dir, oid: parentOid });
      const parentMap = new Map(parentTree.tree.map((e) => [e.path, e.oid]));
      const files: ChangedFile[] = [];

      for (const e of currentTree.tree) {
        const prevOid = parentMap.get(e.path);
        if (prevOid === undefined) {
          files.push({ path: e.path, status: 'added' });
        } else if (prevOid !== e.oid) {
          files.push({ path: e.path, status: 'modified' });
        }
      }
      for (const e of parentTree.tree) {
        if (!currentPaths.has(e.path)) {
          files.push({ path: e.path, status: 'deleted' });
        }
      }

      return files;
    } catch {
      return [];
    }
  }
}

async function countFilesChanged(
  fs: ReturnType<typeof makeRepoFs>,
  dir: string,
  entry: { commit: { tree: string; parent: string[] } },
): Promise<number> {
  try {
    const tree = await git.readTree({ fs, dir, oid: entry.commit.tree });
    const parentOid = entry.commit.parent[0] ?? null;
    if (!parentOid) return tree.tree.length;

    const parentTree = await git.readTree({ fs, dir, oid: parentOid });
    const parentMap = new Map(parentTree.tree.map((e) => [e.path, e.oid]));
    let count = 0;
    for (const e of tree.tree) {
      if (parentMap.get(e.path) !== e.oid) count++;
    }
    for (const e of parentTree.tree) {
      if (!tree.tree.find((t) => t.path === e.path)) count++;
    }
    return count;
  } catch {
    return 0;
  }
}
