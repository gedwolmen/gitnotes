import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';

export interface GitRepository {
  id: string;
  name: string;
  path: string;
  branch?: string;
  commit?: string;
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

const DEFAULT_REPOS_ROOT = process.env.GIT_REPOS_ROOT_DEFAULT || './repos';
const GITHUB_API_BASE = 'https://api.github.com';
const CACHE_PREFIX = '@gitnotes:github_cache_';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
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

  static async addRepository(path: string, name?: string): Promise<GitRepository> {
    try {
      const repoName = name || path.split('/').pop() || path;
      const repo: GitRepository = {
        id: Date.now().toString(),
        name: repoName,
        path: path,
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

  private static async getCachedData<T>(key: string): Promise<T | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
      if (!cached) return null;
      
      const entry: CacheEntry<T> = JSON.parse(cached);
      if (Date.now() - entry.timestamp > CACHE_DURATION) {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }
      return entry.data;
    } catch {
      return null;
    }
  }

  private static async setCachedData<T>(key: string, data: T): Promise<void> {
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

  private static parseRepoPath(repoPath: string): { owner: string; repo: string } | null {
    // Handle formats: facebook/react, github.com/facebook/react, https://github.com/facebook/react
    let cleaned = repoPath
      .replace(/^https?:\/\/github\.com\//, '')
      .replace(/^github\.com\//, '')
      .trim();
    
    const parts = cleaned.split('/');
    if (parts.length >= 2) {
      return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    }
    return null;
  }

  private static async fetchFromGitHub<T>(url: string): Promise<T | null> {
    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
        },
      });
      
      if (!response.ok) {
        console.warn(`[GitService] GitHub API error: ${response.status}`);
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.warn('[GitService] GitHub API fetch failed:', error);
      return null;
    }
  }

  static async getBranches(repoPath: string): Promise<GitBranch[]> {
    const cacheKey = `branches_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}`;
    
    // Check cache first
    const cached = await this.getCachedData<GitBranch[]>(cacheKey);
    if (cached) return cached;

    const repoInfo = this.parseRepoPath(repoPath);
    
    if (repoInfo) {
      // Try GitHub API
      const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/branches`;
      const branches = await this.fetchFromGitHub<Array<{ name: string }>>(url);
      
      if (branches) {
        const result = branches.map((b, index) => ({
          name: b.name,
          isCurrent: index === 0,
        }));
        await this.setCachedData(cacheKey, result);
        return result;
      }
    }

    // Fallback to mock data
    return [
      { name: 'main', isCurrent: true },
      { name: 'master', isCurrent: false },
      { name: 'develop', isCurrent: false },
    ];
  }

  static async getCommits(repoPath: string, branch?: string, limit = 50): Promise<GitCommit[]> {
    const branchKey = branch || 'main';
    const cacheKey = `commits_${repoPath.replace(/[^a-zA-Z0-9]/g, '_')}_${branchKey}`;
    
    // Check cache first
    const cached = await this.getCachedData<GitCommit[]>(cacheKey);
    if (cached) return cached;

    const repoInfo = this.parseRepoPath(repoPath);
    
    if (repoInfo) {
      // Try GitHub API
      const url = `${GITHUB_API_BASE}/repos/${repoInfo.owner}/${repoInfo.repo}/commits?sha=${branchKey}&per_page=${limit}`;
      const commits = await this.fetchFromGitHub<Array<{
        sha: string;
        commit: { message: string; author: { name: string; date: string } };
      }>>(url);
      
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

    // Fallback to mock data
    return [
      {
        hash: 'abc123def456',
        shortHash: 'abc123d',
        message: 'Initial commit',
        author: 'Developer',
        date: new Date().toISOString().split('T')[0],
      },
    ];
  }

  static async isGitRepository(path: string): Promise<boolean> {
    try {
      return false;
    } catch (error) {
      console.error('[GitService] Failed to validate repository:', error);
      return false;
    }
  }

  static async clearCache(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(k => k.startsWith(CACHE_PREFIX));
      await AsyncStorage.multiRemove(cacheKeys);
    } catch (error) {
      console.warn('[GitService] Failed to clear cache:', error);
    }
  }
}

export default GitService;