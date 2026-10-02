import type { GitHubRepository } from '../../../src/services/GitHubService';
import type { GitRepository } from '../../../src/services/GitService';
import { buildDisplayRepos } from '../../../src/components/ai/chatRepoDisplay';

const githubRepo = (full_name: string, id: number): GitHubRepository => ({
  id,
  name: full_name.split('/')[1],
  full_name,
  owner: { login: full_name.split('/')[0] },
  html_url: `https://github.com/${full_name}`,
  description: '',
  private: false,
});

const localRepo = (path: string, id: string): GitRepository => ({
  id,
  path,
  name: path.split('/').pop() ?? path,
});

describe('buildDisplayRepos', () => {
  it('removes duplicate local and GitHub repository paths', () => {
    const displayRepos = buildDisplayRepos(
      [
        localRepo('vidwadeseram/uwu-code', 'local-1'),
        localRepo('vidwadeseram/uwu-code', 'local-2'),
      ],
      [
        githubRepo('vidwadeseram/uwu-code', 1),
        githubRepo('vidwadeseram/game-of-life', 2),
        githubRepo('vidwadeseram/game-of-life', 3),
      ],
    );

    expect(displayRepos).toEqual([
      { path: 'vidwadeseram/uwu-code', name: 'uwu-code', isAdded: true },
      { path: 'vidwadeseram/game-of-life', name: 'game-of-life', isAdded: false },
    ]);
  });
});
