import { GiteaLikeHostService } from '../src/services/git/GiteaLikeHostService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  (AsyncStorage.getItem as jest.Mock) = jest.fn(async () => null);
  (AsyncStorage.setItem as jest.Mock) = jest.fn(async () => undefined);
  (AsyncStorage.removeItem as jest.Mock) = jest.fn(async () => undefined);
});

function primeAuthAndEndpoint(endpointBody: unknown, endpointStatus = 200): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
}

describe('GiteaLikeHostService (gitea)', () => {
  it('uses the token auth scheme', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitea.com/api/v1/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'token gt-abc' }),
      }),
    );
  });

  it('listBranches returns the branch list', async () => {
    primeAuthAndEndpoint([{ name: 'main' }, { name: 'develop' }]);
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const branches = await svc.listBranches('octocat', 'hello');
    expect(branches).toEqual([{ name: 'main' }, { name: 'develop' }]);
  });

  it('getTreeRecursive walks folders recursively', async () => {
    // First /user probe
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me' }));
    // Root contents: a dir and a file
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { name: 'docs', path: 'docs', type: 'dir', sha: 'd1' },
        { name: 'README.md', path: 'README.md', type: 'file', sha: 'f1' },
      ]),
    );
    // Subfolder contents
    mockFetch.mockResolvedValueOnce(
      jsonResponse([{ name: 'intro.md', path: 'docs/intro.md', type: 'file', sha: 'f2' }]),
    );
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    const tree = await svc.getTreeRecursive('octocat', 'hello', 'main');
    expect(tree).toEqual([
      { path: 'docs', type: 'tree', sha: 'd1' },
      { path: 'docs/intro.md', type: 'blob', sha: 'f2' },
      { path: 'README.md', type: 'blob', sha: 'f1' },
    ]);
  });

  it('getDefaultBranch reads the repo metadata', async () => {
    primeAuthAndEndpoint({ default_branch: 'trunk' });
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    await svc.setToken('gt-abc');
    expect(await svc.getDefaultBranch('octocat', 'hello')).toBe('trunk');
  });

  it('returns null when unauthenticated', async () => {
    const svc = new GiteaLikeHostService('gitea', 'https://gitea.com/api/v1');
    expect(await svc.listBranches('x', 'y')).toEqual([]);
    expect(await svc.getDefaultBranch('x', 'y')).toBeNull();
  });
});

describe('GiteaLikeHostService (forgejo)', () => {
  it('uses the forgejo provider label and codeberg base url by default', async () => {
    const svc = new GiteaLikeHostService('forgejo', 'https://codeberg.org/api/v1');
    expect(svc.provider).toBe('forgejo');
    expect(svc.getBaseUrl()).toBe('https://codeberg.org/api/v1');
  });

  it('clears token and user on clearToken', async () => {
    const svc = new GiteaLikeHostService('forgejo', 'https://codeberg.org/api/v1');
    await svc.clearToken();
    expect(svc.isAuthenticated()).toBe(false);
    expect(svc.getUser()).toBeNull();
  });
});
