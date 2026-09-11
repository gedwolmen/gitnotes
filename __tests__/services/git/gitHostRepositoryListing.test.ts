import { GitHubHostService } from '../../../src/services/git/GitHubHostService';
import { GitLabService } from '../../../src/services/git/GitLabService';
import { GiteaLikeHostService } from '../../../src/services/git/GiteaLikeHostService';
import { GIT_HOST_API_BASES } from '../../../src/services/git/GitHost';

// Fixtures

const mockGitHubRepos = [
  {
    id: 1,
    full_name: 'owner/repo1',
    name: 'repo1',
    description: 'A test repo',
    private: true,
    size: 1024,
    owner: { login: 'owner' },
  },
  {
    id: 2,
    full_name: 'owner/repo2',
    name: 'repo2',
    description: null,
    private: false,
    size: 2048,
    owner: { login: 'owner' },
  },
];

const mockGitLabProjects = [
  {
    id: 1,
    path_with_namespace: 'group/project1',
    name: 'project1',
    description: 'GitLab project',
    visibility: 'private' as const,
    default_branch: 'main',
    size: 4096,
  },
  {
    id: 2,
    path_with_namespace: 'group/project2',
    name: 'project2',
    description: undefined,
    visibility: 'public' as const,
  },
];

jest.mock('@/services/GitHubService', () => {
  return {
    __esModule: true,
    GitHubService: {
      getRepositories: jest.fn(),
    },
    GitHubServiceStatic: {
      getRepoMeta: jest.fn(),
      rawGet: jest.fn(),
    },
  };
}, { virtual: true });

describe('GitHostService.listRepositories()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GitHubHostService', () => {
    it('maps GitHub repos correctly', async () => {
      const mock = jest.requireMock('@/services/GitHubService');
      mock.GitHubService.getRepositories.mockResolvedValue(mockGitHubRepos);

      const service = new GitHubHostService();
      const result = await service.listRepositories();

      expect(result).toHaveLength(2);

      expect(result[0]).toMatchObject({
        provider: 'github',
        owner: 'owner',
        repo: 'repo1',
        fullName: 'owner/repo1',
        name: 'repo1',
        description: 'A test repo',
        isPrivate: true,
        sizeKb: 1024,
      });

      expect(result[1]).toMatchObject({
        provider: 'github',
        owner: 'owner',
        repo: 'repo2',
        fullName: 'owner/repo2',
        name: 'repo2',
        description: null,
        isPrivate: false,
        sizeKb: 2048,
      });
    });

    it('returns unavailable on error', async () => {
      const mock = jest.requireMock('@/services/GitHubService');
      mock.GitHubService.getRepositories.mockRejectedValue(new Error('Network error'));

      const service = new GitHubHostService();
      const result = await service.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'unavailable',
        provider: 'github',
        reason: 'Network error',
      });
    });
  });

  describe('GitLabService', () => {
    it('maps GitLab projects correctly', async () => {
      const service = new GitLabService();
      service.listOwnedProjects = jest.fn().mockResolvedValue(mockGitLabProjects);

      const result = await service.listRepositories();

      expect(result).toHaveLength(2);

      // First project
      expect(result[0]).toMatchObject({
        provider: 'gitlab',
        owner: 'group',
        repo: 'project1',
        fullName: 'group/project1',
        name: 'project1',
        description: 'GitLab project',
        isPrivate: true,
        sizeKb: 4, // 4096 / 1024 = 4
        defaultBranch: 'main',
      });

      // Second project
      expect(result[1]).toMatchObject({
        provider: 'gitlab',
        owner: 'group',
        repo: 'project2',
        fullName: 'group/project2',
        name: 'project2',
        description: null,
        isPrivate: false,
      });
    });

    it('returns unavailable on error', async () => {
      const service = new GitLabService();
      service.listOwnedProjects = jest.fn().mockRejectedValue(new Error('GitLab fetch failed'));

      const result = await service.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'unavailable',
        provider: 'gitlab',
        reason: 'GitLab fetch failed',
      });
    });
  });

  describe('GiteaLikeHostService', () => {
    it('always returns unavailable', async () => {
      const giteaService = new GiteaLikeHostService('gitea', GIT_HOST_API_BASES.gitea);
      const result = await giteaService.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'unavailable',
        provider: 'gitea',
        reason: 'Repository listing is not supported for Gitea and Forgejo. You can add a repository manually.',
      });
    });

    it('forgejo returns unavailable with forgejo provider', async () => {
      const forgejoService = new GiteaLikeHostService('forgejo', GIT_HOST_API_BASES.forgejo);
      const result = await forgejoService.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        kind: 'unavailable',
        provider: 'forgejo',
        reason: 'Repository listing is not supported for Gitea and Forgejo. You can add a repository manually.',
      });
    });
  });
});
