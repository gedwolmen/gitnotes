import { parseRepoPath } from '../../utils/gitPathParser';
import { GitFsService } from './GitFsService';

const GITHUB_API_BASE = 'https://api.github.com';
const FALLBACK_BRANCH = 'main';

const sessionCache = new Map<string, string>();

/**
 * Best-effort resolution of the branch to use for a repo. Order:
 *   1. `hint` (caller-provided, usually `repo.branch` / `note.branch`)
 *   2. Local clone HEAD (clone-mode repos)
 *   3. GitHub API `default_branch`
 *   4. Hard fallback: 'main'
 *
 * Fixes #543: hardcoded `branch || 'main'` literals broke clone-mode
 * delete + write + pull on repos whose default branch is not `main`.
 */
export async function resolveBranch(
  repoPath: string,
  hint?: string | null,
): Promise<string> {
  if (hint) return hint;

  const cached = sessionCache.get(repoPath);
  if (cached) return cached;

  const local = await GitFsService.getCurrentBranch({ repoPath });
  if (local) {
    sessionCache.set(repoPath, local);
    return local;
  }

  const remote = await fetchGitHubDefaultBranch(repoPath);
  if (remote) {
    sessionCache.set(repoPath, remote);
    return remote;
  }

  return FALLBACK_BRANCH;
}

/** Forget any cached lookup for this repo. Call after the user re-binds or removes a repo. */
export function invalidateBranchCache(repoPath: string): void {
  sessionCache.delete(repoPath);
}

/** Test seam — clears the in-memory branch cache. */
export function __resetBranchCacheForTests(): void {
  sessionCache.clear();
}

export async function fetchGitHubDefaultBranch(repoPath: string): Promise<string | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;
  try {
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as { default_branch?: string };
    return json.default_branch ?? null;
  } catch {
    return null;
  }
}
