import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';

// Stub git object - operations are no-ops until GitEngine is fully integrated
const git = {
  resolveRef: async (_opts: { fs: unknown; dir: string; ref: string }): Promise<string> => '',
  log: async (_opts: { fs: unknown; dir: string; ref: string; depth: number }): Promise<Array<{ oid: string; commit: { message: string; parent: string[]; tree: string } }>> => [],
};

const CLONES_SUBDIR = 'GitNotes/';

function clonesRoot(): string {
  const docDir = require('expo-file-system').documentDirectory;
  if (!docDir) {
    throw new Error('expo-file-system documentDirectory is not available');
  }
  return docDir.endsWith('/') ? docDir + CLONES_SUBDIR : docDir + '/' + CLONES_SUBDIR;
}

function makeRepoFs() {
  return makeGitFs(clonesRoot());
}

function repoDirVirtual(owner: string, repo: string): string {
  return '/' + owner + '/' + repo;
}

/**
 * Durable record of stranded local commits that failed to push after
 * MAX_ATTEMPTS retries in clone mode.
 */
export const STRANDED_COMMITS_STORAGE_KEY = '@gitnotes:stranded_commits_v1';

export interface StrandedCommitEntry {
  key: string;
  sha: string;
  oid: string;
  message: string;
  strandedAt: number;
  repo: string;
  branch: string;
  error: string;
}

export type StrandedCommitMap = Record<string, StrandedCommitEntry>;

export function strandedCommitKey(
  repo: string,
  branch: string,
  oid: string,
): string {
  return repo + '::' + branch + '::' + oid;
}

export async function getStrandedCommitOid(
  repoPath: string,
  branch: string,
): Promise<{ oid: string; message: string } | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;

  const localRef = 'refs/heads/' + branch;
  const remoteRef = 'refs/remotes/origin/' + branch;
  const dir = repoDirVirtual(info.owner, info.repo);
  const fs = makeRepoFs();

  try {
    const localOid = await git.resolveRef({ fs, dir, ref: localRef });
    const remoteOid = await git.resolveRef({ fs, dir, ref: remoteRef }).catch(() => null);

    if (remoteOid === null) return null;
    if (localOid === remoteOid) return null;

    const commits = await git.log({ fs, dir, ref: localRef, depth: 100 });
    for (const commit of commits) {
      if (commit.oid === remoteOid) break;
      if (commit.oid !== remoteOid) {
        const message = commit.commit.message.split('\n')[0] ?? '';
        return { oid: commit.oid, message };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function readStrandedCommits(): Promise<StrandedCommitMap> {
  try {
    const raw = await AsyncStorage.getItem(STRANDED_COMMITS_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StrandedCommitMap;
  } catch {
    return {};
  }
}

export async function recordStrandedCommit(
  repo: string,
  branch: string,
  oid: string,
  message: string,
  error: string,
): Promise<void> {
  try {
    const map = await readStrandedCommits();
    const key = strandedCommitKey(repo, branch, oid);
    map[key] = {
      key,
      sha: oid.slice(0, 7),
      oid,
      message,
      strandedAt: Date.now(),
      repo,
      branch,
      error,
    };
    await AsyncStorage.setItem(STRANDED_COMMITS_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort */ }
}

export async function clearStrandedCommit(
  repo: string,
  branch: string,
  oid: string,
): Promise<void> {
  try {
    const map = await readStrandedCommits();
    const key = strandedCommitKey(repo, branch, oid);
    if (!(key in map)) return;
    delete map[key];
    await AsyncStorage.setItem(STRANDED_COMMITS_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort */ }
}

export async function clearStrandedCommitsForRepo(repoPath: string): Promise<void> {
  try {
    const map = await readStrandedCommits();
    const prefix = repoPath + '::';
    let changed = false;
    for (const key of Object.keys(map)) {
      if (key.startsWith(prefix)) {
        delete map[key];
        changed = true;
      }
    }
    if (!changed) return;
    await AsyncStorage.setItem(STRANDED_COMMITS_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort */ }
}
