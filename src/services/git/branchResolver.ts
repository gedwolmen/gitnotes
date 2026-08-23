import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseRepoPath } from '../../utils/gitPathParser';
import { GitFsService } from './GitFsService';
import AuthService from '../AuthService';
import { getActiveGitHost } from './activeHost';

const GITHUB_API_BASE = 'https://api.github.com';
const GITLAB_API_BASE = 'https://gitlab.com/api/v4';
const FALLBACK_BRANCH = 'main';

const sessionCache = new Map<string, string>();

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

  const provider = await resolveActiveProvider();
  const remote =
    provider === 'gitlab'
      ? await fetchGitLabDefaultBranch(repoPath)
      : await fetchGitHubDefaultBranch(repoPath);
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

export async function fetchGitHubDefaultBranch(repoPath: string): Promise<string | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const token = await AuthService.getToken();
    const headers: Record<string, string> = { Accept: 'application/vnd.github.v3+json' };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
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
export async function fetchGitLabDefaultBranch(repoPath: string): Promise<string | null> {
  const info = parseRepoPath(repoPath);
  if (!info) return null;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let token: string | null = null;
    try {
      const host = await getActiveGitHost();
      if (host && host.provider === 'gitlab') token = host.token;
    } catch {
      // fall through to unauthenticated request for public repos
    }
    const storedBase = await AsyncStorage.getItem('@gitnotes:gitlab_base_url');
    const baseUrl = (storedBase || GITLAB_API_BASE).replace(/\/+$/, '');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) {
      headers['PRIVATE-TOKEN'] = token;
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
