/**
 * commitOps.ts — decomposed commit primitives for clone-mode sync.
 *
 * Pure local-git operations: no network calls, no push/pull.
 * All helpers return `{ success: boolean, oid?: string, error?: string }`.
 *
 * Helpers consolidated from LocalGitWriter.ts, CommitService.ts, and GitFsService.ts:
 * - `clonesRoot()` — root directory for cloned repos
 * - `repoDirVirtual(owner, repo)` — virtual path for git
 * - `toRepoRelativePath(filePath)` — strip leading slashes for git ops
 * - `makeRepoFs()` — build a git-fs adapter rooted at clonesRoot
 * - `ensureParentDirs(rootDir, virtualPath)` — create parent dirs before write
 * - `repairHeadRef(fs, dir, branch)` — fix corrupted .git/HEAD
 */

import * as FileSystem from 'expo-file-system/legacy';
import { parseRepoPath } from '../../utils/gitPathParser';
import { makeGitFs } from './gitFs';
import { repairHeadRef } from './GitFsService';
import { useGitActivityStore } from '../../stores/gitActivityStore';
import * as GitEngine from './engine/GitEngine';

const CLONES_SUBDIR = 'GitNotes/';

// ─── helpers ─────────────────────────────────────────────────────────────────

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

function toRepoRelativePath(filePath: string): string {
  return filePath.replace(/^\/+/, '');
}

function makeRepoFs() {
  return makeGitFs(clonesRoot());
}

