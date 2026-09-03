import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { ThoughtDump, createThoughtDump, serializeThoughtDump, parseThoughtDump } from '../models/ThoughtDump';
import { parseRepoPath } from '../utils/gitPathParser';
import { SyncEngineService } from './syncStubs';
import { resolveBranch } from './git/branchResolver';
import { CommitService } from './git/CommitService';
import { getGitHostService } from './git/gitHostFactory';
import { FEATURE_USE_MULTI_HOST_WRITE } from './featureFlags';
import type { GitHostProvider } from './git/GitHost';

const THOUGHTS_DIR = 'thoughts/';

const repoWriteQueue = new Map<string, Promise<unknown>>();

function getRepoWriteQueueKey(owner: string, repo: string, branch: string): string {
  return `${owner}/${repo}/${branch}`;
}

async function enqueueRepoWrite<T>(
  owner: string,
  repo: string,
  branch: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = getRepoWriteQueueKey(owner, repo, branch);
  const previous = repoWriteQueue.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  const tracked = next.then(() => undefined, () => undefined).finally(() => {
    if (repoWriteQueue.get(key) === tracked) {
      repoWriteQueue.delete(key);
    }
  });
  repoWriteQueue.set(key, tracked);
  return next;
}

export interface ThoughtDumpCreateOptions {
  repoPath: string;
  branch?: string;
  provider?: GitHostProvider;
}

export type ThoughtDumpCreateResult =
  | { ok: true; dump: ThoughtDump }
  | {
      ok: false;
      reason: 'not-authenticated' | 'no-repos' | 'invalid-repo' | 'write-failed';
      error?: string;
    };

export interface ThoughtDumpDeleteOptions {
  repoPath: string;
  branch?: string;
  filePath: string;
  provider?: GitHostProvider;
}

async function getFirstRepo(): Promise<{ repoPath: string; branch?: string; provider?: GitHostProvider } | null> {
  const repos = await StorageService.getSavedRepositories();
  if (repos.length === 0) return null;
  const repo = repos[0];
  const branch = await resolveBranch(repo.path, repo.branch);
  return { repoPath: repo.path, branch, provider: repo.provider };
}

export class ThoughtDumpService {
  static async create(text: string, options?: ThoughtDumpCreateOptions): Promise<ThoughtDumpCreateResult> {
    if (!GitHubService.isAuthenticated()) {
      return { ok: false, reason: 'not-authenticated' };
    }

    let repoPath: string;
    let branch: string;

    if (options?.repoPath) {
      repoPath = options.repoPath;
      branch = await resolveBranch(repoPath, options.branch);
    } else {
      const repo = await getFirstRepo();
      if (!repo) return { ok: false, reason: 'no-repos' };
      repoPath = repo.repoPath;
      branch = repo.branch ?? 'main';
    }

    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) return { ok: false, reason: 'invalid-repo' };

    const dump = createThoughtDump(text);
    const content = serializeThoughtDump(dump);

    let commitResult: Awaited<ReturnType<typeof CommitService.commit>>;
    try {
      commitResult = await enqueueRepoWrite(repoInfo.owner, repoInfo.repo, branch, () =>
        CommitService.commit({
          repo: repoPath,
          branch,
          filePath: dump.filePath,
          content,
          message: `Create thought dump: ${dump.filePath}`,
        }),
      );
    } catch (error) {
      console.warn('[ThoughtDumpService] create commit failed:', error);
      return {
        ok: false,
        reason: 'write-failed',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    if (!commitResult.success) {
      return { ok: false, reason: 'write-failed', error: commitResult.error };
    }

    return { ok: true, dump };
  }

  static async list(options?: { repoPath?: string; branch?: string; provider?: GitHostProvider }): Promise<ThoughtDump[]> {
    if (!GitHubService.isAuthenticated()) return [];

    let repoPath: string;
    let branch: string;
    let provider: GitHostProvider | undefined;

    if (options?.repoPath) {
      repoPath = options.repoPath;
      branch = await resolveBranch(repoPath, options.branch);
      provider = options.provider;
    } else {
      const repo = await getFirstRepo();
      if (!repo) return [];
      repoPath = repo.repoPath;
      branch = repo.branch ?? 'main';
      provider = repo.provider;
    }

    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) return [];

    const mode = await SyncEngineService.getMode(repoPath);
    const dumps: ThoughtDump[] = [];

    try {
      if (mode === 'clone') {
        const { GitFsService } = await import('./git/GitFsService');
        const tree = await GitFsService.listTree({ repoPath, ref: branch });
        const thoughtBlobs = tree.filter(
          (item) => item.type === 'blob' && item.path.startsWith(THOUGHTS_DIR) && item.path.endsWith('.md'),
        );

        for (const blob of thoughtBlobs) {
          const content = await GitFsService.readFile({ repoPath, ref: branch, filepath: blob.path });
          if (!content) continue;
          const parsed = parseThoughtDump(content, blob.path);
          if (parsed) dumps.push(parsed);
        }
      } else {
        if (FEATURE_USE_MULTI_HOST_WRITE) {
          const host = getGitHostService(provider);
          const tree = await host.getTreeRecursive(repoInfo.owner, repoInfo.repo, branch);
          const thoughtBlobs = tree.filter(
            (item) => item.type === 'blob' && item.path.startsWith(THOUGHTS_DIR) && item.path.endsWith('.md'),
          );

          for (const blob of thoughtBlobs) {
            const content = await host.getFileText(repoInfo.owner, repoInfo.repo, blob.path, branch);
            if (!content) continue;
            const parsed = parseThoughtDump(content, blob.path);
            if (parsed) dumps.push(parsed);
          }
        } else {
          const tree = await GitHubService.getTreeRecursiveOrThrow(repoInfo.owner, repoInfo.repo, branch);
          const thoughtBlobs = tree.filter(
            (item) => item.type === 'blob' && item.path.startsWith(THOUGHTS_DIR) && item.path.endsWith('.md'),
          );

          for (const blob of thoughtBlobs) {
            const content = await GitHubService.getFileContent(repoInfo.owner, repoInfo.repo, blob.path, branch);
            if (!content) continue;
            const parsed = parseThoughtDump(content, blob.path);
            if (parsed) dumps.push(parsed);
          }
        }
      }
    } catch (error) {
      console.warn('[ThoughtDumpService] list failed:', error);
    }

    return dumps;
  }

  static async delete(id: string, options: ThoughtDumpDeleteOptions): Promise<boolean> {
    if (!GitHubService.isAuthenticated()) return false;

    const repoPath = options.repoPath;
    const branch = await resolveBranch(repoPath, options.branch);
    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) return false;

    const result = await enqueueRepoWrite(repoInfo.owner, repoInfo.repo, branch, async () => {
      try {
        const commitResult = await CommitService.commit({
          repo: repoPath,
          branch,
          filePath: options.filePath,
          message: `Delete thought dump: ${options.filePath}`,
          delete: true,
        });
        if (!commitResult.success) {
          console.warn('[ThoughtDumpService] delete commit failed:', commitResult.error);
        }
        return commitResult.success;
      } catch (error) {
        console.warn('[ThoughtDumpService] delete commit failed:', error);
        return false;
      }
    });

    return result;
  }
}
