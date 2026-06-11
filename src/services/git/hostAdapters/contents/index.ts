import type { ContentsAdapter } from './types';
import type { GitHostKind } from '../types';
import { githubContentsAdapter } from './github';
import { giteaContentsAdapter } from './gitea';
import { gitlabContentsAdapter } from './gitlab';

/**
 * Resolve the Contents adapter for a given host kind.
 *
 * All three hosts are now wired. GitLab's adapter covers the
 * Repository Files API for text content and falls back to the
 * Commits API for binary uploads and deletes (see the
 * `GitLabContentsAdapter` docstring for the rationale).
 */
export function getContentsAdapter(kind: GitHostKind): ContentsAdapter {
  switch (kind) {
    case 'github':
      return githubContentsAdapter;
    case 'gitea':
      return giteaContentsAdapter;
    case 'gitlab':
      return gitlabContentsAdapter;
    default: {
      const exhaustive: never = kind;
      throw new Error(`No contents adapter registered for host kind: ${String(exhaustive)}`);
    }
  }
}

export { githubContentsAdapter, giteaContentsAdapter, gitlabContentsAdapter };
export type { ContentsAdapter } from './types';
