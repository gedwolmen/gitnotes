jest.mock('../../src/services/http', () => ({
  __esModule: true,
  default: { request: jest.fn() },
  setAuthToken: jest.fn(),
  clearAuthToken: jest.fn(),
}));

jest.mock('../../src/services/AuthService', () => ({
  __esModule: true,
  default: {
    getToken: jest.fn(async () => null),
    setToken: jest.fn(async () => undefined),
    clearToken: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/stores/noteStore', () => ({
  useNoteStore: {
    getState: () => ({
      notes: [],
      createNote: jest.fn(),
      updateNote: jest.fn(),
      deleteNote: jest.fn(),
      getNoteById: jest.fn(),
    }),
  },
}));

jest.mock('../../src/stores/todoStore', () => ({
  useTodoStore: {
    getState: () => ({
      todos: [],
      createTodo: jest.fn(),
      updateTodo: jest.fn(),
      deleteTodo: jest.fn(),
    }),
  },
}));

// Only the slice of AI state that `executeToolCall` reads. Kept mutable via
// `__state` so tests can flip the GitHub-tools gate per case.
jest.mock('../../src/stores/aiStore', () => {
  const state = {
    githubToolsEnabled: false,
    chatRepoOwner: null as string | null,
    chatRepoName: null as string | null,
    chatRepoBranch: 'main',
    chatRepoAccountId: null as string | null,
  };
  return {
    useAIStore: { getState: () => state, __state: state },
  };
});

import { GitHubService, type GitHubRepository } from '../../src/services/GitHubService';
import http from '../../src/services/http';
import { executeToolCall } from '../../src/services/ai/actionExecutor';
import { buildSystemPrompt } from '../../src/services/ai/systemPrompt';
import {
  createIssueParameters,
  createPullRequestParameters,
  getPullRequestDiffParameters,
  listIssuesParameters,
  listPullRequestsParameters,
  listReposParameters,
  reviewPullRequestParameters,
} from '../../src/services/ai/tools';
import { useAIStore } from '../../src/stores/aiStore';

const mockHttpRequest = http.request as jest.Mock;

type AISlice = {
  githubToolsEnabled: boolean;
  chatRepoOwner: string | null;
  chatRepoName: string | null;
  chatRepoBranch: string;
  chatRepoAccountId: string | null;
};
type AIStoreMock = { getState: () => AISlice; __state: AISlice };
const aiSlice = (useAIStore as unknown as AIStoreMock).__state;

const testUser = {
  login: 'octocat',
  id: 1,
  avatar_url: '',
  html_url: '',
  name: 'Octocat',
  email: 'octocat@example.com',
};

const serverError = Object.assign(new Error('GitHub API error: 502'), { status: 502 });

describe('GitHubService agent-tool methods', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    aiSlice.githubToolsEnabled = false;
    await GitHubService.setToken('token', testUser);
  });

  afterEach(async () => {
    await GitHubService.clearToken();
    jest.restoreAllMocks();
  });

  describe('createIssue', () => {
    test('POSTs to the issues endpoint with the title in the body', async () => {
      mockHttpRequest.mockResolvedValueOnce({
        data: {
          id: 10,
          number: 42,
          title: 'Fix crash',
          body: 'Details',
          state: 'open',
          html_url: 'https://github.com/octo/notes/issues/42',
          milestone: null,
          labels: [],
          assignees: [],
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      });

      const result = await GitHubService.createIssue({
        owner: 'octo',
        repo: 'notes',
        title: 'Fix crash',
        body: 'Details',
      });

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/issues',
          method: 'POST',
          data: expect.objectContaining({ title: 'Fix crash' }),
        }),
      );
      expect(result?.number).toBe(42);
      expect(result?.html_url).toContain('octo/notes/issues/42');
    });

    test('returns null on a 5xx response', async () => {
      mockHttpRequest.mockRejectedValueOnce(serverError);
      const result = await GitHubService.createIssue({ owner: 'octo', repo: 'notes', title: 'T' });
      expect(result).toBeNull();
    });
  });

  describe('getIssues', () => {
    test('defaults to state=open in the request URL when state is omitted', async () => {
      mockHttpRequest.mockResolvedValueOnce({ data: [] });

      const issues = await GitHubService.getIssues('octo', 'notes');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/issues?state=open&per_page=50',
        }),
      );
      expect(issues).toEqual([]);
    });

    test('passes the requested state into the request URL', async () => {
      mockHttpRequest.mockResolvedValueOnce({
        data: [
          {
            id: 5,
            number: 5,
            title: 'Fixed crash',
            body: '',
            state: 'closed',
            html_url: 'https://github.com/octo/notes/issues/5',
            milestone: null,
            labels: [],
            assignees: [],
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      });

      const issues = await GitHubService.getIssues('octo', 'notes', 'closed');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/issues?state=closed&per_page=50',
        }),
      );
      expect(issues).toHaveLength(1);
      expect(issues[0]?.state).toBe('closed');
    });

    test('passes state=all into the request URL', async () => {
      mockHttpRequest.mockResolvedValueOnce({ data: [] });

      await GitHubService.getIssues('octo', 'notes', 'all');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining('state=all'),
        }),
      );
    });
  });

  describe('getPullRequests', () => {
    test('defaults to state=open in the request URL when state is omitted', async () => {
      mockHttpRequest.mockResolvedValueOnce({ data: [] });

      await GitHubService.getPullRequests('octo', 'notes');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/pulls?state=open&per_page=50',
        }),
      );
    });

    test('passes the requested state into the request URL', async () => {
      mockHttpRequest.mockResolvedValueOnce({ data: [] });

      await GitHubService.getPullRequests('octo', 'notes', 'closed');

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/pulls?state=closed&per_page=50',
        }),
      );
    });
  });

  describe('getPullRequestDiff', () => {
    test('maps the files endpoint response into a diff shape', async () => {
      mockHttpRequest.mockResolvedValueOnce({
        data: [
          { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@' },
          { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0 },
        ],
      });

      const diff = await GitHubService.getPullRequestDiff('octo', 'notes', 42);

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/pulls/42/files',
        }),
      );
      expect(diff).toEqual({
        files: [
          { filename: 'src/a.ts', status: 'modified', additions: 3, deletions: 1, patch: '@@' },
          { filename: 'src/b.ts', status: 'added', additions: 10, deletions: 0, patch: undefined },
        ],
      });
    });

    test('returns null when the files endpoint returns a non-array', async () => {
      mockHttpRequest.mockResolvedValueOnce({ data: { message: 'Not Found' } });
      const diff = await GitHubService.getPullRequestDiff('octo', 'notes', 42);
      expect(diff).toBeNull();
    });

    test('returns null on a 5xx response', async () => {
      mockHttpRequest.mockRejectedValueOnce(serverError);
      const diff = await GitHubService.getPullRequestDiff('octo', 'notes', 42);
      expect(diff).toBeNull();
    });
  });

  describe('reviewPullRequest', () => {
    test('POSTs body and event to the reviews endpoint', async () => {
      mockHttpRequest.mockResolvedValueOnce({
        data: {
          id: 99,
          user: { login: 'octocat' },
          body: 'Looks good',
          state: 'APPROVED',
          submitted_at: '2026-01-01T00:00:00Z',
          html_url: 'https://github.com/octo/notes/pull/42#review-99',
        },
      });

      const review = await GitHubService.reviewPullRequest({
        owner: 'octo',
        repo: 'notes',
        pull_number: 42,
        body: 'Looks good',
        event: 'APPROVE',
      });

      expect(mockHttpRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://api.github.com/repos/octo/notes/pulls/42/reviews',
          method: 'POST',
          data: { body: 'Looks good', event: 'APPROVE' },
        }),
      );
      expect(review?.id).toBe(99);
      expect(review?.state).toBe('APPROVED');
    });

    test('returns null on a 5xx response', async () => {
      mockHttpRequest.mockRejectedValueOnce(serverError);
      const review = await GitHubService.reviewPullRequest({
        owner: 'octo',
        repo: 'notes',
        pull_number: 42,
        body: 'b',
        event: 'COMMENT',
      });
      expect(review).toBeNull();
    });
  });
});

