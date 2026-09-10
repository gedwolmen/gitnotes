import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseRepoPath } from '../../utils/gitPathParser';
import { GitFsService } from './GitFsService';
import AuthService from '../AuthService';
import { getActiveGitHost } from './activeHost';

const GITHUB_API_BASE = 'https://api.github.com';
const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
const FALLBACK_BRANCH = 'main';

interface CacheEntry {
  repoId?: string;
  repoPath: string;
  branch: string;
}
const sessionCache = new Map<string, CacheEntry>();

async function resolveActiveProvider(): Promise<'github' | 'gitlab' | null> {
  try {
    const host = await getActiveGitHost();
    if (!host) return null;
    if (host.provider === 'github' || host.provider === 'gitlab') return host.provider;
    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve the branch for a repo operation. Order:
 *   1. Local clone HEAD (clone-mode repos) — verified against actual HEAD
 *   2. GitHub API `default_branch`
 *   3. Hard fallback: 'main'
 *
 * @param repoPath - The repository path
 * @param _hint - Deprecated and ignored. Internal operations bind to HEAD directly.
 * @param repoId - Optional repoId for cache key (preferred over repoPath)
 */
export async function resolveBranch(
  repoPath: string,
  _hint?: string | null,
  repoId?: string,
): Promise<string> {
  // Internal branch identity is bound to HEAD; hint is ignored.

  const cacheKey = repoId ?? repoPath;
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached.branch;

  const local = await GitFsService.getCurrentBranch({ repoPath });
  if (local) {
    sessionCache.set(cacheKey, { repoId, repoPath, branch: local });
    return local;
  }

  const provider = await resolveActiveProvider();
  const remote =
    provider === 'gitlab'
      ? await fetchGitLabDefaultBranch(repoPath)
      : await fetchGitHubDefaultBranch(repoPath);
  if (remote) {
    sessionCache.set(cacheKey, { repoId, repoPath, branch: remote });
    return remote;
  }

  return FALLBACK_BRANCH;
}

/** Forget any cached lookup for this repo. Call after the user re-binds or removes a repo. */
export function invalidateBranchCache(repoPath: string): void {
  sessionCache.delete(repoPath);
}

/**
 * Invalidate branch cache for a specific repo or all repos.
 * @param repoId - Optional repoId to invalidate specific repo cache.
 *                 If not provided, clears entire branch cache.
 */
export function invalidateCache(repoId?: string): void {
  if (repoId === undefined) {
    sessionCache.clear();
    return;
  }
  for (const key of sessionCache.keys()) {
    const entry = sessionCache.get(key);
    if (entry?.repoId === repoId || key === repoId) {
      sessionCache.delete(key);
    }
  }
}

/** Test seam — clears the in-memory branch cache. */
export function __resetBranchCacheForTests(): void {
  sessionCache.clear();
}

export { sessionCache };

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchGitHubDefaultBranch(
  repoPath: string,
  token?: string | null,
): Promise<string | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resolvedToken = token !== undefined ? token : await AuthService.getToken();
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (resolvedToken) {
      headers.Authorization = `Bearer ${resolvedToken}`;
    }
    const response = await fetch(
      `${GITHUB_API_BASE}/repos/${info.owner}/${info.repo}`,
      { headers, signal: controller.signal },
    );
    if (!response.ok) {
      clearTimeout(timeoutId);
      return null;
    }
    const json = (await response.json()) as { default_branch?: string };
    clearTimeout(timeoutId);
    return json.default_branch ?? null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

/**
 * Resolve the default branch of a GitLab project by its
 * "namespace/project" path. GitLab exposes the project directly via the
 * encoded path, so this works for gitlab.com and self-hosted instances.
 */
export async function fetchGitLabDefaultBranch(
  repoPath: string,
  token?: string | null,
): Promise<string | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resolvedToken = token !== undefined
      ? token
      : (async () => {
          try {
            const host = await getActiveGitHost();
            return host?.provider === 'gitlab' ? host.token : null;
          } catch {
            return null;
          }
        })();
    const resolved = resolvedToken instanceof Promise ? await resolvedToken : resolvedToken;
    const storedBase = await AsyncStorage.getItem('@gitnotes:gitlab_base_url');
    const baseUrl = (storedBase || GITLAB_API_BASE).replace(/\/+$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (resolved) {
      headers['PRIVATE-TOKEN'] = resolved;
    }
    const response = await fetch(
      `${baseUrl}/projects/${encodeURIComponent(`${info.owner}/${info.repo}`)}`,
      { headers, signal: controller.signal },
    );
    if (!response.ok) {
      clearTimeout(timeoutId);
      return null;
    }
    const json = (await response.json()) as { default_branch?: string };
    clearTimeout(timeoutId);
    return json.default_branch ?? null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}
