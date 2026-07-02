import { GitHubHostService } from '../src/services/git/GitHubHostService';

const mockGetTreeRecursive = jest.fn();
const mockGetFileContent = jest.fn();
const mockGetRepoContents = jest.fn();
const mockGetUser = jest.fn();
const mockIsAuthenticated = jest.fn();

jest.mock('../src/services/GitHubService', () => {
  return {
    GitHubService: {
      getTreeRecursive: (...args: unknown[]) => mockGetTreeRecursive(...args),
      getFileContent: (...args: unknown[]) => mockGetFileContent(...args),
      getRepoContents: (...args: unknown[]) => mockGetRepoContents(...args),
      getUser: () => mockGetUser(),
      isAuthenticated: () => mockIs_authenticated_value(),
    },
    GitHubServiceStatic: {
      rawGet: jest.fn(async () => null),
      getRepoMeta: jest.fn(async () => ({ default_branch: 'main' })),
    },
  };
});

function mockIs_authenticated_value(): boolean {
  return mockIsAuthenticated();
}

beforeEach(() => {
  mockGetTreeRecursive.mockReset();
  mockGetFileContent.mockReset();
  mockGetRepoContents.mockReset();
  mockGetUser.mockReset();
  mockIsAuthenticated.mockReset();
  mockIsAuthenticated.mockReturnValue(true);
});

describe('GitHubHostService', () => {
  it('reports its provider as github', () => {
    expect(new GitHubHostService().provider).toBe('github');
  });

  it('getDefaultBranch reads default_branch via the static helper', async () => {
    const svc = new GitHubHostService();
    const branch = await svc.getDefaultBranch('octocat', 'hello');
    expect(branch).toBe('main');
  });

  it('listBranches uses the static rawGet helper', async () => {
    const { GitHubServiceStatic } = require('../src/services/GitHubService');
    (GitHubServiceStatic.rawGet as jest.Mock)
      .mockResolvedValueOnce([{ name: 'main' }, { name: 'develop' }])
      .mockResolvedValueOnce({ default_branch: 'main' });
    const svc = new GitHubHostService();
    const branches = await svc.listBranches('octocat', 'hello');
    expect(branches).toEqual([
      { name: 'main', isDefault: true },
      { name: 'develop', isDefault: false },
    ]);
  });

  it('getTreeRecursive delegates to GitHubService (authenticated path)', async () => {
    mockGetTreeRecursive.mockResolvedValueOnce([
      { path: 'src', type: 'tree', sha: 's1' },
      { path: 'src/index.ts', type: 'blob', sha: 's2' },
    ]);
    const svc = new GitHubHostService();
    const tree = await svc.getTreeRecursive('octocat', 'hello', 'main');
    expect(mockGetTreeRecursive).toHaveBeenCalledWith('octocat', 'hello', 'main');
    expect(tree).toEqual([
      { path: 'src', type: 'tree', sha: 's1' },
      { path: 'src/index.ts', type: 'blob', sha: 's2' },
    ]);
  });

  it('getTreeRecursive returns [] when the service throws', async () => {
    mockGetTreeRecursive.mockRejectedValueOnce(new Error('boom'));
    const svc = new GitHubHostService();
    const tree = await svc.getTreeRecursive('octocat', 'hello', 'main');
    expect(tree).toEqual([]);
  });

  it('listContents delegates to GitHubService.getRepoContents and maps types', async () => {
    mockGetRepoContents.mockResolvedValueOnce([
      { name: 'docs', path: 'docs', type: 'dir', size: 0, sha: 'd1' },
      { name: 'README.md', path: 'README.md', type: 'file', size: 100, sha: 'f1', download_url: 'x' },
    ]);
    const svc = new GitHubHostService();
    const items = await svc.listContents('octocat', 'hello', '');
    expect(mockGetRepoContents).toHaveBeenCalledWith('octocat', 'hello', '', undefined);
    expect(items).toEqual([
      { name: 'docs', path: 'docs', type: 'dir', size: 0, sha: 'd1', downloadUrl: null },
      { name: 'README.md', path: 'README.md', type: 'file', size: 100, sha: 'f1', downloadUrl: 'x' },
    ]);
  });

  it('getFileText delegates to GitHubService.getFileContent', async () => {
    // getFileContent returns a decoded string; mock the return shape.
    mockGetFileContent.mockResolvedValueOnce('hello');
    const svc = new GitHubHostService();
    const text = await svc.getFileText('octocat', 'hello', 'README.md', 'main');
    expect(mockGetFileContent).toHaveBeenCalledWith('octocat', 'hello', 'README.md', 'main');
    expect(text).toBe('hello');
  });
});
