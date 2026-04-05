import git from 'isomorphic-git';
import { Platform } from 'react-native';

export interface GitSyncOptions {
  author: {
    name: string;
    email: string;
  };
  token?: string;
}

export interface GitSyncResult {
  success: boolean;
  error?: string;
}

export interface GitFileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'renamed';
}

const getHttpClient = (token?: string) => {
  if (!token) return undefined;
  
  return {
    async request({ url, method, headers, body }: { url: string; method: string; headers: Record<string, string>; body?: string }) {
      const response = await fetch(url, {
        method,
        headers: {
          ...headers,
          Authorization: `Bearer ${token}`,
        },
        body,
      });
      return {
        statusCode: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: await response.text(),
      };
    },
  } as any;
};

export class GitSyncService {
  static async pull(
    dir: string,
    options: GitSyncOptions
  ): Promise<GitSyncResult> {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Git operations not supported on web' };
    }
    
    try {
      await git.pull({
        fs: require('fs'),
        dir,
        author: options.author,
        http: getHttpClient(options.token),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async push(dir: string, options: GitSyncOptions): Promise<GitSyncResult> {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Git operations not supported on web' };
    }
    
    try {
      await git.push({
        fs: require('fs'),
        dir,
        http: getHttpClient(options.token),
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async commit(
    dir: string,
    message: string,
    options: GitSyncOptions
  ): Promise<GitSyncResult> {
    if (Platform.OS === 'web') {
      return { success: false, error: 'Git operations not supported on web' };
    }
    
    try {
      const fs = require('fs');
      await git.add({ fs, dir, filepath: '.' });
      
      await git.commit({
        fs,
        dir,
        message,
        author: options.author,
        committer: options.author,
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  static async status(dir: string): Promise<GitFileStatus[]> {
    if (Platform.OS === 'web') {
      return [];
    }
    
    try {
      const fs = require('fs');
      const matrix = await git.statusMatrix({ fs, dir });
      const statuses: GitFileStatus[] = [];

      for (const [filepath, head, workdir, stage] of matrix) {
        if (head === 1 && workdir === 2 && stage === 1) {
          statuses.push({ path: filepath, status: 'modified' });
        } else if (head === 0 && workdir === 2 && stage === 0) {
          statuses.push({ path: filepath, status: 'untracked' });
        } else if (head === 1 && workdir === 0 && stage === 0) {
          statuses.push({ path: filepath, status: 'deleted' });
        } else if (head === 0 && workdir === 2 && stage === 2) {
          statuses.push({ path: filepath, status: 'added' });
        }
      }

      return statuses;
    } catch (error) {
      console.error('[GitSyncService] Status error:', error);
      return [];
    }
  }

  static async log(
    dir: string,
    depth = 10
  ): Promise<Array<{ hash: string; message: string; author: string; date: Date }>> {
    if (Platform.OS === 'web') {
      return [];
    }
    
    try {
      const fs = require('fs');
      const commits = await git.log({ fs, dir, depth });
      return commits.map((commit) => ({
        hash: commit.oid,
        message: commit.commit.message,
        author: commit.commit.author.name,
        date: new Date(commit.commit.author.timestamp * 1000),
      }));
    } catch (error) {
      console.error('[GitSyncService] Log error:', error);
      return [];
    }
  }

  static async getCurrentBranch(dir: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return null;
    }
    
    try {
      const fs = require('fs');
      const branch = await git.currentBranch({ fs, dir });
      return branch ?? null;
    } catch (error) {
      return null;
    }
  }

  static async getBranches(dir: string): Promise<string[]> {
    if (Platform.OS === 'web') {
      return [];
    }
    
    try {
      const fs = require('fs');
      return await git.listBranches({ fs, dir });
    } catch (error) {
      return [];
    }
  }
}

export default GitSyncService;
