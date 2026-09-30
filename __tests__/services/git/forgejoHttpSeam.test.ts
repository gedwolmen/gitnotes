/**
 * Manual QA: Forgejo HTTP seam test.
 *
 * Demonstrates that when a Forgejo repo with a custom base URL is used,
 * the app calls GET <custom-api-base>/repos/<owner>/<repo> and returns 'trunk',
 * WITHOUT any request to api.github.com.
 *
 * Run: yarn jest __tests__/services/git/forgejoHttpSeam.test.ts --testPathIgnorePatterns='[]'
 */
import { resolveBranch } from '../../../src/services/git/branchResolver';

const mockGetCurrentBranch = jest.fn();
const mockGetActiveGitHost = jest.fn();

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { getCurrentBranch: (...args: any[]) => mockGetCurrentBranch(...args) },
}));

jest.mock('@/services/git/activeHost', () => ({
  getActiveGitHost: () => mockGetActiveGitHost(),
}));

const GITHUB_API = 'https://api.github.com';
const FORGEJO_BASE = 'http://forgejo.local:3000/api/v1';

describe('Forgejo HTTP seam (manual QA)', () => {
  let fetchedUrls: string[];
  let mockGetDefaultBranch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchedUrls = [];
    mockGetDefaultBranch = jest.fn();
    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      fetchedUrls.push(url.toString());
      return { ok: false, status: 404 } as Response;
    });
    mockGetCurrentBranch.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('host.getDefaultBranch is called with correct owner/repo — no api.github.com hit', async () => {
    mockGetDefaultBranch.mockResolvedValue('trunk');
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'forgejo',
      baseUrl: FORGEJO_BASE,
      token: 'forgejo-token',
      host: { getDefaultBranch: mockGetDefaultBranch },
      hostId: 'hid-forgejo',
      instanceBaseUrl: FORGEJO_BASE,
    });

    const branch = await resolveBranch('myorg/myrepo');

    expect(branch).toBe('trunk');
    // Must have called the Forgejo host's getDefaultBranch
    expect(mockGetDefaultBranch).toHaveBeenCalledWith('myorg', 'myrepo');
    // Must NOT have fallen back to GitHub API
    expect(fetchedUrls.some((u) => u.includes(GITHUB_API))).toBe(false);
  });
});
