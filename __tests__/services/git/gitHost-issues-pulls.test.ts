import { GitHubHostService } from '../../../src/services/git/GitHubHostService';
import { GitLabService } from '../../../src/services/git/GitLabService';
import { GiteaLikeHostService } from '../../../src/services/git/GiteaLikeHostService';

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const mockGitHubGetPullRequests = jest.fn();
const mockGitHubGetIssues = jest.fn();

jest.mock('../../../src/services/GitHubService', () => {
  return {
    GitHubService: {
      getPullRequests: (...args: unknown[]) => mockGitHubGetPullRequests(...args),
      getIssues: (...args: unknown[]) => mockGitHubGetIssues(...args),
    },
    GitHubServiceStatic: {
      rawGet: jest.fn(async () => null),
      getRepoMeta: jest.fn(async () => null),
    },
  };
});

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
  mockGitHubGetPullRequests.mockReset();
  mockGitHubGetIssues.mockReset();
});

function primeAuthAndEndpoint(userBody: unknown, endpointBody: unknown, endpointStatus = 200): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse(userBody))
    .mockResolvedValueOnce(jsonResponse(endpointBody, endpointStatus));
}

describe('GitHubHostService listPullRequests/listIssues', () => {
  it('normalizes pull requests from GitHubService.getPullRequests', async () => {
    mockGitHubGetPullRequests.mockResolvedValueOnce([
      {
        id: 101,
        number: 7,
        title: 'Add hub',
        state: 'open',
        html_url: 'https://github.com/o/r/pull/7',
        user: { login: 'octocat' },
        draft: false,
        created_at: '2026-01-01T00:00:00Z',
      },
    ]);
    const svc = new GitHubHostService();
    const prs = await svc.listPullRequests('o', 'r', 'open');
    expect(mockGitHubGetPullRequests).toHaveBeenCalledWith('o', 'r', 'open');
    expect(prs).toEqual([
      {
        id: 101,
        number: 7,
        title: 'Add hub',
        state: 'open',
        webUrl: 'https://github.com/o/r/pull/7',
        headBranch: '',
        baseBranch: '',
        author: 'octocat',
        draft: false,
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
  });

  it('maps closed GitHub PR state and normalizes issues (labels flatten, author from user)', async () => {
    mockGitHubGetPullRequests.mockResolvedValueOnce([
      {
        id: 102,
        number: 8,
        title: 'Merged PR',
        state: 'closed',
        html_url: 'https://github.com/o/r/pull/8',
        user: { login: 'octocat' },
        draft: true,
        created_at: '2026-01-02T00:00:00Z',
      },
    ]);
    mockGitHubGetIssues.mockResolvedValueOnce([
      {
        id: 201,
        number: 9,
        title: 'Bug',
        body: '',
        state: 'open',
        html_url: 'https://github.com/o/r/issues/9',
        labels: [
          { name: 'bug', color: 'e11' },
          { name: 'p1', color: 'f00' },
        ],
        user: { login: 'reporter' },
        created_at: '2026-01-03T00:00:00Z',
        updated_at: '2026-01-04T00:00:00Z',
      },
    ]);
    const svc = new GitHubHostService();

    const prs = await svc.listPullRequests('o', 'r', 'closed');
    expect(prs[0].state).toBe('closed');
    expect(prs[0].draft).toBe(true);

    const issues = await svc.listIssues('o', 'r', 'open');
    expect(mockGitHubGetIssues).toHaveBeenCalledWith('o', 'r', 'open');
    expect(issues).toEqual([
      {
        id: 201,
        number: 9,
        title: 'Bug',
        state: 'open',
        webUrl: 'https://github.com/o/r/issues/9',
        labels: ['bug', 'p1'],
        author: 'reporter',
        createdAt: '2026-01-03T00:00:00Z',
        updatedAt: '2026-01-04T00:00:00Z',
      },
    ]);
  });

  it('returns [] when GitHubService reports no items (error path swallows into [])', async () => {
    mockGitHubGetPullRequests.mockResolvedValueOnce([]);
    mockGitHubGetIssues.mockResolvedValueOnce([]);
    const svc = new GitHubHostService();
    expect(await svc.listPullRequests('o', 'r')).toEqual([]);
    expect(await svc.listIssues('o', 'r')).toEqual([]);
  });
});

describe('GitLabService listPullRequests/listIssues', () => {
  async function authed(): Promise<GitLabService> {
    const svc = new GitLabService();
    await svc.setToken('glpat-abc');
    return svc;
  }

  it('listPullRequests hits merge_requests with PRIVATE-TOKEN and maps opened->open', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = await authed();
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          iid: 42,
          title: 'Fix sync',
          state: 'opened',
          web_url: 'https://gitlab.com/o/r/-/merge_requests/42',
          source_branch: 'feat/x',
          target_branch: 'main',
          draft: false,
          author: { username: 'alice' },
          created_at: '2026-02-01T00:00:00Z',
        },
      ]),
    );

    const prs = await svc.listPullRequests('o', 'r', 'open');

    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://gitlab.com/api/v4/projects/o%2Fr/merge_requests?state=opened&per_page=50',
      expect.objectContaining({
        headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'glpat-abc' }),
      }),
    );
    expect(prs).toEqual([
      {
        id: 42,
        number: 42,
        title: 'Fix sync',
        state: 'open',
        webUrl: 'https://gitlab.com/o/r/-/merge_requests/42',
        headBranch: 'feat/x',
        baseBranch: 'main',
        author: 'alice',
        draft: false,
        createdAt: '2026-02-01T00:00:00Z',
      },
    ]);
  });

  it('listPullRequests maps merged MRs to closed and requests state=closed', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = await authed();
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          iid: 43,
          title: 'Merged MR',
          state: 'merged',
          web_url: 'https://gitlab.com/o/r/-/merge_requests/43',
          source_branch: 'feat/y',
          target_branch: 'main',
          author: { username: 'bob' },
          created_at: '2026-02-02T00:00:00Z',
        },
      ]),
    );

    const prs = await svc.listPullRequests('o', 'r', 'closed');

    expect(mockFetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/merge_requests?state=closed&per_page=50'),
      expect.any(Object),
    );
    expect(prs[0].state).toBe('closed');
  });

  it('listIssues maps iid/web_url/labels and requests state=opened', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, username: 'me', name: 'Me' }));
    const svc = await authed();
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          iid: 11,
          title: 'Crash on open',
          state: 'opened',
          web_url: 'https://gitlab.com/o/r/-/issues/11',
          labels: ['bug', 'p1'],
          author: { username: 'carol' },
          created_at: '2026-02-03T00:00:00Z',
          updated_at: '2026-02-04T00:00:00Z',
        },
      ]),
    );

    const issues = await svc.listIssues('o', 'r', 'open');

    expect(mockFetch).toHaveBeenLastCalledWith(
      'https://gitlab.com/api/v4/projects/o%2Fr/issues?state=opened&per_page=50',
      expect.any(Object),
    );
    expect(issues).toEqual([
      {
        id: 11,
        number: 11,
        title: 'Crash on open',
        state: 'open',
        webUrl: 'https://gitlab.com/o/r/-/issues/11',
        labels: ['bug', 'p1'],
        author: 'carol',
        createdAt: '2026-02-03T00:00:00Z',
        updatedAt: '2026-02-04T00:00:00Z',
      },
    ]);
  });

  it('returns [] on auth failure (no token) and on HTTP error', async () => {
    const unauthed = new GitLabService();
    expect(await unauthed.listPullRequests('o', 'r')).toEqual([]);
    expect(await unauthed.listIssues('o', 'r')).toEqual([]);

    primeAuthAndEndpoint({ id: 1, username: 'me', name: 'Me' }, { message: 'denied' }, 403);
    const svc = await authed();
    expect(await svc.listPullRequests('o', 'r')).toEqual([]);

    primeAuthAndEndpoint({ id: 1, username: 'me', name: 'Me' }, { message: 'denied' }, 403);
    expect(await svc.listIssues('o', 'r')).toEqual([]);
  });
});

