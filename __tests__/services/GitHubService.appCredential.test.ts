/**
 * Regression test: GitHub App credential must not trigger GET /user.
 *
 * Issue: `GitHubService.initialize()` was unconditionally calling `fetchUser()`
 * (→ GET /api.github.com/user) when AsyncStorage lacked a cached user.
 * GitHub App installation tokens cannot access /user and receive:
 *   403 "Resource not accessible by integration"
 *
 * Fix: when the active host is backed by a stored GitHub App credential,
 * hydrate the in-memory GitHubUser from the stored App/HostConnection
 * profile instead of hitting the /user endpoint.
 *
 * PAT/OAuth initialization behavior (fetch /user when no cache) must remain unchanged.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import http from '@/services/http';
import AuthService from '@/services/AuthService';
import { AccountStorage } from '@/services/AccountStorage';
import type { HostConnection } from '@/services/AccountStorage';
import type { GitHubAppCredentialRecord } from '@/services/git/contracts';
import { GitHubService } from '@/services/GitHubService';

jest.mock('@/services/http');
jest.mock('@react-native-async-storage/async-storage');
jest.mock('@/services/AuthService');
jest.mock('@/services/AccountStorage');

const mockHttp = http as jest.Mocked<typeof http>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockAuthService = AuthService as jest.Mocked<typeof AuthService>;
const mockAccountStorage = AccountStorage as jest.Mocked<typeof AccountStorage>;

// Ensure `getToken` always returns null by default so tests that don't
// explicitly mock it cause `initialize()` to return early, preventing
// singleton state from leaking between tests.
mockAuthService.getToken.mockResolvedValue(null);

const USER_KEY = '@gitnotes:github_user';

function makeAppCredential(): GitHubAppCredentialRecord {
  return {
    id: 'app-cred-id-1',
    hostId: 'acc-123:github:github.com',
    kind: 'github_app',
    addedAt: Date.now(),
    installationId: 999999,
    appId: 123456,
    appSlug: 'gitnotes-test-app',
    accountLogin: 'test-org',
    accountId: 654321,
    accountAvatarUrl: 'https://avatars.githubusercontent.com/a/654321',
    selectedRepositories: [{ owner: 'test-org', repo: 'test-repo' }],
    token: 'ghs_app_installation_token',
    expiresAt: Date.now() + 3600 * 1000,
    renewal: {
      grantToken: 'grant_abc',
      grantExpiresAt: Date.now() + 86400 * 1000,
      backendUrl: 'https://gitnotes-backend.example.com',
    },
  };
}

function makeHostConnection(): HostConnection {
  return {
    id: 'acc-123:github:github.com',
    accountId: 'acc-123',
    provider: 'github',
    instanceBaseUrl: null,
    hostLogin: 'test-org',
    hostUserId: 654321,
    name: 'Test Org',
    email: 'test-org@example.com',
    avatarUrl: 'https://avatars.githubusercontent.com/a/654321',
    addedAt: Date.now(),
  };
}

function makePatToken(): string {
  return 'gho_pat_token_for_normal_flow';
}

/**
 * Clears the singleton state between tests without reaching into private fields.
 */
