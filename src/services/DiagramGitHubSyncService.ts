import type { DrawDocument } from '../models/Diagram';
import { slugifyDiagramTitle } from '../models/Diagram';
import { CloneSyncService } from './cloneSyncServiceImpl';
import { resolveDefaultFolder, resolveDefaultRepo } from './git/defaultsPolicy';
import { resolveBranch } from './git/resolveBranch';
import type { SaveResult } from './cloneSyncServiceImpl';

export interface DiagramGitHubSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function syncDiagramToGitHub(params: {
  repo: string;
  branch?: string;
  filePath?: string;
  title: string;
  document: DrawDocument;
  accountId?: string;
}): Promise<DiagramGitHubSyncResult> {
  const { repo, branch, filePath, title, document } = params;
  let repoPath: string;
  try {
    repoPath = repo ?? await resolveDefaultRepo();
  } catch {
    return { success: false, error: 'No repository configured' };
  }

  const targetBranch = filePath && branch ? branch : await resolveBranch(repoPath);

  let targetPath = filePath;
  if (!targetPath) {
    const slug = slugifyDiagramTitle(title);
    targetPath = `${resolveDefaultFolder('diagram')}${slug}.td.json`;
  }

  const content = JSON.stringify(document, null, 2);
  const message = filePath
    ? `Update diagram: ${title}`
    : `Create diagram: ${title}`;

  const saveResult: SaveResult = await CloneSyncService.save({
    repoPath,
    branch: targetBranch,
    filePath: targetPath,
    content,
    message,
    intent: 'upsert',
  });
  if (saveResult.success || saveResult.error === 'queued') {
    return { success: true, filePath: targetPath };
  }
  return { success: false, error: saveResult.error };
}

export async function deleteDiagramFromGitHub(params: {
  repo: string;
  branch?: string;
  filePath: string;
  title?: string;
  accountId?: string;
}): Promise<DiagramGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, title } = params;

  const targetBranch = branch ?? await resolveBranch(repoPath);
  const saveResult = await CloneSyncService.save({
    repoPath,
    branch: targetBranch,
    filePath,
    message: `Delete diagram: ${title || filePath}`,
    intent: 'delete',
  });
  if (saveResult.success || saveResult.error === 'queued') {
    return { success: true, filePath };
  }
  return { success: false, error: saveResult.error };
}
