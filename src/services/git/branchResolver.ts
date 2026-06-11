import { parseRepoPathAt } from '../../utils/gitPathParser';
import { GitFsService } from './GitFsService';
import { getAdapter, type GitHostKind } from './hostAdapters';

const FALLBACK_BRANCH = 'main';

const sessionCache = new Map<string, string>();

/**
 * Best-effort resolution of the branch to use for a repo. Order:
 *   1. `hint` (caller-provided, usually `repo.branch` / `note.branch`)
 *   2. Local clone HEAD (clone-mode repos)
 *   3. Host REST API `default_branch` (GitHub, Gitea, Forgejo, …)
 *   4. Hard fallback: 'main'
 *
 * Fixes #543: hardcoded `branch || 'main'` literals broke clone-mode
 * delete + write + pull on repos whose default branch is not `main`.
 */
export async function resolveBranch(
  repoPath: string,
  hint?: string | null,
  context?: { hostKind?: GitHostKind; baseUrl?: string },
): Promise<string> {
  if (hint) return hint;

  const cached = sessionCache.get(repoPath);
  if (cached) return cached;

  const local = await GitFsService.getCurrentBranch({ repoPath });
  if (local) {
    sessionCache.set(repoPath, local);
    return local;
  }

  const remote = await fetchDefaultBranch(repoPath, context);
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

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Host-agnostic default-branch lookup. Dispatches to the registered
 * adapter for the host (or the GitHub adapter by default). The old
 * `fetchGitHubDefaultBranch` export is kept as a thin alias so the
 * handful of external callers in tests / other services keep
 * compiling unchanged.
 */
export async function fetchDefaultBranch(
  repoPath: string,
  context?: { hostKind?: GitHostKind; baseUrl?: string },
): Promise<string | null> {
  const hostKind: GitHostKind = context?.hostKind ?? 'github';
  const info = parseRepoPathAt(repoPath, context?.baseUrl);
  if (!info) return null;
  return getAdapter(hostKind).fetchDefaultBranch({
    baseUrl: context?.baseUrl,
    owner: info.owner,
    repo: info.repo,
    timeoutMs: FETCH_TIMEOUT_MS,
  });
}

/**
 * @deprecated Use `fetchDefaultBranch(repoPath, { hostKind: 'github' })` instead.
 * Retained for backward compatibility with existing call sites and
 * tests that hardcode the GitHub.com code path.
 */
export async function fetchGitHubDefaultBranch(repoPath: string): Promise<string | null> {
  return fetchDefaultBranch(repoPath, { hostKind: 'github' });
}
