import { GitHubService } from './GitHubService';
import { serializeTemplate, templateSlug } from './TemplateMarkdownService';
import type { NoteTemplate } from './TemplateService';
import { CommitService } from './git/CommitService';
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

  const targetPath = template.filePath || `${resolveDefaultFolder('template')}${templateSlug(template.name)}.md`;
  const isUpdate = Boolean(template.filePath);
  const message = `${isUpdate ? 'Update' : 'Add'} template ${template.name}`;
  const body = serializeTemplate({ ...template, filePath: undefined });

  const commitResult = await CommitService.commit({
    repo: repoPath,
    branch,
    filePath: targetPath,
    content: body,
    message,
  });
  if (commitResult.success) return { success: true, filePath: targetPath };
  return { success: false, error: commitResult.error };
}

export async function deleteTemplateFromGitHub(params: {
  repoPath: string;
  branch: string;
  filePath: string;
  name: string;
  sha?: string;
}): Promise<TemplateSyncResult> {
  const { repoPath, branch, filePath, name } = params;

  if (!GitHubService.isAuthenticated()) {
    return { success: false, error: 'GitHub not authenticated' };
  }

  const commitResult = await CommitService.commit({
    repo: repoPath,
    branch,
    filePath,
    message: `Delete template ${name}`,
    delete: true,
  });
  if (commitResult.success) return { success: true, filePath };
  return { success: false, error: commitResult.error };
}
