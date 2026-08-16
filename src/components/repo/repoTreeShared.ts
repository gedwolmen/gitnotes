import { Ionicons } from '@expo/vector-icons';
import { GitHubContent, GitHubService } from '../../services/GitHubService';
import { AuthService } from '../../services/AuthService';
import { SyncEngineService } from '../../services/SyncEngineService';
import { LocalGitWriter } from '../../services/git/LocalGitWriter';
import { FEATURE_STAGE_PUSH } from '../../services/featureFlags';
import { batchDeleteFiles } from '../../services/git/BatchGitOperations';
import { getGitHostService } from '../../services/git/gitHostFactory';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  sha?: string;
  size?: number;
}

export interface TreeItemProps {
  node: TreeNode;
  owner: string;
  repo: string;
  branch?: string;
  level: number;
  onFilePress?: (node: TreeNode) => void;
  onRefresh?: () => void;
  onChildDeleted?: (path: string) => void;
}

export type IoniconName = keyof typeof Ionicons.glyphMap;

const FILE_ICON_MAP: Record<string, IoniconName> = {
  md: 'document-text',
  markdown: 'document-text',
  norg: 'document-text',
  org: 'document-text',
  pdf: 'document-text',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  svg: 'image',
  webp: 'image',
  ts: 'code-slash',
  tsx: 'code-slash',
  js: 'code-slash',
  jsx: 'code-slash',
  json: 'settings',
  yaml: 'settings',
  yml: 'settings',
  toml: 'settings',
};

export function getFileIcon(name: string): IoniconName {
  const ext = name.toLowerCase().split('.').pop() || '';
  return FILE_ICON_MAP[ext] || 'document';
}

