/**
 * Derives defaults for repo, branch, and content folder at read time — no
 * preferences are saved by these functions.
 *
 * Used by PR2 wiring to provide sensible fallbacks when no explicit value
 * is supplied (e.g. when creating a note without an explicit branch).
 */

import { StorageService } from '../StorageService';
import { resolveBranch } from './branchResolver';
import { useRepoStore } from '../../stores/repoStore';
import type { GitRepository } from '../GitService';

const NOTE_FOLDER = 'notes/';
const CANVAS_FOLDER = 'canvases/';
const TODO_FOLDER = 'todos/';
const TEMPLATE_FOLDER = 'templates/';

export type ContentType = 'note' | 'canvas' | 'todo' | 'template';

/**
 * Returns the first saved repository's path.
 * @throws Error if no repositories are saved.
 */
export async function resolveDefaultRepo(): Promise<string> {
  const repos: GitRepository[] = await StorageService.getSavedRepositories();
  if (repos.length === 0) {
    throw new Error('No saved repositories found');
  }
  return repos[0]!.path;
}

/**
 * Returns the stored branch for the given repo, falling back to 'main' when
 * no branch is stored, or delegating to branchResolver otherwise.
 */
export async function resolveDefaultBranch(repoPath: string): Promise<string> {
  const repos = useRepoStore.getState().repositories;
  const repo = repos.find((r: GitRepository) => r.path === repoPath);
  const storedBranch = repo?.branch;

  if (!storedBranch) {
    return 'main';
  }

  return resolveBranch(repoPath, storedBranch);
}

/**
 * Returns the default folder path for the given content type.
 */
export function resolveDefaultFolder(contentType: ContentType): string {
  switch (contentType) {
    case 'note':
      return NOTE_FOLDER;
    case 'canvas':
      return CANVAS_FOLDER;
    case 'todo':
      return TODO_FOLDER;
    case 'template':
      return TEMPLATE_FOLDER;
  }
}
