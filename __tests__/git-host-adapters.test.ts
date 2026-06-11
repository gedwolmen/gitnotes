import { Buffer } from 'buffer';
import { getAdapter, isGitHostKind } from '../src/services/git/hostAdapters';
import { parseRepoPathAt } from '../src/utils/gitPathParser';

describe('git host adapters', () => {
  describe('getAdapter', () => {
    test('returns the GitHub adapter for "github"', () => {
      const a = getAdapter('github');
      expect(a.kind).toBe('github');
      expect(a.displayName()).toBe('GitHub');
      expect(a.defaultBaseUrl()).toBe('https://github.com');
    });

    test('returns the Gitea adapter for "gitea"', () => {
      const a = getAdapter('gitea');
      expect(a.kind).toBe('gitea');
      expect(a.displayName()).toBe('Gitea');
      // Gitea has no canonical default — always self-hosted.
      expect(a.defaultBaseUrl()).toBe('');
    });

    test('throws on an unknown kind (TypeScript-exhaustive at runtime)', () => {
      // Cast through unknown to simulate a future kind that hasn't
      // been added to the factory yet.
      expect(() => getAdapter('bitbucket' as unknown as 'github')).toThrow(/No adapter/);
    });
  });

  describe('isGitHostKind', () => {
    test('accepts known kinds', () => {
      expect(isGitHostKind('github')).toBe(true);
      expect(isGitHostKind('gitea')).toBe(true);
      expect(isGitHostKind('gitlab')).toBe(true);
    });

    test('rejects unknown kinds', () => {
      expect(isGitHostKind('bitbucket')).toBe(false);
      expect(isGitHostKind('')).toBe(false);
    });
  });

  describe('GitHub adapter — remote URL', () => {
    test('builds the default GitHub.com URL when no baseUrl is provided', () => {
      const url = getAdapter('github').buildRemoteUrl({ owner: 'octocat', repo: 'hello' });
      expect(url).toBe('https://github.com/octocat/hello.git');
    });

    test('builds a self-hosted GitHub Enterprise URL when baseUrl is provided', () => {
      const url = getAdapter('github').buildRemoteUrl({
        baseUrl: 'https://github.acme.corp',
        owner: 'team',
        repo: 'notes',
      });
      expect(url).toBe('https://github.acme.corp/team/notes.git');
    });

    test('strips trailing slashes from baseUrl', () => {
      const url = getAdapter('github').buildRemoteUrl({
        baseUrl: 'https://github.acme.corp///',
        owner: 'team',
        repo: 'notes',
      });
      expect(url).toBe('https://github.acme.corp/team/notes.git');
    });
  });

  describe('GitHub adapter — Basic auth', () => {
    test('uses the x-access-token sentinel username', () => {
      const { username, password } = getAdapter('github').buildBasicAuth({ token: 'ghp_abc' });
      expect(username).toBe('x-access-token');
      expect(password).toBe('ghp_abc');
    });
  });

  describe('Gitea adapter — remote URL', () => {
    test('builds a self-hosted URL from the given baseUrl', () => {
      const url = getAdapter('gitea').buildRemoteUrl({
        baseUrl: 'https://gitea.example.com',
        owner: 'me',
        repo: 'notes',
      });
      expect(url).toBe('https://gitea.example.com/me/notes.git');
    });

    test('falls back to gitea.com when no baseUrl is provided (degenerate but defined)', () => {
      const url = getAdapter('gitea').buildRemoteUrl({ owner: 'me', repo: 'notes' });
      expect(url).toBe('https://gitea.com/me/notes.git');
    });

    test('strips trailing slashes from baseUrl', () => {
      const url = getAdapter('gitea').buildRemoteUrl({
        baseUrl: 'https://forgejo.example.org//',
        owner: 'me',
        repo: 'notes',
      });
      expect(url).toBe('https://forgejo.example.org/me/notes.git');
    });
  });

  describe('Gitea adapter — Basic auth', () => {
    test('uses the oauth2 username with the token as the password', () => {
      const { username, password } = getAdapter('gitea').buildBasicAuth({ token: 'gt_abc' });
      expect(username).toBe('oauth2');
      expect(password).toBe('gt_abc');
    });

    test('the encoded header decodes back to oauth2:<token>', () => {
      const { username, password } = getAdapter('gitea').buildBasicAuth({ token: 'gt_abc' });
      const decoded = Buffer.from(`${username}:${password}`).toString('base64');
      const back = Buffer.from(decoded, 'base64').toString('utf-8');
      expect(back).toBe('oauth2:gt_abc');
    });
  });
});

describe('parseRepoPathAt', () => {
  test('strips a github.com prefix on the default path', () => {
    expect(parseRepoPathAt('github.com/octocat/hello', undefined)).toEqual({
      owner: 'octocat',
      repo: 'hello',
    });
  });

  test('strips a self-hosted baseUrl when it matches', () => {
    expect(
      parseRepoPathAt('https://gitea.example.com/me/notes', 'https://gitea.example.com'),
    ).toEqual({ owner: 'me', repo: 'notes' });
  });

  test('strips a self-hosted baseUrl without scheme', () => {
    expect(parseRepoPathAt('gitea.example.com/me/notes', 'gitea.example.com')).toEqual({
      owner: 'me',
      repo: 'notes',
    });
  });

  test('returns null when the input has only one path segment', () => {
    expect(parseRepoPathAt('justonename', undefined)).toBeNull();
  });

  test('still works for plain owner/repo', () => {
    expect(parseRepoPathAt('octocat/hello', undefined)).toEqual({
      owner: 'octocat',
      repo: 'hello',
    });
  });
});
