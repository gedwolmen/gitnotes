import { GitHubService } from './GitHubService';
import { parseRepoPath } from '../utils/gitPathParser';
import { serializeTemplate, templateSlug } from './TemplateMarkdownService';
import type { NoteTemplate } from './TemplateService';
import { SyncEngineService } from './SyncEngineService';
import { CloneSyncService } from './CloneSyncService';
import { resolveDefaultFolder } from './git/defaultsPolicy';
import { resolveDefaultRepo } from './git/defaultsPolicy';

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
  const { repoPath: inputRepoPath, branch, template } = params;
  let repoPath: string;
  try {
    repoPath = inputRepoPath ?? await resolveDefaultRepo();
  } catch {
    return { success: false, error: 'No repository configured' };
  }

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }
  const info = parseRepoPath(repoPath);
  if (!info) return { success: false, error: `Invalid repo path: ${repoPath}` };

  const targetPath = template.filePath || `${resolveDefaultFolder('template')}${templateSlug(template.name)}.md`;
  const isUpdate = Boolean(template.filePath);
  const message = `${isUpdate ? 'Update' : 'Add'} template ${template.name}`;
  const body = serializeTemplate({ ...template, filePath: undefined });

  // Clone-mode write path (#514). Templates target their own configured repo
  // (TemplateRepoPreferenceService), so the sync-engine flag we read is for
  // *that* repo, not the editing repo.
  const mode = await SyncEngineService.getMode(repoPath);
  if (mode === 'clone') {
    const saveResult = await CloneSyncService.save({
      repoPath,
      branch,
      filePath: targetPath,
      content: body,
      message,
      intent: 'upsert',
    });
    if (saveResult.success) return { success: true, filePath: targetPath };
    return { success: false, error: saveResult.error };
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
    const saveResult = await CloneSyncService.save({
      repoPath,
      branch,
      filePath,
      message: `Delete template ${name}`,
      intent: 'delete',
    });
    if (saveResult.success) return { success: true, filePath };
    return { success: false, error: saveResult.error };
  }

  let resolvedSha = sha;
  if (!resolvedSha) {
    const lookup = await GitHubService.getFileSha(info.owner, info.repo, filePath, branch);
    if (lookup.kind === 'not-found') {
      // File already gone on the remote — treat as success.
      return { success: true, filePath };
    }
    if (lookup.kind === 'error') {
      // Don't drop the local row — we couldn't tell if the upstream
      // copy still exists. Surface so caller can retry / queue.
      return { success: false, error: lookup.message };
    }
    resolvedSha = lookup.sha;
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
