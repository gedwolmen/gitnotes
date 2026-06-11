import type { GitHostAdapter, GitHostKind, SupportedGitHostKind } from './types';
import { githubAdapter } from './github';
import { giteaAdapter } from './gitea';
import { gitlabAdapter } from './gitlab';

/**
 * Returns the adapter for the given host kind. Throws for unknown
 * kinds (and for kinds that are in the `GitHostKind` union for
 * forward compatibility but not yet implemented) so a typo at a
 * call site fails loudly rather than silently falling back to
 * GitHub and surprising the user.
 *
 * Adding a new host = add to the `SupportedGitHostKind` union, add
 * a case below, and TypeScript will then flag every switch / lookup
 * that needs to learn the new kind.
 */
export function getAdapter(kind: GitHostKind): GitHostAdapter {
  switch (kind) {
    case 'github':
      return githubAdapter;
    case 'gitea':
      return giteaAdapter;
    case 'gitlab':
      // **Clone mode only.** The Contents API for read/write of
      // individual files in API-mode sync is still GitHub-only;
      // adding GitLab's Repository Files API is the phase 3 work
      // tracked in AGENT.md.
      return gitlabAdapter;
    default: {
      const exhaustive: never = kind;
      throw new Error(`No adapter registered for host kind: ${String(exhaustive)}`);
    }
  }
}

export function isGitHostKind(value: string): value is GitHostKind {
  return value === 'github' || value === 'gitea' || value === 'gitlab';
}

export function isSupportedGitHostKind(value: string): value is SupportedGitHostKind {
  return value === 'github' || value === 'gitea' || value === 'gitlab';
}

export { githubAdapter, giteaAdapter, gitlabAdapter };
export type {
  GitHostAdapter,
  GitHostKind,
  SupportedGitHostKind,
  RepoAddress,
  RepoCoordinates,
  BuildRemoteUrlOpts,
  BuildBasicAuthOpts,
  FetchDefaultBranchOpts,
} from './types';
