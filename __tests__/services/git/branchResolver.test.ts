/**
 * branchResolver.ts tests.
 *
 * Covers resolveBranch() and the three host-specific fetchers:
 *   fetchGitHubDefaultBranch  — github.com only
 *   fetchGitLabDefaultBranch  — gitlab.com + self-hosted GitLab
 *   fetchGiteaLikeDefaultBranch (new) — gitea.com + self-hosted Forgejo/Gitea
 *
 * Routing rules under test:
 *   1. Local clone HEAD (clone-mode repos) is always first priority.
 *   2. Remote default branch is resolved via the active host's API.
 *   3. Hard fallback: 'main'.
 */
import { resolveBranch, invalidateBranchCache, __resetBranchCacheForTests } from '../../../src/services/git/branchResolver';

// ── Mocks ─────────────────────────────────────────────────────────────────

const mockGetCurrentBranch = jest.fn();
const mockGetActiveGitHost = jest.fn<() => Promise<any>>();
const mockGetToken = jest.fn();

jest.mock('@/services/git/GitFsService', () => ({
  GitFsService: { getCurrentBranch: (...args: any[]) => mockGetCurrentBranch(...args) },
}));

jest.mock('@/services/git/activeHost', () => ({
  getActiveGitHost: () => mockGetActiveGitHost(),
}));

jest.mock('@/services/AuthService', () => ({
  __esModule: true,
  default: { getToken: () => mockGetToken() },
}));

// Spy on fetch to assert which URLs were requested.
let fetchSpy: jest.SpyInstance;
const GITHUB_API_BASE = 'https://api.github.com';

beforeEach(() => {
  jest.clearAllMocks();
  __resetBranchCacheForTests();
  fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (url: string) => {
    return { ok: false, status: 404 } as Response;
  });
});

afterEach(() => {
  fetchSpy.mockRestore();
});

// ── Baseline characterisation: GitHub ───────────────────────────────────────

describe('GitHub (existing behaviour — must not change)', () => {
  beforeEach(() => {
    mockGetCurrentBranch.mockResolvedValue(null);
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'github',
      baseUrl: GITHUB_API_BASE,
      token: 'gh-token',
      host: {},
      hostId: 'hid1',
      instanceBaseUrl: null,
    });
    mockGetToken.mockResolvedValue('gh-token');
  });

  it('returns local HEAD when available', async () => {
    mockGetCurrentBranch.mockResolvedValue('feature/my-branch');

    const branch = await resolveBranch('owner/repo');

    expect(branch).toBe('feature/my-branch');
    // No remote fetch needed for GitHub when local HEAD is available.
    expect(mockGetCurrentBranch).toHaveBeenCalledTimes(1);
  });

  it('falls back to GitHub API when no local HEAD', async () => {
    mockGetCurrentBranch.mockResolvedValue(null);
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes(`${GITHUB_API_BASE}/repos/owner/repo`)) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ default_branch: 'main' }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const branch = await resolveBranch('owner/repo');

    expect(branch).toBe('main');
    expect(fetchSpy).toHaveBeenCalledWith(
      `${GITHUB_API_BASE}/repos/owner/repo`,
      expect.any(Object),
    );
  });

  it('falls back to "main" when GitHub API also returns null', async () => {
    mockGetCurrentBranch.mockResolvedValue(null);
    fetchSpy.mockResolvedValue({ ok: false, status: 404 } as Response);

    const branch = await resolveBranch('owner/repo');

    expect(branch).toBe('main');
  });
});

// ── Baseline characterisation: GitLab ─────────────────────────────────────

describe('GitLab (existing behaviour — must not change)', () => {
  beforeEach(() => {
    mockGetCurrentBranch.mockResolvedValue(null);
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'gitlab',
      baseUrl: 'https://gitlab.com/api/v4',
      token: 'gl-token',
      host: {},
      hostId: 'hid2',
      instanceBaseUrl: null,
    });
    mockGetToken.mockResolvedValue(null);
  });

  it('returns local HEAD when available', async () => {
    mockGetCurrentBranch.mockResolvedValue('develop');

    const branch = await resolveBranch('group/project');

    expect(branch).toBe('develop');
    // No remote fetch needed when local HEAD is available.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('falls back to GitLab API when no local HEAD', async () => {
    mockGetCurrentBranch.mockResolvedValue(null);
    fetchSpy.mockImplementation(async (url: string) => {
      if (url.includes('/projects/')) {
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ default_branch: 'master' }),
        } as unknown as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const branch = await resolveBranch('group/project');

    expect(branch).toBe('master');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://gitlab.com/api/v4/projects/group%2Fproject',
      expect.any(Object),
    );
  });
});