describe('GitHub tool Zod schemas', () => {
  test('listReposParameters accepts an empty object and rejects non-object input', () => {
    expect(listReposParameters.parse({})).toEqual({});
    expect(() => listReposParameters.parse(null)).toThrow();
  });

  test('listIssuesParameters requires owner and repo and constrains state', () => {
    expect(() =>
      listIssuesParameters.parse({ owner: 'a', repo: 'b', state: 'open' }),
    ).not.toThrow();
    expect(() => listIssuesParameters.parse({ owner: 'a' })).toThrow();
    expect(() =>
      listIssuesParameters.parse({ owner: 'a', repo: 'b', state: 'bogus' }),
    ).toThrow();
  });

  test('createIssueParameters requires owner, repo, title', () => {
    expect(() =>
      createIssueParameters.parse({ owner: 'a', repo: 'b', title: 'T' }),
    ).not.toThrow();
    expect(() => createIssueParameters.parse({ owner: 'a', repo: 'b' })).toThrow();
  });

  test('listPullRequestsParameters requires owner and repo and constrains state', () => {
    expect(() =>
      listPullRequestsParameters.parse({ owner: 'a', repo: 'b', state: 'closed' }),
    ).not.toThrow();
    expect(() => listPullRequestsParameters.parse({ owner: 'a' })).toThrow();
    expect(() =>
      listPullRequestsParameters.parse({ owner: 'a', repo: 'b', state: 'merged' }),
    ).toThrow();
  });

  test('createPullRequestParameters requires owner, repo, title, head, base', () => {
    expect(() =>
      createPullRequestParameters.parse({ owner: 'a', repo: 'b', title: 'T', head: 'h', base: 'main' }),
    ).not.toThrow();
    expect(() =>
      createPullRequestParameters.parse({ owner: 'a', repo: 'b', title: 'T', base: 'main' }),
    ).toThrow();
  });

  test('getPullRequestDiffParameters requires a numeric pull_number', () => {
    expect(() =>
      getPullRequestDiffParameters.parse({ owner: 'a', repo: 'b', pull_number: 7 }),
    ).not.toThrow();
    expect(() =>
      getPullRequestDiffParameters.parse({ owner: 'a', repo: 'b', pull_number: '7' }),
    ).toThrow();
  });

  test('reviewPullRequestParameters requires body and a known event', () => {
    expect(() =>
      reviewPullRequestParameters.parse({
        owner: 'a',
        repo: 'b',
        pull_number: 7,
        body: 'ok',
        event: 'APPROVE',
      }),
    ).not.toThrow();
    expect(() =>
      reviewPullRequestParameters.parse({ owner: 'a', repo: 'b', pull_number: 7, body: 'ok' }),
    ).toThrow();
    expect(() =>
      reviewPullRequestParameters.parse({
        owner: 'a',
        repo: 'b',
        pull_number: 7,
        body: 'ok',
        event: 'MERGE',
      }),
    ).toThrow();
  });
});

