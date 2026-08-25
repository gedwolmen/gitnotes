import { GitHubService } from './GitHubService';
import { CanvasScene, slugifyCanvasTitle } from '../models/Canvas';
import { parseRepoPath } from '../utils/gitPathParser';
import { AuthService } from './AuthService';
import { SyncEngineService } from './SyncEngineService';
import { CommitService } from './git/CommitService';
import { resolveDefaultFolder, resolveDefaultRepo } from './git/defaultsPolicy';
import { resolveBranch } from './git/resolveBranch';

async function resolveToken(accountId?: string): Promise<string | undefined> {
  if (!accountId) return undefined;
  const t = await AuthService.getTokenById(accountId);
  return t ?? undefined;
}

export interface CanvasGitHubSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function syncCanvasToGitHub(params: {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  scene: CanvasScene;
  accountId?: string;
}): Promise<CanvasGitHubSyncResult> {
  const { repo, branch, filePath, title, scene, accountId } = params;
  let repoPath: string;
  try {
    repoPath = repo ?? await resolveDefaultRepo();
  } catch {
    return { success: false, error: 'No repository configured' };
  }
  const tokenOverride = await resolveToken(accountId);

  if (!tokenOverride && !GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = await resolveBranch(repoPath, branch);
  const opts = tokenOverride ? { tokenOverride } : undefined;

  let targetPath = filePath;
  if (!targetPath) {
    const slug = slugifyCanvasTitle(title);
    targetPath = `${resolveDefaultFolder('canvas')}${slug}.json`;
  }

  const content = JSON.stringify(scene, null, 2);
  const message = filePath
    ? `Update canvas: ${title}`
    : `Create canvas: ${title}`;

  // Clone-mode write path (#514).
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const user = GitHubService.getUser();
    const author = {
      name: user?.name || user?.login || 'gitnotes',
      email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
    };
    const writeResult = await CommitService.commit({
      repo: repoPath,
      branch: targetBranch,
      filePath: targetPath,
      content,
      message,
      author,
    });
    if (writeResult.success) {
      return { success: true, filePath: targetPath };
    }
    return { success: false, error: writeResult.error };
  }

  try {
    const result = await GitHubService.updateFile(
      repoInfo.owner,
      repoInfo.repo,
      targetPath,
      content,
      message,
      targetBranch,
      opts,
    );

    if (result) {
      return { success: true, filePath: targetPath };
    }
    return { success: false, error: 'GitHub API returned no result' };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function deleteCanvasFromGitHub(params: {
  repo: string;
  branch?: string;
  filePath: string;
  title?: string;
  accountId?: string;
}): Promise<CanvasGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title, accountId } = params;
  const tokenOverride = await resolveToken(accountId);

  if (!tokenOverride && !GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = await resolveBranch(repoPath, branch);
  const opts = tokenOverride ? { tokenOverride } : undefined;

  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const user = GitHubService.getUser();
    const author = {
      name: user?.name || user?.login || 'gitnotes',
      email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
    };
    const deleteResult = await CommitService.commit({
      repo: repoPath,
      branch: targetBranch,
      filePath,
      content: '',
      message: `Delete canvas: ${title || filePath}`,
      author,
      delete: true,
    });
    if (deleteResult.success) {
      return { success: true, filePath };
    }
    return { success: false, error: deleteResult.error };
  }

  try {
    // not-found = remote already gone, treat as success so the local
    // row deletes cleanly. error = couldn't reach GitHub, hold the row
    // (#567 fix A) so the next pull doesn't re-import the upstream copy.
    const lookup = await GitHubService.getFileSha(repoInfo.owner, repoInfo.repo, filePath, targetBranch, opts);
    if (lookup.kind === 'not-found') {
      return { success: true, filePath };
    }
    if (lookup.kind === 'error') {
      return { success: false, error: lookup.message };
    }

    const result = await GitHubService.deleteFile(
      repoInfo.owner,
      repoInfo.repo,
      filePath,
      `Delete canvas: ${title || filePath}`,
      lookup.sha,
      targetBranch,
      opts,
    );

    if (result) {
      return { success: true, filePath };
    }
    return { success: false, error: 'GitHub API returned no result' };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    if (/404/.test(message)) {
      return { success: true, filePath };
    }
    return { success: false, error: message };
  }
}
