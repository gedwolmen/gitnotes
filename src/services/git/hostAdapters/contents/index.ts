import type { ContentsAdapter } from './types';
import type { GitHostKind } from '../types';
import { githubContentsAdapter } from './github';
import { giteaContentsAdapter } from './gitea';

/**
 * Resolve the Contents adapter for a given host kind.
 *
 * Phase 1 of this PR (the original commit) only wired `github`;
 * the gitea adapter landed in a follow-up commit. GitLab is
 * still pending (its Repository Files API is meaningfully
 * different from GitHub's and Gitea's) and the factory throws
 * for it with a clear error message the caller can surface.
 */
export function getContentsAdapter(kind: GitHostKind): ContentsAdapter {
  switch (kind) {
    case 'github':
      return githubContentsAdapter;
    case 'gitea':
      return giteaContentsAdapter;
    case 'gitlab':
      throw new Error(
        `API-mode sync (Contents adapter) is not yet implemented for ${kind}. ` +
          `Switch the repo to 'clone' mode in Settings to use the host's Git endpoint directly.`,
      );
    default: {
      const exhaustive: never = kind;
      throw new Error(`No contents adapter registered for host kind: ${String(exhaustive)}`);
    }
  }
}

export { githubContentsAdapter, giteaContentsAdapter };
export type { ContentsAdapter } from './types';