// ── Forgejo / Gitea default branch resolution ─────────────────────────────

describe('Forgejo with custom base URL (new — failing first)', () => {
  const FORGEJO_BASE = 'http://forgejo.local:3000/api/v1';
  const FORGEJO_REPO = 'myorg/myrepo';
  const mockHost = { getDefaultBranch: jest.fn() };

  beforeEach(() => {
    mockGetCurrentBranch.mockResolvedValue(null);
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'forgejo',
      baseUrl: FORGEJO_BASE,
      token: 'forgejo-token',
      host: mockHost,
      hostId: 'hid-forgejo',
      instanceBaseUrl: FORGEJO_BASE,
    });
  });

  it('FAILS: resolveBranch should route to Forgejo host, not GitHub API', async () => {
    // The current (broken) code: resolveActiveProvider() returns null for 'forgejo',
    // so resolveBranch() falls through to fetchGitHubDefaultBranch().
    // After the fix it should call host.getDefaultBranch() using the Forgejo base URL.
    mockHost.getDefaultBranch.mockResolvedValue('trunk');

    const branch = await resolveBranch(FORGEJO_REPO);

    // After fix: should return 'trunk' from Forgejo host, NOT 'main' (GitHub fallback).
    expect(branch).toBe('trunk');
    // Must NOT hit GitHub API.
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(GITHUB_API_BASE),
      expect.any(Object),
    );
  });

  it('FAILS: no GitHub API call even when Forgejo returns null', async () => {
    mockHost.getDefaultBranch.mockResolvedValue(null);
    fetchSpy.mockResolvedValue({ ok: false, status: 404 } as Response);

    const branch = await resolveBranch(FORGEJO_REPO);

    // After fix: should fall back to 'main' without hitting GitHub API.
    expect(branch).toBe('main');
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(GITHUB_API_BASE),
      expect.any(Object),
    );
  });
});

describe('Gitea with custom base URL (new — failing first)', () => {
  const GITEA_BASE = 'http://gitea.local:3000/api/v1';
  const GITEA_REPO = 'myuser/myrepo';
  const mockHost = { getDefaultBranch: jest.fn() };

  beforeEach(() => {
    mockGetCurrentBranch.mockResolvedValue(null);
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'gitea',
      baseUrl: GITEA_BASE,
      token: 'gitea-token',
      host: mockHost,
      hostId: 'hid-gitea',
      instanceBaseUrl: GITEA_BASE,
    });
  });

  it('FAILS: resolveBranch should route to Gitea host, not GitHub API', async () => {
    mockHost.getDefaultBranch.mockResolvedValue('devel');

    const branch = await resolveBranch(GITEA_REPO);

    // After fix: should return 'devel' from Gitea host.
    expect(branch).toBe('devel');
    expect(fetchSpy).not.toHaveBeenCalledWith(
      expect.stringContaining(GITHUB_API_BASE),
      expect.any(Object),
    );
  });
});

// ── Cache invalidation ─────────────────────────────────────────────────────

describe('Cache invalidation', () => {
  beforeEach(() => {
    mockGetCurrentBranch.mockResolvedValue('cached-branch');
    mockGetActiveGitHost.mockResolvedValue({
      provider: 'github',
      baseUrl: GITHUB_API_BASE,
      token: 'gh-token',
      host: {},
      hostId: 'hid1',
      instanceBaseUrl: null,
    });
  });

  it('returns cached value on repeated calls', async () => {
    const first = await resolveBranch('owner/repo');
    const second = await resolveBranch('owner/repo');

    expect(first).toBe('cached-branch');
    expect(second).toBe('cached-branch');
    expect(mockGetCurrentBranch).toHaveBeenCalledTimes(1);
  });

  it('forgetCache removes the cached entry', async () => {
    await resolveBranch('owner/repo'); // caches 'cached-branch'
    invalidateBranchCache('owner/repo');

    mockGetCurrentBranch.mockResolvedValue('new-branch');
    const branch = await resolveBranch('owner/repo');

    expect(branch).toBe('new-branch');
  });
});