describe('executeToolCall - GitHub tools gate', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  test('rejects GitHub tools when githubToolsEnabled is false', async () => {
    aiSlice.githubToolsEnabled = false;
    const result = await executeToolCall('list_repos', {}, 'auto');
    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.error).toMatch(/GitHub tools are disabled/);
  });
});

describe('executeToolCall - GitHub tools enabled', () => {
  beforeEach(() => {
    aiSlice.githubToolsEnabled = true;
  });

  afterEach(() => {
    aiSlice.githubToolsEnabled = false;
    jest.restoreAllMocks();
  });

  test('create_issue in confirm mode returns proposed changes without calling the service', async () => {
    const createIssueSpy = jest.spyOn(GitHubService, 'createIssue');

    const result = await executeToolCall(
      'create_issue',
      { owner: 'octo', repo: 'notes', title: 'Ship feature', body: 'Details here' },
      'confirm',
    );

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
    expect(result.proposedChanges).toEqual({
      type: 'create_issue',
      description: 'Create issue "Ship feature" in octo/notes',
      details: { owner: 'octo', repo: 'notes', title: 'Ship feature', body: 'Details here' },
    });
    expect(createIssueSpy).not.toHaveBeenCalled();
  });

  test('list_repos maps repositories into the agent result shape', async () => {
    // The GitHub API returns `description: null` for repos without one; the
    // typed interface narrows it to `string`, so the fixture casts explicitly.
    const repos = [
      {
        id: 1,
        name: 'b',
        full_name: 'a/b',
        owner: { login: 'a' },
        html_url: 'https://github.com/a/b',
        description: null,
        private: false,
      },
    ] as unknown as GitHubRepository[];
    const getRepositoriesSpy = jest
      .spyOn(GitHubService, 'getRepositories')
      .mockResolvedValue(repos);

    const result = await executeToolCall('list_repos', {}, 'auto');

    expect(getRepositoriesSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.data).toEqual([
      {
        id: 1,
        name: 'a/b',
        private: false,
        description: null,
        url: 'https://github.com/a/b',
      },
    ]);
  });

  test('list_issues passes a valid state through to the service', async () => {
    const getIssuesSpy = jest.spyOn(GitHubService, 'getIssues').mockResolvedValue([]);

    const result = await executeToolCall(
      'list_issues',
      { owner: 'octo', repo: 'notes', state: 'closed' },
      'auto',
    );

    expect(getIssuesSpy).toHaveBeenCalledWith('octo', 'notes', 'closed');
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.data).toEqual([]);
  });

  test('list_issues defaults to open when state is omitted', async () => {
    const getIssuesSpy = jest.spyOn(GitHubService, 'getIssues').mockResolvedValue([]);

    const result = await executeToolCall('list_issues', { owner: 'octo', repo: 'notes' }, 'auto');

    expect(getIssuesSpy).toHaveBeenCalledWith('octo', 'notes', 'open');
    expect(result.success).toBe(true);
  });

  test('list_issues rejects an invalid state without calling the service', async () => {
    const getIssuesSpy = jest.spyOn(GitHubService, 'getIssues');

    const result = await executeToolCall(
      'list_issues',
      { owner: 'octo', repo: 'notes', state: 'bogus' },
      'auto',
    );

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.error).toMatch(/Invalid 'state'/);
    expect(getIssuesSpy).not.toHaveBeenCalled();
  });

  test('list_pull_requests passes a valid state through to the service', async () => {
    const getPullRequestsSpy = jest
      .spyOn(GitHubService, 'getPullRequests')
      .mockResolvedValue([]);

    const result = await executeToolCall(
      'list_pull_requests',
      { owner: 'octo', repo: 'notes', state: 'all' },
      'auto',
    );

    expect(getPullRequestsSpy).toHaveBeenCalledWith('octo', 'notes', 'all');
    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(false);
  });

  test('list_pull_requests rejects an invalid state without calling the service', async () => {
    const getPullRequestsSpy = jest.spyOn(GitHubService, 'getPullRequests');

    const result = await executeToolCall(
      'list_pull_requests',
      { owner: 'octo', repo: 'notes', state: 'merged' },
      'auto',
    );

    expect(result.success).toBe(false);
    expect(result.requiresConfirmation).toBe(false);
    expect(result.error).toMatch(/Invalid 'state'/);
    expect(getPullRequestsSpy).not.toHaveBeenCalled();
  });
});

describe('buildSystemPrompt - GitHub tools section', () => {
  const baseContext = { noteCount: 0, todoCount: 0, actionMode: 'auto' as const };

  test('includes the GitHub tool list and account login when enabled', () => {
    const prompt = buildSystemPrompt({
      ...baseContext,
      githubToolsEnabled: true,
      githubAccountLogin: 'octocat',
    });

    expect(prompt).toContain('list_repos');
    expect(prompt).toContain('get_pull_request_diff');
    expect(prompt).toContain('review_pull_request');
    expect(prompt).toContain('@octocat');
  });

  test('omits the GitHub tool list when disabled', () => {
    const prompt = buildSystemPrompt({ ...baseContext, githubToolsEnabled: false });

    expect(prompt).not.toContain('list_repos');
    expect(prompt).not.toContain('GitHub Tools');
  });
});
