import { GitHubService } from './GitHubService';
import { Todo } from '../models/Todo';
import { parseRepoPath } from '../utils/gitPathParser';
import { AuthService } from './AuthService';
import { SyncEngineService } from './SyncEngineService';
import { CommitService } from './git/CommitService';
import { resolveDefaultFolder, resolveDefaultRepo } from './git/defaultsPolicy';
import { GitFsService } from './git/GitFsService';
import { resolveBranch } from './git/resolveBranch';

async function resolveToken(accountId?: string): Promise<string | undefined> {
  if (!accountId) return undefined;
  const t = await AuthService.getTokenById(accountId);
  return t ?? undefined;
}

export interface TodoGitHubSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

function serializeTodo(todo: Partial<Todo>): string {
  const data = {
    text: todo.text ?? '',
    completed: todo.completed ?? false,
    priority: todo.priority,
    notes: todo.notes,
    tags: todo.tags ?? [],
    dueDate: todo.dueDate,
    createdAt: todo.createdAt,
    updatedAt: todo.updatedAt,
  };
  return JSON.stringify(data, null, 2);
}

export async function syncTodoToGitHub(params: {
  repo: string;
  branch?: string;
  filePath?: string;
  text: string;
  todo: Partial<Todo>;
  accountId?: string;
}): Promise<TodoGitHubSyncResult> {
  const { repo, branch, filePath, text, todo, accountId } = params;
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
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'untitled';
    targetPath = `${resolveDefaultFolder('todo')}${slug}.json`;
  }

  const content = serializeTodo(todo);

  // Determine create-vs-update by querying actual remote/clone state rather
  // than trusting the caller-supplied filePath. Callers (TodoListScreen)
  // pre-derive the path from the slug at draft time, so a brand-new todo
  // always carried filePath, which made every first-create commit say
  // "Update todo:" (#626). Falling back to caller's filePath only on lookup
  // failure preserves current behavior on transient errors.
  const mode = await SyncEngineService.getMode(repoPath);
  let fileExists: boolean | null;
  try {
    if (mode === 'clone') {
      const cloned = await GitFsService.isCloned({ repoPath });
      if (cloned) {
        const existing = await GitFsService.readFile({ repoPath, ref: targetBranch, filepath: targetPath });
        fileExists = existing !== null;
      } else {
        fileExists = false;
      }
    } else {
      const sha = await GitHubService.getFileShaOrNull(repoInfo.owner, repoInfo.repo, targetPath, targetBranch, opts);
      fileExists = sha !== null;
    }
  } catch (error) {
    console.warn('[TodoGitHubSyncService] fileExists check failed:', error);
    fileExists = null;
  }
  const useUpdateVerb = fileExists ?? !!filePath;
  const message = useUpdateVerb ? `Update todo: ${text}` : `Create todo: ${text}`;

  // Clone-mode write path (#514). Same on-disk shape as the API path so a
  // mode flip later doesn't surface a no-op churn commit.
  if (mode === 'clone') {
    const commitResult = await CommitService.commit({
      repo: repoPath,
      branch: targetBranch,
      filePath: targetPath,
      content,
      message,
    });
    if (commitResult.success) {
      return { success: true, filePath: targetPath };
    }
    return { success: false, error: commitResult.error };
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

export async function deleteTodoFromGitHub(params: {
  repo: string;
  branch?: string;
  filePath: string;
  text?: string;
  accountId?: string;
}): Promise<TodoGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, text, accountId } = params;
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
    const commitResult = await CommitService.commit({
      repo: repoPath,
      branch: targetBranch,
      filePath,
      content: '',
      message: `Delete todo: ${text || filePath}`,
      delete: true,
    });
    if (commitResult.success) {
      return { success: true, filePath };
    }
    return { success: false, error: commitResult.error };
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
      `Delete todo: ${text || filePath}`,
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