export async function fetchChildren(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<TreeNode[]> {
  const items = await GitHubService.getRepoContents(owner, repo, path, branch);
  return items
    .filter((item: GitHubContent) => item.type === 'dir' || item.type === 'file')
    .map((item: GitHubContent) => ({
      name: item.name,
      path: item.path,
      type: item.type as 'file' | 'dir',
      sha: item.sha,
      size: item.size,
    }))
    .sort((a: TreeNode, b: TreeNode) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export interface DirectoryDeleteFailure {
  path: string;
  error: string;
}

export interface DirectoryDeleteResult {
  deleted: string[];
  failed: DirectoryDeleteFailure[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recursively collects every leaf file path under `dirPath`. Used by the
 * mode-aware folder delete to batch one API commit (or one clone push).
 */
export async function collectLeafFilePaths(
  owner: string,
  repo: string,
  branch: string | undefined,
  dirPath: string,
): Promise<string[]> {
  const items = await fetchChildren(owner, repo, dirPath, branch);
  const paths: string[] = [];
  for (const item of items) {
    if (item.type === 'dir') {
      paths.push(...(await collectLeafFilePaths(owner, repo, branch, item.path)));
    } else {
      paths.push(item.path);
    }
  }
  return paths;
}

async function resolveCloneAuthor(): Promise<{ name: string; email: string }> {
  const host = getGitHostService('github');
  const user = await host.getAuthenticatedUser();
  const name = user?.login || 'gitnotes';
  const email = user?.email || `${name}@users.noreply.gitnotes`;
  return { name, email };
}

/**
 * Clone-mode folder delete: one local `deleteAndCommit(push:false)` per
 * leaf file, then ONE trailing `LocalGitWriter.push` flushes the whole
 * folder (mirrors `NoteSyncQueueService.processDrainGroup`'s coalesced
 * push). A failed flush strands every locally-committed delete, so they
 * all surface as failures.
 */
async function deleteDirectoryClone(
  owner: string,
  repo: string,
  branch: string | undefined,
  paths: string[],
): Promise<DirectoryDeleteResult> {
  const targetBranch = branch || 'main';
  const repoPath = `${owner}/${repo}`;
  const author = await resolveCloneAuthor();
  const token = (await AuthService.getToken()) ?? undefined;

  const deleted: string[] = [];
  const failed: DirectoryDeleteFailure[] = [];
  for (const path of paths) {
    const result = await LocalGitWriter.deleteAndCommit({
      repoPath,
      branch: targetBranch,
      filePath: path,
      message: `Delete: ${path}`,
      author,
      token,
      push: false,
    });
    if (result.success) {
      deleted.push(path);
    } else {
      failed.push({ path, error: result.error ?? 'Delete failed' });
    }
  }

  if (deleted.length > 0 && !FEATURE_STAGE_PUSH) {
    const flushResult = await LocalGitWriter.push({ repoPath, branch: targetBranch, token });
    if (!flushResult.success) {
      const pushError = flushResult.error ?? 'Push failed';
      for (const path of deleted) failed.push({ path, error: pushError });
      return { deleted: [], failed };
    }
  }
  return { deleted, failed };
}

/**
 * Mode-aware folder delete. API mode batches every collected path into ONE
 * `batchDeleteFiles` commit (>= 2 paths; a single-path folder falls back to
 * per-file deletes). Clone mode commits locally with push deferred and
 * flushes with one trailing push.
 */
export async function deleteDirectoryModeAware(
  owner: string,
  repo: string,
  branch: string | undefined,
  dirPath: string,
): Promise<DirectoryDeleteResult> {
  const paths = await collectLeafFilePaths(owner, repo, branch, dirPath);
  if (paths.length === 0) return { deleted: [], failed: [] };

  const mode = await SyncEngineService.getMode(`${owner}/${repo}`);
  if (mode === 'clone') {
    return deleteDirectoryClone(owner, repo, branch, paths);
  }

  if (paths.length >= 2) {
    try {
      const result = await batchDeleteFiles({
        owner,
        repo,
        branch: branch || 'main',
        paths,
        message: `Delete folder: ${dirPath}`,
      });
      return { deleted: result.deleted, failed: result.failed };
    } catch (error) {
      console.warn('[repoTreeShared] batch delete failed, falling back to per-file:', error);
    }
  }
  return deleteDirectory(owner, repo, branch, dirPath);
}

export async function moveDirectory(
  owner: string,
  repo: string,
  branch: string | undefined,
  oldDirPath: string,
  newDirPath: string,
): Promise<void> {
  const failedPaths: string[] = [];
  await moveDirectoryItems(owner, repo, branch, oldDirPath, newDirPath, failedPaths);
  if (failedPaths.length > 0) {
    throw new Error(`Failed to move ${failedPaths.length} item(s): ${failedPaths.join(', ')}`);
  }
}

async function moveDirectoryItems(
  owner: string,
  repo: string,
  branch: string | undefined,
  oldDirPath: string,
  newDirPath: string,
  failedPaths: string[],
): Promise<void> {
  const targetBranch = branch || 'main';
  const items = await fetchChildren(owner, repo, oldDirPath, branch);

  for (const item of items) {
    const relativePath = item.path.substring(oldDirPath.length + 1);
    const newPath = `${newDirPath}/${relativePath}`;

    if (item.type === 'dir') {
      await moveDirectoryItems(owner, repo, branch, item.path, newPath, failedPaths);
      continue;
    }

    const content = await GitHubService.getFileContent(owner, repo, item.path, branch);
    if (content === null) {
      failedPaths.push(item.path);
      continue;
    }
    const shaResult = await GitHubService.getFileSha(owner, repo, item.path, branch);
    if (shaResult.kind === 'error') {
      failedPaths.push(item.path);
      continue;
    }
    const sha = shaResult.kind === 'found' ? shaResult.sha : '';
    const moved = await GitHubService.moveFile(
      owner,
      repo,
      item.path,
      newPath,
      content,
      `Move: ${item.path} → ${newPath}`,
      sha,
      targetBranch,
    );
    if (!moved) failedPaths.push(item.path);
  }

  const oldSha = await GitHubService.getFileSha(owner, repo, oldDirPath, branch);
  if (oldSha.kind === 'found') {
    const gitkeepPath = `${oldDirPath}/.gitkeep`;
    const gitkeepSha = await GitHubService.getFileSha(owner, repo, gitkeepPath, branch);
    if (gitkeepSha.kind === 'found') {
      try {
        await GitHubService.deleteFile(owner, repo, gitkeepPath, `Clean up: ${gitkeepPath}`, gitkeepSha.sha, targetBranch);
      } catch (cleanupError) {
        console.warn('[repoTreeShared] gitkeep cleanup failed:', cleanupError);
      }
    }
  }
}

export async function deleteDirectory(
  owner: string,
  repo: string,
  branch: string | undefined,
  dirPath: string,
): Promise<DirectoryDeleteResult> {
  const targetBranch = branch || 'main';
  const items = await fetchChildren(owner, repo, dirPath, branch);
  const deleted: string[] = [];
  const failed: DirectoryDeleteFailure[] = [];

  for (const item of items) {
    if (item.type === 'dir') {
      const nested = await deleteDirectory(owner, repo, branch, item.path);
      deleted.push(...nested.deleted);
      failed.push(...nested.failed);
      continue;
    }

    const shaResult = await GitHubService.getFileSha(owner, repo, item.path, branch);
    if (shaResult.kind === 'error') {
      failed.push({ path: item.path, error: shaResult.message });
      continue;
    }
    if (shaResult.kind === 'not-found') {
      deleted.push(item.path);
      continue;
    }
    try {
      await GitHubService.deleteFile(owner, repo, item.path, `Delete: ${item.path}`, shaResult.sha, targetBranch);
      deleted.push(item.path);
    } catch (deleteError) {
      failed.push({ path: item.path, error: errorMessage(deleteError) });
    }
  }

  return { deleted, failed };
}