describe.each([
  ['gitea', 'https://gitea.com/api/v1'],
  ['forgejo', 'https://codeberg.org/api/v1'],
] as const)('%s listPullRequests/listIssues', (provider, baseUrl) => {
  async function authed(): Promise<GiteaLikeHostService> {
    const svc = new GiteaLikeHostService(provider, baseUrl);
    await svc.setToken(`${provider}-tok`);
    return svc;
  }

  it('listPullRequests maps head/base refs and sends token auth', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }));
    const svc = await authed();
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          number: 5,
          title: 'Gitea PR',
          state: 'open',
          html_url: `https://${provider}.example/o/r/pulls/5`,
          head: { ref: 'feat/g' },
          base: { ref: 'main' },
          user: { login: 'dave' },
          draft: false,
          created_at: '2026-03-01T00:00:00Z',
        },
      ]),
    );

    const prs = await svc.listPullRequests('o', 'r', 'open');

    expect(mockFetch).toHaveBeenLastCalledWith(
      `${baseUrl}/repos/o/r/pulls?state=open&limit=50`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `token ${provider}-tok` }),
      }),
    );
    expect(prs).toEqual([
      expect.objectContaining({
        number: 5,
        title: 'Gitea PR',
        state: 'open',
        headBranch: 'feat/g',
        baseBranch: 'main',
        author: 'dave',
      }),
    ]);
  });

  it('listIssues filters out items carrying a pull_request payload', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: 1, login: 'me', full_name: 'Me' }));
    const svc = await authed();
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        {
          number: 21,
          title: 'Real issue',
          state: 'open',
          html_url: 'https://host/o/r/issues/21',
          labels: [
            { id: 1, name: 'bug' },
            { id: 2, name: 'triage' },
          ],
          user: { login: 'erin' },
          created_at: '2026-03-02T00:00:00Z',
          updated_at: '2026-03-03T00:00:00Z',
        },
        {
          number: 22,
          title: 'PR masquerading as issue',
          state: 'open',
          html_url: 'https://host/o/r/pulls/22',
          labels: [],
          user: { login: 'erin' },
          created_at: '2026-03-02T00:00:00Z',
          pull_request: { url: 'https://host/api/v1/repos/o/r/pulls/22' },
        },
      ]),
    );

    const issues = await svc.listIssues('o', 'r', 'open');

    expect(mockFetch).toHaveBeenLastCalledWith(
      `${baseUrl}/repos/o/r/issues?state=open&type=issues&limit=50`,
      expect.any(Object),
    );
    expect(issues).toEqual([
      {
        id: 21,
        number: 21,
        title: 'Real issue',
        state: 'open',
        webUrl: 'https://host/o/r/issues/21',
        labels: ['bug', 'triage'],
        author: 'erin',
        createdAt: '2026-03-02T00:00:00Z',
        updatedAt: '2026-03-03T00:00:00Z',
      },
    ]);
  });

  it('returns [] on HTTP error and when unauthenticated', async () => {
    const unauthed = new GiteaLikeHostService(provider, baseUrl);
    expect(await unauthed.listPullRequests('o', 'r')).toEqual([]);
    expect(await unauthed.listIssues('o', 'r')).toEqual([]);

    primeAuthAndEndpoint({ id: 1, login: 'me', full_name: 'Me' }, { message: 'denied' }, 403);
    const svc = await authed();
    expect(await svc.listPullRequests('o', 'r')).toEqual([]);
    expect(await svc.listIssues('o', 'r')).toEqual([]);
  });
});
