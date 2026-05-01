import { GitHubService } from './GitHubService';
import { CanvasScene, slugifyCanvasTitle } from '../models/Canvas';
import { parseRepoPath } from '../utils/gitPathParser';

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
}): Promise<CanvasGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title, scene } = params;

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const repoInfo = parseRepoPath(repoPath);
  if (!repoInfo) {
    return { success: false, error: `Invalid repo path: ${repoPath}` };
  }

  const targetBranch = branch || 'main';

  let targetPath = filePath;
  if (!targetPath) {
    const slug = slugifyCanvasTitle(title);
    targetPath = `canvases/${slug}.json`;
  }

  const content = JSON.stringify(scene, null, 2);
  const message = filePath
    ? `Update canvas: ${title}`
    : `Create canvas: ${title}`;

  try {
    const result = await GitHubService.updateFile(
      repoInfo.owner,
      repoInfo.repo,
      targetPath,
      content,
      message,
      targetBranch,
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
