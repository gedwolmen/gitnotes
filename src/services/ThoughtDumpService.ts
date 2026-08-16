import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { ThoughtDump, createThoughtDump, serializeThoughtDump, parseThoughtDump } from '../models/ThoughtDump';
import { parseRepoPath } from '../utils/gitPathParser';
import { SyncEngineService } from './SyncEngineService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { AuthService } from './AuthService';
import { resolveBranch } from './git/branchResolver';
import { getGitHostService } from './git/gitHostFactory';
import { FEATURE_USE_MULTI_HOST_WRITE, FEATURE_STAGE_PUSH } from './featureFlags';
import { StagingService } from './git/StagingService';
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

async function resolveAuthor(): Promise<{ name: string; email: string }> {
  const host = getGitHostService('github');
  const user = await host.getAuthenticatedUser();
  const name = user?.login || 'gitnotes';
  const email = user?.email || `${name}@users.noreply.gitnotes`;
  return { name, email };
}

async function resolveToken(): Promise<string | undefined> {
  return (await AuthService.getToken()) ?? undefined;
}

export interface ThoughtDumpCreateOptions {
  repoPath: string;
  branch?: string;
  provider?: GitHostProvider;
}

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
  static async create(text: string, options?: ThoughtDumpCreateOptions): Promise<ThoughtDump | null> {
    if (!GitHubService.isAuthenticated()) return null;

    let repoPath: string;
    let branch: string;
    let provider: GitHostProvider | undefined;

    if (options?.repoPath) {
      repoPath = options.repoPath;
      branch = await resolveBranch(repoPath, options.branch);
      provider = options.provider;
    } else {
      const repo = await getFirstRepo();
      if (!repo) return null;
      repoPath = repo.repoPath;
      branch = repo.branch ?? 'main';
      provider = repo.provider;
    }

    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) return null;

    const dump = createThoughtDump(text);
    const content = serializeThoughtDump(dump);

    const mode = await SyncEngineService.getMode(repoPath);

    const writeResult = await enqueueRepoWrite(repoInfo.owner, repoInfo.repo, branch, async () => {
      if (FEATURE_STAGE_PUSH) {
        return StagingService.stageUpsert({
          repo: repoPath,
          branch,
          filePath: dump.filePath,
          title: 'Thought dump',
          content,
        });
      }

      if (mode === 'clone') {
        const author = await resolveAuthor();
        const token = await resolveToken();
        return LocalGitWriter.writeAndCommit({
          repoPath,
          branch,
          filePath: dump.filePath,
          content,
          message: `Add thought dump`,
          author,
          token,
        });
      }

      if (FEATURE_USE_MULTI_HOST_WRITE) {
        const host = getGitHostService(provider);
        await host.updateFile(
          repoInfo.owner, repoInfo.repo, dump.filePath, content,
          `Add thought dump`, branch,
        );
        return { success: true, filePath: dump.filePath };
      }

      const result = await GitHubService.updateFile(
        repoInfo.owner,
        repoInfo.repo,
        dump.filePath,
        content,
        `Add thought dump`,
        branch,
      );
      return { success: !!result, filePath: dump.filePath };
    });

    if (!writeResult.success) {
      console.warn('[ThoughtDumpService] create failed:', writeResult.error);
      return null;
    }

    return dump;
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
    const provider = options.provider;
    const repoInfo = parseRepoPath(repoPath);
    if (!repoInfo) return false;

    const mode = await SyncEngineService.getMode(repoPath);

    const result = await enqueueRepoWrite(repoInfo.owner, repoInfo.repo, branch, async () => {
      if (FEATURE_STAGE_PUSH) {
        return StagingService.stageDelete({
          repo: repoPath,
          branch,
          filePath: options.filePath,
          title: 'Thought dump',
        });
      }

      if (mode === 'clone') {
        const author = await resolveAuthor();
        const token = await resolveToken();
        return LocalGitWriter.deleteAndCommit({
          repoPath,
          branch,
          filePath: options.filePath,
          message: `Delete thought dump`,
          author,
          token,
        });
      }

      if (FEATURE_USE_MULTI_HOST_WRITE) {
        const host = getGitHostService(provider);
        const lookup = await host.getFileSha(repoInfo.owner, repoInfo.repo, options.filePath, branch);
        if (lookup.kind === 'not-found') return { success: true, filePath: options.filePath };
        if (lookup.kind === 'error') return { success: false, error: lookup.message };
        await host.deleteFile(
          repoInfo.owner, repoInfo.repo, options.filePath,
          `Delete thought dump`, lookup.sha!, branch,
        );
        return { success: true, filePath: options.filePath };
      }

      const lookup = await GitHubService.getFileSha(repoInfo.owner, repoInfo.repo, options.filePath, branch);
      if (lookup.kind === 'not-found') return { success: true, filePath: options.filePath };
      if (lookup.kind === 'error') return { success: false, error: lookup.message };

      const deleteResult = await GitHubService.deleteFile(
        repoInfo.owner,
        repoInfo.repo,
        options.filePath,
        `Delete thought dump`,
        lookup.sha,
        branch,
      );
      return { success: !!deleteResult, filePath: options.filePath };
    });

    return result.success;
  }
}
