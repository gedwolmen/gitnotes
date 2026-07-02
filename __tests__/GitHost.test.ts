import {
  GIT_HOST_LABELS,
  GIT_HOST_API_BASES,
  makeRepoId,
  type GitHostProvider,
} from '../src/services/git/GitHost';
import { getGitHostService } from '../src/services/git/gitHostFactory';
import { gitLabService } from '../src/services/git/GitLabService';
import {
  giteaHostService,
  forgejoHostService,
} from '../src/services/git/gitHostFactory';

describe('GitHost abstraction', () => {
  it('exposes human-readable labels for every host', () => {
    expect(GIT_HOST_LABELS.github).toBe('GitHub');
    expect(GIT_HOST_LABELS.gitlab).toBe('GitLab');
    expect(GIT_HOST_LABELS.gitea).toBe('Gitea');
    expect(GIT_HOST_LABELS.forgejo).toBe('Forgejo');
  });

  it('exposes a default API base for every host', () => {
    expect(GIT_HOST_API_BASES.github).toBe('https://api.github.com');
    expect(GIT_HOST_API_BASES.gitlab).toBe('https://gitlab.com/api/v4');
    expect(GIT_HOST_API_BASES.gitea).toBe('https://gitea.com/api/v1');
    expect(GIT_HOST_API_BASES.forgejo).toBe('https://codeberg.org/api/v1');
  });

  it('composes stable repo ids', () => {
    expect(makeRepoId('github', 'octocat', 'hello')).toBe('github:octocat/hello');
    expect(makeRepoId('gitlab', 'inkscape', 'inkscape')).toBe(
      'gitlab:inkscape/inkscape',
    );
  });
});

describe('getGitHostService', () => {
  it('returns the GitHub service for github / null / unknown providers', () => {
    const providers: Array<GitHostProvider | string | null | undefined> = [
      'github',
      null,
      undefined,
      '',
      'unsupported',
    ];
    for (const p of providers) {
      expect(getGitHostService(p).provider).toBe('github');
    }
  });

  it('returns the GitLab service for gitlab', () => {
    expect(getGitHostService('gitlab')).toBe(gitLabService);
    expect(getGitHostService('gitlab').provider).toBe('gitlab');
  });

  it('returns the Gitea service for gitea', () => {
    expect(getGitHostService('gitea').provider).toBe('gitea');
    expect(getGitHostService('gitea')).toBe(giteaHostService);
  });

  it('returns the Forgejo service for forgejo', () => {
    expect(getGitHostService('forgejo').provider).toBe('forgejo');
    expect(getGitHostService('forgejo')).toBe(forgejoHostService);
  });
});
