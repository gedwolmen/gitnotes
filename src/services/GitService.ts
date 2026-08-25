import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { AuthService } from './AuthService';
import { parseRepoPath } from '../utils/gitPathParser';
import { fetchGitHubDefaultBranch, fetchGitLabDefaultBranch } from './git/branchResolver';
import type { GitHostProvider } from './git/GitHost';
import { getGitHostService } from './git/gitHostFactory';

export interface GitRepository {
  id: string;
  name: string;
  path: string;
  branch?: string;
  commit?: string;
  /** Which host this repository lives on. Defaults to 'github' for legacy entries. */
  provider?: GitHostProvider;
  /** Host connection (token) this repo was added under. */
  hostId?: string;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface GitRepositoryFolder {
  name: string;
  path: string;
  parentPath: string | null;
}

const DEFAULT_REPOS_ROOT = process.env.GIT_REPOS_ROOT_DEFAULT || './repos';
const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_PREFIX = '@gitnotes:github_cache_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface GitHubTreeEntry {
  path: string;
  type: 'tree' | 'blob' | string;
}

interface GitHubTreeResponse {
  tree?: GitHubTreeEntry[];
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export class GitService {
  static getReposRoot(): string {
    return process.env.GIT_REPOS_ROOT || DEFAULT_REPOS_ROOT;
  }

  static async getRepositories(): Promise<GitRepository[]> {
    try {
      return await StorageService.getSavedRepositories();
    } catch (error) {
      console.error('[GitService] Failed to get repositories:', error);
      throw error;
    }
  }

  static async addRepository(
    path: string,
    name?: string,
    provider: GitHostProvider = 'github',
    hostId?: string,
  ): Promise<GitRepository> {
    try {
      const repoName = name || path.split('/').pop() || path;
      // Capture the remote's actual default branch at add-time so clone +
      // sync paths don't fall back to a hardcoded 'main' (#543). Best-effort:
      // offline / 404 leaves `branch` undefined; the resolver re-tries lazily.
      let branch: string | undefined;
      if (provider === 'gitlab') {
        branch = (await fetchGitLabDefaultBranch(path)) ?? undefined;
      } else if (provider === 'github') {
        branch = (await fetchGitHubDefaultBranch(path)) ?? undefined;
      } else {
        // Gitea / Forgejo reuse the GitHub resolver for now — both expose
        // the same `/repos/:owner/:repo` default-branch shape.
        branch = (await fetchGitHubDefaultBranch(path)) ?? undefined;
      }
      const repo: GitRepository = {
        id: `${provider}:${Date.now()}`,
        name: repoName,
        path: path,
        branch,
        provider,
        hostId,
      };

      await StorageService.addRepository(repo);
      return repo;
    } catch (error) {
      console.error('[GitService] Failed to add repository:', error);
      throw new Error(`Failed to add repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async removeRepository(path: string): Promise<void> {
    try {
      await StorageService.removeRepository(path);
    } catch (error) {
      console.error('[GitService] Failed to remove repository:', error);
      throw new Error(`Failed to remove repository: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private static memCache = new Map<string, CacheEntry<unknown>>();
  private static readonly MEM_CACHE_MAX = 64;

  private static memCacheGet<T>(key: string): T | null {
    const entry = this.memCache.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.timestamp > CACHE_DURATION) {
      this.memCache.delete(key);
      return null;
    }
    // LRU touch: re-insert moves the key to the end of the iteration order.
    this.memCache.delete(key);
    this.memCache.set(key, entry);
    return entry.data;
  }

  private static memCacheSet<T>(key: string, data: T): void {
    this.memCache.set(key, { data, timestamp: Date.now() });
    while (this.memCache.size > this.MEM_CACHE_MAX) {
      const oldest = this.memCache.keys().next().value;
      if (oldest === undefined) break;
      this.memCache.delete(oldest);
    }
  }

  private static async getCachedData<T>(key: string): Promise<T | null> {
    const memHit = this.memCacheGet<T>(key);
    if (memHit !== null) return memHit;
    try {
      const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;

      const entry: CacheEntry<T> = JSON.parse(cached);
      if (Date.now() - entry.timestamp > CACHE_DURATION) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      this.memCacheSet(key, entry.data);
      return entry.data;
    } catch (error) {
      console.warn('[GitService] getCachedData failed:', error);
      return null;
    }
  }

  private static async setCachedData<T>(key: string, data: T): Promise<void> {
    this.memCacheSet(key, data);
    try {
      const entry: CacheEntry<T> = {
        data,
        timestamp: Date.now(),
      };
      await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
      console.warn('[GitService] Failed to cache data:', error);
    }
  }

  private static async fetchFromGitHub<T>(url: string, authToken?: string): Promise<T | null> {
    try {
      const headers: Record<string, string> = {
        'Accept': 'application/vnd.github.v3+json',
      };
      if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      const response = await fetch(url, { headers });
      
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          console.warn(`[GitService] GitHub API auth error: ${response.status} - missing or invalid token`);
        } else if (response.status !== 404) {
          console.warn(`[GitService] GitHub API error: ${response.status}`);
        }
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.warn('[GitService] GitHub API fetch failed:', error);
      return null;
    }
  }

  static async getBranches(
    repoPath: string,
    provider: GitHostProvider = 'github',
    authToken?: string,
  ): Promise<GitBranch[]> {
    const cacheKey = `branches_${provider}_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}`;

    // Check cache first
    const cached = await this.getCachedData<GitBranch[]>(cacheKey);
    if (cached) return cached;

    const repoInfo = parseRepoPath(repoPath);
    if (repoInfo) {
      try {
        const host = getGitHostService(provider);
        const hostBranches = await host.listBranches(repoInfo.owner, repoInfo.repo);
        if (hostBranches.length > 0) {
          const result = hostBranches.map((b) => ({
            name: b.name,
            isCurrent: b.isDefault ?? false,
          }));
          await this.setCachedData(cacheKey, result);
          return result;
        }
        // Host returned empty - try authenticated GitHub API directly.
        // For private repos, unauthenticated requests are rate-limited so they
        // return empty. Try with token if available, or fetch one.
        const token = authToken ?? (provider === 'github' ? await AuthService.getToken() : null);
        if (provider === 'github' && !token) {
          // No token yet, try to get one
          const fetchedToken = await AuthService.getToken();
          if (fetchedToken) {
            const branchesUrl = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/branches`;
            const metaUrl = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}`;
            const [ghBranches, ghMeta] = await Promise.all([
              this.fetchFromGitHub<Array<{ name: string }>>(branchesUrl, fetchedToken),
              this.fetchFromGitHub<{ default_branch?: string }>(metaUrl, fetchedToken),
            ]);
            if (ghBranches && ghBranches.length > 0) {
              const defaultBranch = ghMeta?.default_branch;
              const result = ghBranches.map((b) => ({
                name: b.name,
                isCurrent: defaultBranch ? b.name === defaultBranch : false,
              }));
              await this.setCachedData(cacheKey, result);
              return result;
            }
          }
        } else if (token) {
          const branchesUrl = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/branches`;
          const metaUrl = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}`;
          const [ghBranches, ghMeta] = await Promise.all([
            this.fetchFromGitHub<Array<{ name: string }>>(branchesUrl, token),
            this.fetchFromGitHub<{ default_branch?: string }>(metaUrl, token),
          ]);
          if (ghBranches && ghBranches.length > 0) {
            const defaultBranch = ghMeta?.default_branch;
            const result = ghBranches.map((b) => ({
              name: b.name,
              isCurrent: defaultBranch ? b.name === defaultBranch : false,
            }));
            await this.setCachedData(cacheKey, result);
            return result;
          }
        }
      } catch (error) {
        console.warn('[GitService] host listBranches failed:', error);
      }
    }

    // Return empty array on failure - no fake data fallback (#1212)
    return [];
  }

  static async getCommits(
    repoPath: string,
    branch?: string,
    limit = 50,
    authToken?: string,
  ): Promise<GitCommit[]> {
    const branchKey = branch || 'main';
    const cacheKey = `commits_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}_${branchKey}`;
    
    const cached = await this.getCachedData<GitCommit[]>(cacheKey);
    if (cached) return cached;

    const repoInfo = parseRepoPath(repoPath);
    
    if (repoInfo) {
      const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/commits?sha=${branchKey}&per_page=${limit}`;
      const commits = await this.fetchFromGitHub<Array<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>>(url, authToken);
      
      if (commits) {
        const result = commits.map((c) => ({
          hash: c.sha,
          shortHash: c.sha.substring(0, 7),
          message: c.commit.message.split('\n')[0],
          author: c.commit.author.name,
          date: c.commit.author.date,
        }));
        await this.setCachedData(cacheKey, result);
        return result;
      }
    }

    return [];
  }

  static async getRepositoryFolders(
    repoPath: string,
    branch?: string,
    provider: GitHostProvider = 'github',
  ): Promise<GitRepositoryFolder[]> {
    const branchKey = branch || 'HEAD';
    const cacheKey = `repo_folders_${provider}_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}_${branchKey.replace(/[^a-zA-Z0-9]/g, '_')}`;

    const cached = await this.getCachedData<GitRepositoryFolder[]>(cacheKey);
    if (cached && cached.length > 0) return cached;

    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) {
      return [];
    }

    let tree: { path: string; type: 'blob' | 'tree'; sha: string }[] = [];
    try {
      const host = getGitHostService(provider);
      const hostTree = await host.getTreeRecursive(repoInfo.owner, repoInfo.repo, branchKey);
      tree = hostTree.map((e) => ({ path: e.path, type: e.type, sha: e.sha }));
    } catch (error) {
      console.warn('[GitService] host getTreeRecursive failed:', error);
    }

    if (tree.length === 0) {
      return [];
    }

    const folders = tree
      .filter((entry) => entry.type === 'tree' && Boolean(entry.path))
      .map((entry) => {
        const cleanPath = entry.path.replace(/^\/+/, '').replace(/\/+$/, '');
        const lastSlashIndex = cleanPath.lastIndexOf('/');
        const parentPath = lastSlashIndex >= 0 ? cleanPath.substring(0, lastSlashIndex) : null;

        return {
          name: lastSlashIndex >= 0 ? cleanPath.substring(lastSlashIndex + 1) : cleanPath,
          path: cleanPath,
          parentPath,
        };
      })
      .sort((a, b) => a.path.localeCompare(b.path));

    await this.setCachedData(cacheKey, folders);
    return folders;
  }

  static async clearCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
      this.memCache.clear();
    } catch (error) {
      console.warn('[GitService] Failed to clear cache:', error);
    }
  }

  // Targeted invalidator used after a successful repo pull so the editor
  // folder dropdown reflects the freshly fetched tree instead of a stale
  // (TTL-bound) snapshot.
  static async invalidateRepoFoldersCache(
    repoPath: string,
    branch?: string,
    provider: GitHostProvider = 'github',
  ): Promise<void> {
    const branchKey = branch || 'HEAD';
    const cacheKey = `repo_folders_${provider}_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}_${branchKey.replace(/[^a-zA-Z0-9]/g, '_')}`;
    this.memCache.delete(cacheKey);
    try {
      await AsyncStorage.removeItem(CACHE_PREFIX + cacheKey);
    } catch (error) {
      console.warn('[GitService] Failed to invalidate folders cache:', error);
    }
  }
}

export default GitService;
