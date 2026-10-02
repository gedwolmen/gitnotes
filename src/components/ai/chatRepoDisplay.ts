import type { GitRepository } from '../../services/GitService';
import type { GitHubRepository } from '../../services/GitHubService';

export type DisplayRepo = {
  readonly path: string;
  readonly name: string;
  readonly isAdded: boolean;
};

export function buildDisplayRepos(
  repositories: readonly GitRepository[],
  githubRepos: readonly GitHubRepository[],
): DisplayRepo[] {
  const seenPaths = new Set<string>();
  const displayRepos: DisplayRepo[] = [];

  for (const repository of repositories) {
    const path = repository.path.includes('/') ? repository.path : repository.name;
    if (seenPaths.has(path)) continue;
    seenPaths.add(path);
    displayRepos.push({ path, name: repository.name, isAdded: true });
  }

  for (const repository of githubRepos) {
    if (seenPaths.has(repository.full_name)) continue;
    seenPaths.add(repository.full_name);
    displayRepos.push({ path: repository.full_name, name: repository.name, isAdded: false });
  }

  return displayRepos;
}