describe('GitHubService.initialize() — GitHub App credential', () => {
  beforeEach(async () => {
    // Clear call history but preserve mock implementations set up in this block.
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockHttp.request.mockReset();
    // Predictable defaults: no App credential, no cached user.
    mockAccountStorage.getActiveHostConnection.mockReturnValue(null);
    mockAccountStorage.getGitHubAppCredential.mockReturnValue(null);
    await GitHubService.clearToken();
  });

  it('must NOT call GET /user when active host has a stored GitHub App credential', async () => {
    const appCred = makeAppCredential();
    const hostConn = makeHostConnection();

    mockAuthService.getToken.mockResolvedValue(appCred.token);
    mockAccountStorage.getActiveHostConnection.mockResolvedValue(hostConn);
    mockAccountStorage.getGitHubAppCredential.mockResolvedValue(appCred);

    await GitHubService.initialize();

    // /user must never be requested (App tokens can't access it).
    const userRequests = mockHttp.request.mock.calls.filter(
      ([args]) => (args.url as string).includes('/user'),
    );
    expect(userRequests).toHaveLength(0);
  });

  it('must hydrate GitHubUser from stored App/HostConnection profile when no cache exists', async () => {
    const appCred = makeAppCredential();
    const hostConn = makeHostConnection();

    mockAuthService.getToken.mockResolvedValue(appCred.token);
    mockAccountStorage.getActiveHostConnection.mockResolvedValue(hostConn);
    mockAccountStorage.getGitHubAppCredential.mockResolvedValue(appCred);

    await GitHubService.initialize();

    const user = GitHubService.getUser();
    expect(user).not.toBeNull();
    expect(user!.login).toBe(appCred.accountLogin);
    expect(user!.id).toBe(appCred.accountId);
    expect(user!.avatar_url).toBe(appCred.accountAvatarUrl);
    expect(user!.name).toBe(hostConn.name);
    expect(user!.html_url).toBe(`https://github.com/apps/${appCred.appSlug}`);
    // hostConn.email is stored and available — use it.
    expect(user!.email).toBe(hostConn.email);
  });

  it('must cache the hydrated user in AsyncStorage so subsequent init skips /user', async () => {
    const appCred = makeAppCredential();
    const hostConn = makeHostConnection();

    mockAuthService.getToken.mockResolvedValue(appCred.token);
    mockAccountStorage.getActiveHostConnection.mockResolvedValue(hostConn);
    mockAccountStorage.getGitHubAppCredential.mockResolvedValue(appCred);
    mockAsyncStorage.getItem.mockResolvedValue(null);

    await GitHubService.initialize();

    expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
      USER_KEY,
      expect.any(String),
    );
  });

  it('must use cached user from AsyncStorage and skip both /user and App profile lookup', async () => {
    const cachedUser = {
      login: 'cached-user',
      id: 999,
      avatar_url: 'https://avatars.githubusercontent.com/u/999',
      html_url: 'https://github.com/cached-user',
      name: 'Cached User',
      email: 'cached@example.com',
    };
    mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(cachedUser));
    mockAuthService.getToken.mockResolvedValue(makePatToken());

    await GitHubService.initialize();

    // No HTTP requests — cache hit.
    expect(mockHttp.request).not.toHaveBeenCalled();
    expect(GitHubService.getUser()?.login).toBe('cached-user');
  });

  it('must still call /user for PAT/OAuth tokens when no cache exists', async () => {
    const patToken = makePatToken();

    mockAuthService.getToken.mockResolvedValue(patToken);
    mockAccountStorage.getActiveHostConnection.mockResolvedValue(null);
    mockAccountStorage.getGitHubAppCredential.mockResolvedValue(null);

    mockHttp.request.mockImplementation(async () => ({
      data: {
        login: 'pat-user',
        id: 111,
        avatar_url: 'https://avatars.githubusercontent.com/u/111',
        html_url: 'https://github.com/pat-user',
        name: 'PAT User',
        email: 'pat@example.com',
      },
      status: 200,
      headers: {},
    }));

    // Call initialize() so this.user is set from the /user response.
    await GitHubService.initialize();

    const userRequests = mockHttp.request.mock.calls.filter(
      ([args]) => (args.url as string).includes('/user'),
    );
    expect(userRequests).toHaveLength(1);
    expect(GitHubService.getUser()?.login).toBe('pat-user');
  });

  it('must handle absent avatarUrl in HostConnection gracefully (appAvatarUrl is primary)', async () => {
    const appCred = makeAppCredential();
    const hostConn = makeHostConnection();
    hostConn.avatarUrl = null;

    mockAuthService.getToken.mockResolvedValue(appCred.token);
    mockAccountStorage.getActiveHostConnection.mockResolvedValue(hostConn);
    mockAccountStorage.getGitHubAppCredential.mockResolvedValue(appCred);

    await GitHubService.initialize();

    // Falls back to appCred.accountAvatarUrl.
    expect(GitHubService.getUser()?.avatar_url).toBe(appCred.accountAvatarUrl);
  });
});