async function ensureParentDirs(rootDir: string, virtualPath: string): Promise<void> {
  const parts = virtualPath.split('/').filter(Boolean);
  parts.pop();
  let acc = rootDir;
  for (const part of parts) {
    acc = acc + (acc.endsWith('/') ? '' : '/') + part;
    const info = await FileSystem.getInfoAsync(acc);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(acc, { intermediates: true });
    }
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

export interface CommitOpsResult {
  success: boolean;
  oid?: string;
  error?: string;
}

export interface CommitWriteParams {
  repo: string;
  branch: string;
  filePath: string;
  content: string;
  message: string;
  author: { name: string; email: string };
}

/**
 * Write a file to disk, stage it, and commit it.
 * No push — pure local commit only.
 */
export async function commitWrite(params: CommitWriteParams): Promise<CommitOpsResult> {
  const { repo, branch, filePath, content, message, author } = params;

  const info = parseRepoPath(repo);
  if (!info) return { success: false, error: `Invalid repo path: ${repo}` };

  const relPath = toRepoRelativePath(filePath);

  try {
    const dir = repoDirVirtual(info.owner, info.repo);
    const fsRoot = clonesRoot();
    const repoDir = `${fsRoot.replace(/\/$/, '')}${dir}`;

    await ensureOnBranch(repoDir, branch);

    const absVirtual = `${dir}/${relPath}`;
    const absUri = `${fsRoot}${absVirtual.replace(/^\//, '')}`;
    await ensureParentDirs(fsRoot, absVirtual);
    await FileSystem.writeAsStringAsync(absUri, content);

    await GitEngine.stage(repoDir, [relPath]);

    const allStatuses = await GitEngine.statuses(repoDir);
    const fileStatus = allStatuses.find(f => f.path === relPath);
    if (!fileStatus || fileStatus.status !== 'Unmodified') {
      const commitInfo = await GitEngine.commit(repoDir, message, { name: author.name, email: author.email });
      useGitActivityStore.getState().incrementRevision();
      return { success: true, oid: commitInfo.id };
    }

    return { success: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { success: false, error: raw };
  }
}

export interface CommitDeleteParams {
  repo: string;
  branch: string;
  filePath: string;
  message: string;
  author: { name: string; email: string };
}

/**
 * Delete a tracked file from the working tree, stage + commit.
 * No push — pure local commit only.
 * No-ops gracefully when the file is already gone (NotFoundError).
 */
export async function commitDelete(params: CommitDeleteParams): Promise<CommitOpsResult> {
  const { repo, branch, filePath, message, author } = params;

  const info = parseRepoPath(repo);
  if (!info) return { success: false, error: `Invalid repo path: ${repo}` };

  const relPath = toRepoRelativePath(filePath);

  try {
    const dir = repoDirVirtual(info.owner, info.repo);
    const fsRoot = clonesRoot();
    const repoDir = `${fsRoot.replace(/\/$/, '')}${dir}`;

    await ensureOnBranch(repoDir, branch);

    const absUri = `${fsRoot}${info.owner}/${info.repo}/${relPath}`;
    await FileSystem.deleteAsync(absUri, { idempotent: true });

    try {
      await GitEngine.remove(repoDir, [relPath]);
    } catch (removeError) {
      const code = (removeError as { code?: string }).code;
      if (code === 'NotFoundError' || code === 'ENOENT') {
        // file already gone — treat as success (no-op)
        return { success: true };
      }
      throw removeError;
    }

    const commitInfo = await GitEngine.commit(repoDir, message, { name: author.name, email: author.email });
    useGitActivityStore.getState().incrementRevision();
    return { success: true, oid: commitInfo.id };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { success: false, error: raw };
  }
}

export interface CommitRenameParams {
  repo: string;
  branch: string;
  prevFilePath: string;
  filePath: string;
  content: string;
  message: string;
  author: { name: string; email: string };
}

/**
 * Produce ONE commit (single parent) that represents a rename.
 * Sequence: remove(old) → write(new) → stage(new) → commit
 * Both the deletion of the old path and creation of the new path land in
 * a single atomic commit via the git's full-index commit.
 */
export async function commitRename(params: CommitRenameParams): Promise<CommitOpsResult> {
  const { repo, branch, prevFilePath, filePath, content, message, author } = params;

  const info = parseRepoPath(repo);
  if (!info) return { success: false, error: `Invalid repo path: ${repo}` };

  const prevRelPath = toRepoRelativePath(prevFilePath);
  const newRelPath = toRepoRelativePath(filePath);

  try {
    const dir = repoDirVirtual(info.owner, info.repo);
    const fsRoot = clonesRoot();
    const repoDir = `${fsRoot.replace(/\/$/, '')}${dir}`;

    await ensureOnBranch(repoDir, branch);

    // 1. Stage deletion of the old file
    try {
      await GitEngine.remove(repoDir, [prevRelPath]);
    } catch (removeError) {
      const code = (removeError as { code?: string }).code;
      if (code === 'NotFoundError' || code === 'ENOENT') {
        // old file already gone — skip remove, continue to write new
      } else {
        throw removeError;
      }
    }

    // 2. Write the new file to disk
    const newAbsVirtual = `${dir}/${newRelPath}`;
    const newAbsUri = `${fsRoot}${newAbsVirtual.replace(/^\//, '')}`;
    await ensureParentDirs(fsRoot, newAbsVirtual);
    await FileSystem.writeAsStringAsync(newAbsUri, content);

    // 3. Stage the new file
    await GitEngine.stage(repoDir, [newRelPath]);

    // 4. Commit both staged changes in one commit
    const commitInfo = await GitEngine.commit(repoDir, message, { name: author.name, email: author.email });

    useGitActivityStore.getState().incrementRevision();
    return { success: true, oid: commitInfo.id };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    return { success: false, error: raw };
  }
}

export interface EnsureOnBranchParams {
  repo: string;
  branch: string;
}

/**
 * Ensure the repo is on the requested branch.
 *
 * Repairs corrupted .git/HEAD refs (e.g. "ref: refs/heads/refs/heads/main")
 * before any branch operation.
 *
 * If the local branch ref is missing (never checked out locally), fetches
 * from the remote first, then checks out.
 *
 * No-op if already on the requested branch.
 */
export async function ensureOnBranch(
  repoDir: string,
  branch: string,
): Promise<void> {
  const fs = makeGitFs(clonesRoot());
  const dir = `/${repoDir.replace(clonesRoot(), '').replace(/^\//, '')}`;

  await repairHeadRef(fs, dir, branch);

  const repoInfo = await GitEngine.repoInfo(repoDir).catch(() => null);
  const current = repoInfo?.currentBranch ?? null;
  if (current === branch) return;

  try {
    await GitEngine.checkoutBranch(repoDir, branch, 'origin');
    return;
  } catch {
    // local branch ref is missing — fetch then retry checkout below
  }

  await GitEngine.fetch(repoDir, 'origin');
  await GitEngine.checkoutBranch(repoDir, branch, 'origin');
}
