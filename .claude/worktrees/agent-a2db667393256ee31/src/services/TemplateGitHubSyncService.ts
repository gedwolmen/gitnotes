import { GitHubService } from './GitHubService';
import { parseRepoPath } from '../utils/gitPathParser';
import { serializeTemplate, templateSlug } from './TemplateMarkdownService';
import type { NoteTemplate } from './TemplateService';
import { SyncEngineService } from './SyncEngineService';
import { LocalGitWriter } from './git/LocalGitWriter';
import { AuthService } from './AuthService';

function resolveAuthor() {
  const user = GitHubService.getUser();
  return {
    name: user?.name || user?.login || 'gitnotes',
    email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
  };
}

export interface TemplateSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

export async function syncTemplateToGitHub(params: {
  repoPath: string;
  branch: string;
  template: NoteTemplate;
}): Promise<TemplateSyncResult> {
  const { repoPath, branch, template } = params;

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }
  const info = parseRepoPath(repoPath);
  if (!info) return { success: false, error: `Invalid repo path: ${repoPath}` };

  const targetPath = template.filePath || `templates/${templateSlug(template.name)}.md`;
  const isUpdate = Boolean(template.filePath);
  const message = `${isUpdate ? 'Update' : 'Add'} template ${template.name}`;
  const body = serializeTemplate({ ...template, filePath: undefined });

  // Clone-mode write path (#514). Templates target their own configured repo
  // (TemplateRepoPreferenceService), so the sync-engine flag we read is for
  // *that* repo, not the editing repo.
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const tokenForPush = (await AuthService.getToken()) ?? undefined;
    const writeResult = await LocalGitWriter.writeAndCommit({
      repoPath,
      branch,
      filePath: targetPath,
      content: body,
      message,
      author: resolveAuthor(),
      token: tokenForPush,
    });
    if (writeResult.success) return { success: true, filePath: targetPath };
    return { success: false, error: writeResult.error };
  }

  try {
    const result = await GitHubService.updateFile(
      info.owner, info.repo, targetPath, body, message, branch, undefined,
    );
    if (!result) return { success: false, error: 'GitHub API returned no result' };
    return { success: true, filePath: targetPath };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function deleteTemplateFromGitHub(params: {
  repoPath: string;
  branch: string;
  filePath: string;
  name: string;
  sha?: string;
}): Promise<TemplateSyncResult> {
  const { repoPath, branch, filePath, name, sha } = params;

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }
  const info = parseRepoPath(repoPath);
  if (!info) return { success: false, error: `Invalid repo path: ${repoPath}` };

  // Clone-mode delete path (#514).
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const tokenForPush = (await AuthService.getToken()) ?? undefined;
    return LocalGitWriter.deleteAndCommit({
      repoPath,
      branch,
      filePath,
      message: `Delete template ${name}`,
      author: resolveAuthor(),
      token: tokenForPush,
    });
  }

  let resolvedSha = sha;
  if (!resolvedSha) {
    resolvedSha = (await GitHubService.getFileSha(info.owner, info.repo, filePath, branch)) ?? undefined;
    if (!resolvedSha) {
      // File already gone on the remote — treat as success.
      return { success: true, filePath };
    }
  }

  try {
    const result = await GitHubService.deleteFile(
      info.owner, info.repo, filePath, `Delete template ${name}`, resolvedSha, branch,
    );
    if (!result) return { success: false, error: 'GitHub API returned no result' };
    return { success: true, filePath };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}
