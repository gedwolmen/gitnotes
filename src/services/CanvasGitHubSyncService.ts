import { GitHubService } from './GitHubService';
import { CanvasScene, slugifyCanvasTitle } from '../models/Canvas';
import { parseRepoPath } from '../utils/gitPathParser';
import { AuthService } from './AuthService';
import { SyncEngineService } from './SyncEngineService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { resolveBranch } from './git/branchResolver';

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
  const { repo: repoPath, branch, filePath, title, scene, accountId } = params;
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
    targetPath = `canvases/${slug}.json`;
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
    const tokenForPush = tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    const writeResult = await LocalGitWriter.writeAndCommit({
      repoPath,
      branch: targetBranch,
      filePath: targetPath,
      content,
      message,
      author,
      token: tokenForPush,
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
    const tokenForPush = tokenOverride ?? (await AuthService.getToken()) ?? undefined;
    return LocalGitWriter.deleteAndCommit({
      repoPath,
      branch: targetBranch,
      filePath,
      message: `Delete canvas: ${title || filePath}`,
      author,
      token: tokenForPush,
    });
  }

  try {
    // sha-null = remote already gone. Treat as success so the local row can
    // delete cleanly; pull won't re-import a file that doesn't exist.
    const sha = await GitHubService.getFileSha(repoInfo.owner, repoInfo.repo, filePath, targetBranch, opts);
    if (!sha) {
      return { success: true, filePath };
    }

    const result = await GitHubService.deleteFile(
      repoInfo.owner,
      repoInfo.repo,
      filePath,
      `Delete canvas: ${title || filePath}`,
      sha,
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
