import { GitHubService, GitHubTreeEntry, TokenOpts } from '../GitHubService';
import { extractHttpErrorDetails } from './syncFailure';

export interface BatchDeleteFilesInput {
  owner: string;
  repo: string;
  branch: string;
  paths: string[];
  message: string;
  opts?: TokenOpts;
}

export interface BatchDeleteFailedPath {
  path: string;
  error: string;
}

export interface BatchDeleteFilesResult {
  success: boolean;
  deleted: string[];
  failed: BatchDeleteFailedPath[];
}

/** Initial cycle + up to 2 full retries when updateRef reports the branch moved. */
const MAX_CYCLE_ATTEMPTS = 3;

type CycleOutcome =
  | { ok: true }
  | { ok: false; fromUpdateRef: boolean; error: unknown };

/**
 * Builds the explicit tree payload for a delete-only commit: the recursive
 * listing minus every deleted path. A subtree entry survives only when the
 * deletions neither touch it nor anything below it — a stale subtree sha
 * after an internal delete would resurrect the very files being removed.
 * Blobs under a kept (unchanged) subtree are omitted: the subtree sha fully
 * describes them, and re-listing them risks GitHub rejecting the duplicate
 * coverage.
 */
export function buildTreeMinusPaths(
  entries: GitHubTreeEntry[],
  deletePaths: string[],
): GitHubTreeEntry[] {
  const deletedSet = new Set(deletePaths);
  const isDeletedOrUnderDeleted = (path: string): boolean =>
    deletedSet.has(path) || deletePaths.some((d) => path.startsWith(d + '/'));

  const keptSubtrees = entries
    .filter(
      (entry) =>
        entry.type === 'tree' &&
        !isDeletedOrUnderDeleted(entry.path) &&
        !deletePaths.some((d) => d.startsWith(entry.path + '/')),
    )
    .map((entry) => entry.path);
  const underKeptSubtree = (path: string): boolean =>
    keptSubtrees.some((t) => path.startsWith(t + '/'));

  return entries.filter((entry) => {
    if (isDeletedOrUnderDeleted(entry.path)) return false;
    if (entry.type === 'tree') return keptSubtrees.includes(entry.path);
    return !underKeptSubtree(entry.path);
  });
}

async function runDeleteCycle(
  input: BatchDeleteFilesInput,
  uniquePaths: string[],
): Promise<CycleOutcome> {
  const { owner, repo, branch, message, opts } = input;
  try {
    const head = await GitHubService.getBranchHead(owner, repo, branch, opts);
    const commit = await GitHubService.getCommit(owner, repo, head.sha, opts);
    const entries = await GitHubService.getTreeRaw(owner, repo, commit.treeSha, true, opts);
    const tree = buildTreeMinusPaths(entries, uniquePaths);
    const newTree = await GitHubService.createTree(owner, repo, tree, opts);
    const newCommit = await GitHubService.createCommit(owner, repo, {
      message,
      tree: newTree.sha,
      parents: [head.sha],
    }, opts);
    try {
      await GitHubService.updateRef(owner, repo, `heads/${branch}`, newCommit.sha, false, opts);
    } catch (error) {
      return { ok: false, fromUpdateRef: true, error };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, fromUpdateRef: false, error };
  }
}

function isBranchMovedError(error: unknown): boolean {
  const { status } = extractHttpErrorDetails(error);
  return status === 409 || status === 422;
}

async function deleteFilesSequentially(
  owner: string,
  repo: string,
  branch: string,
  paths: string[],
  message: string,
  opts?: TokenOpts,
): Promise<BatchDeleteFilesResult> {
  const deleted: string[] = [];
  const failed: BatchDeleteFailedPath[] = [];
  for (const path of paths) {
    try {
      const lookup = await GitHubService.getFileSha(owner, repo, path, branch, opts);
      if (lookup.kind === 'not-found') {
        deleted.push(path);
        continue;
      }
      if (lookup.kind === 'error') {
        failed.push({ path, error: lookup.message });
        continue;
      }
      const result = await GitHubService.deleteFile(owner, repo, path, message, lookup.sha, branch, opts);
      if (result) {
        deleted.push(path);
        continue;
      }
      failed.push({ path, error: 'GitHub API returned no result' });
    } catch (error) {
      const details = extractHttpErrorDetails(error);
      if (details.status === 404) {
        deleted.push(path);
        continue;
      }
      const errorMessage = details.message ?? (error instanceof Error ? error.message : String(error));
      failed.push({ path, error: errorMessage });
    }
  }
  return { success: failed.length === 0, deleted, failed };
}

/**
 * Deletes two or more remote files with ONE commit via the Git Data API:
 * head → commit → recursive tree → explicit tree minus the deleted paths →
 * createTree → createCommit(parent=head) → updateRef.
 *
 * A 409/422 from updateRef means the branch moved mid-flight; the whole
 * cycle is retried with a fresh head (up to 2 retries). Any terminal
 * Git-Data failure degrades to sequential typed-sha `deleteFile` calls and
 * merges the per-path outcomes — bulk must never be worse than per-file.
 * Throws for fewer than 2 paths (single files use the Contents API).
 */
export async function batchDeleteFiles(
  input: BatchDeleteFilesInput,
): Promise<BatchDeleteFilesResult> {
  const { paths } = input;
  if (paths.length < 2) {
    throw new Error('batchDeleteFiles requires at least 2 paths');
  }
  const uniquePaths = Array.from(new Set(paths));

  let terminalError: unknown = null;
  for (let attempt = 0; attempt < MAX_CYCLE_ATTEMPTS; attempt += 1) {
    const outcome = await runDeleteCycle(input, uniquePaths);
    if (outcome.ok) {
      return { success: true, deleted: uniquePaths, failed: [] };
    }
    terminalError = outcome.error;
    const retriable = outcome.fromUpdateRef && isBranchMovedError(outcome.error);
    if (!retriable || attempt === MAX_CYCLE_ATTEMPTS - 1) break;
  }

  console.warn(
    '[BatchGitOperations] batch delete cycle failed, falling back to per-file deletes:',
    terminalError,
  );
  return deleteFilesSequentially(
    input.owner,
    input.repo,
    input.branch,
    uniquePaths,
    input.message,
    input.opts,
  );
}
