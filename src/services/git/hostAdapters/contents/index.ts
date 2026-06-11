import type { ContentsAdapter } from './types';
import type { GitHostKind } from '../types';
import { githubContentsAdapter } from './github';

/**
 * Resolve the Contents adapter for a given host kind. Phase 1
 * supports only GitHub; self-hosted adapters throw a clear error
 * that the caller can surface to the user (e.g. "API-mode sync is
 * not yet available for Gitea — switch to clone mode in Settings").
 */
export function getContentsAdapter(kind: GitHostKind): ContentsAdapter {
  switch (kind) {
    case 'github':
      return githubContentsAdapter;
    case 'gitea':
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

export { githubContentsAdapter };
export type { ContentsAdapter } from './types';
