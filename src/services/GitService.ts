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

export class GitService {
  static async getRepositories(): Promise<GitRepository[]> {
    return StorageService.getSavedRepositories();
  }

  static async addRepository(path: string, name?: string): Promise<GitRepository> {
    const repoName = name || path.split('/').pop() || path;
    const repo: GitRepository = {
      id: Date.now().toString(),
      name: repoName,
      path: path,
    };
    
    await StorageService.addRepository(repo);
    return repo;
  }

  static async removeRepository(path: string): Promise<void> {
    await StorageService.removeRepository(path);
  }

  static async getBranches(repoPath: string): Promise<GitBranch[]> {
    return [
      { name: 'main', isCurrent: true },
      { name: 'master', isCurrent: false },
      { name: 'develop', isCurrent: false },
    ];
  }

  static async getCommits(repoPath: string, branch?: string, limit = 50): Promise<GitCommit[]> {
    return [];
  }
}

export default GitService;
