import { GitHubService } from './GitHubService';
import { Todo } from '../models/Todo';

export interface TodoGitHubSyncResult {
  success: boolean;
  filePath?: string;
  error?: string;
}

function parseRepoPath(repoPath: string): { owner: string; repo: string } | null {
  const cleaned = repoPath
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/^github\.com\//, '')
    .replace(/\.git$/, '')
    .trim();
  const parts = cleaned.split('/');
  if (parts.length >= 2) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
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
}): Promise<TodoGitHubSyncResult> {
  const { repo: repoPath, branch, filePath, text, todo } = params;

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
    const slug = text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'untitled';
    targetPath = `todos/${slug}.json`;
  }

  const content = serializeTodo(todo);
  const message = filePath ? `Update todo: ${text}` : `Create todo: ${text}`;

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
