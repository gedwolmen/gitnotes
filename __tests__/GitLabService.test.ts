import { GitLabService } from '../src/services/git/GitLabService';
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

/** Configures `fetch` so the first call (the /user probe inside setToken) succeeds
 * and any subsequent calls (the real method under test) get the provided body. */
function primeAuthAndEndpoint(endpointBody: unknown, endpointStatus = 200): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
}

describe('GitLabService', () => {
  it('uses the PRIVATE-TOKEN header on every request', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('https://gitlab.com/api/v4/user'),
      expect.objectContaining({
        headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'glpat-abc' }),
      }),
    );
  });

  it('listBranches maps the default branch flag', async () => {
    primeAuthAndEndpoint([
      { name: 'main', default: true },
      { name: 'feature/x', default: false },
    ]);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');

    const branches = await svc.listBranches('inkscape', 'inkscape');
    expect(branches).toEqual([
      { name: 'main', isDefault: true },
      { name: 'feature/x', isDefault: false },
    ]);
  });

  it('listContents maps tree items to dirs and blob items to files', async () => {
    primeAuthAndEndpoint([
      { id: 'a', name: 'docs', type: 'tree', path: 'docs' },
      { id: 'b', name: 'README.md', type: 'blob', path: 'README.md' },
    ]);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const items = await svc.listContents('inkscape', 'inkscape', '');
    expect(items).toEqual([
      { name: 'docs', path: 'docs', type: 'dir', sha: 'a' },
      { name: 'README.md', path: 'README.md', type: 'file', sha: 'b' },
    ]);
  });

  it('getTreeRecursive returns only valid entries', async () => {
    primeAuthAndEndpoint([
      { id: 'a', name: 'src', type: 'tree', path: 'src' },
      { id: 'b', name: 'main.ts', type: 'blob', path: 'src/main.ts' },
    ]);
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const tree = await svc.getTreeRecursive('inkscape', 'inkscape', 'main');
    expect(tree).toEqual([
      { path: 'src', type: 'tree', sha: 'a' },
      { path: 'src/main.ts', type: 'blob', sha: 'b' },
    ]);
  });

  it('getFileText decodes base64 payload', async () => {
    const body = Buffer.from('hello world').toString('base64');
    primeAuthAndEndpoint({ content: body, encoding: 'base64' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    const text = await svc.getFileText('inkscape', 'inkscape', 'README.md', 'main');
    expect(text).toBe('hello world');
  });

  it('getDefaultBranch reads default_branch from the project endpoint', async () => {
    primeAuthAndEndpoint({ default_branch: 'develop' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    expect(await svc.getDefaultBranch('inkscape', 'inkscape')).toBe('develop');
  });

  it('returns null when API is unauthenticated', async () => {
    const svc = new GitLabService();
    expect(await svc.listBranches('x', 'y')).toEqual([]);
    expect(await svc.getDefaultBranch('x', 'y')).toBeNull();
  });

  it('setToken with a baseUrl uses that baseUrl', async () => {
    primeAuthAndEndpoint({ id: 1, username: 'me', name: 'Me' });
    const svc = new GitLabService();
    await svc.setToken('glpat-abc', 'https://gitlab.example.com/api/v4');
    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitlab.example.com/api/v4/user',
      expect.any(Object),
    );
  });

  it('setToken without baseUrl resets to default (not stale from previous connection)', async () => {
    primeAuthAndEndpoint({ id: 1, username: 'me', name: 'Me' });
    const svc = new GitLabService();
    svc.setBaseUrl('https://self-hosted-gitlab.example.com/api/v4');
    await svc.setToken('glpat-abc');

    mockFetch.mockReset();
    primeAuthAndEndpoint({ id: 2, username: 'saas-user', name: 'SaaS' });
    await svc.setToken('glpat-saas');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/user',
      expect.any(Object),
    );
    expect(svc.getBaseUrl()).toBe('https://gitlab.com/api/v4');
  });
});
