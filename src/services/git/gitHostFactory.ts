import { gitHubHostService } from './GitHubHostService';
import { gitLabService } from './GitLabService';
import { GiteaLikeHostService } from './GiteaLikeHostService';
import { GIT_HOST_API_BASES, type GitHostProvider, type GitHostService } from './GitHost';

const giteaService = new GiteaLikeHostService('gitea', GIT_HOST_API_BASES.gitea);
const forgejoService = new GiteaLikeHostService('forgejo', GIT_HOST_API_BASES.forgejo);

export const giteaHostService = giteaService;
export const forgejoHostService = forgejoService;

/**
 * Resolves a `GitHostService` implementation by provider id.
 *
 * The factory returns singleton services so each host has at most one
 * set of cached state in memory. New hosts should be registered here
 * and exposed through the same singleton pattern.
 */
export function getGitHostService(
  provider: GitHostProvider | string | null | undefined,
): GitHostService {
  switch (provider) {
    case 'gitlab':
      return gitLabService;
    case 'gitea':
      return giteaService;
    case 'forgejo':
      return forgejoService;
    case 'github':
    case null:
    case undefined:
    case '':
      return gitHubHostService;
    default:
      // Unknown provider falls back to GitHub for backward compatibility.
      return gitHubHostService;
  }
}

export { gitHubHostService, gitLabService };
