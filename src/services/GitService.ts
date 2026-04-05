import { Platform } from 'react-native';
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

// Default root path — override via environment or config in production
// Made configurable via GIT_REPOS_ROOT_DEFAULT environment variable
const DEFAULT_REPOS_ROOT = process.env.GIT_REPOS_ROOT_DEFAULT || './repos';

export class GitService {
  /**
   * Gets the configured root path for repositories.
   * Can be overridden by setting process.env.GIT_REPOS_ROOT.
   */
  static getReposRoot(): string {
    // Environment variable takes precedence, otherwise fall back to a configurable default
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

  static async getBranches(repoPath: string): Promise<GitBranch[]> {
    try {
      // Simulate a small async call to mirror a real network/native operation
      await new Promise((resolve) => setTimeout(resolve, 20));
      // TODO: Replace with actual git branch listing via native module
      return [
        { name: 'main', isCurrent: true },
        { name: 'develop', isCurrent: false },
        { name: 'feature', isCurrent: false },
      ];
    } catch (error) {
      console.error('[GitService] Failed to get branches:', error);
      // Propagate error to allow caller handling
      throw error;
    }
  }

  static async getCommits(repoPath: string, branch?: string, limit = 50): Promise<GitCommit[]> {
    try {
      // Simulate a small async call to mirror a real network/native operation
      await new Promise((resolve) => setTimeout(resolve, 20));
      // TODO: Replace with actual git log parsing via native module
      return [
        {
          hash: 'abc123',
          shortHash: 'abc123',
          message: 'Initial commit',
          author: 'Alice',
          date: '2026-01-01',
        },
      ];
    } catch (error) {
      console.error('[GitService] Failed to get commits:', error);
      // Propagate error to allow caller handling
      throw error;
    }
  }

  static async isGitRepository(path: string): Promise<boolean> {
    try {
      // TODO: Implement actual validation
      // Check for .git directory existence
      return false;
    } catch (error) {
      console.error('[GitService] Failed to validate repository:', error);
      return false;
    }
  }
}

export default GitService;
