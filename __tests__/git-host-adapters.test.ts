import { Buffer } from 'buffer';
import { getAdapter, isGitHostKind, isSupportedGitHostKind } from '../src/services/git/hostAdapters';
import { setActiveGitHostKind, getActiveGitHostKind } from '../src/services/git/gitHttp';
import { ensureToken } from '../src/services/git/GitFsService';
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

    test('returns the GitLab adapter for "gitlab"', () => {
      const a = getAdapter('gitlab');
      expect(a.kind).toBe('gitlab');
      expect(a.displayName()).toBe('GitLab');
      // GitLab has no canonical default — always self-hosted.
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

  describe('GitLab adapter — remote URL', () => {
    test('builds a self-hosted URL from the given baseUrl (no encoding on the clone URL)', () => {
      const url = getAdapter('gitlab').buildRemoteUrl({
        baseUrl: 'https://gitlab.example.com',
        owner: 'my-group',
        repo: 'my-project',
      });
      // GitLab's git smart-http transport handles the path verbatim;
      // percent-encoding is the REST API's concern, not ours.
      expect(url).toBe('https://gitlab.example.com/my-group/my-project.git');
    });

    test('builds a nested-namespace URL (group/subgroup/project)', () => {
      const url = getAdapter('gitlab').buildRemoteUrl({
        baseUrl: 'https://gitlab.example.com',
        owner: 'my-group/my-subgroup',
        repo: 'my-project',
      });
      expect(url).toBe('https://gitlab.example.com/my-group/my-subgroup/my-project.git');
    });

    test('strips trailing slashes from baseUrl', () => {
      const url = getAdapter('gitlab').buildRemoteUrl({
        baseUrl: 'https://gitlab.example.org//',
        owner: 'me',
        repo: 'notes',
      });
      expect(url).toBe('https://gitlab.example.org/me/notes.git');
    });

    test('without baseUrl returns an obviously-bogus URL (caller must provide one)', () => {
      const url = getAdapter('gitlab').buildRemoteUrl({ owner: 'me', repo: 'notes' });
      // We do NOT silently default to gitlab.com; that's not a
      // canonical GitLab instance. The .invalid TLD per RFC 2606
      // makes a misconfigured call fail loudly at the network layer
      // rather than cloning from the wrong host.
      expect(url).toBe('https://gitlab.example.invalid/me/notes.git');
    });
  });

  describe('GitLab adapter — Basic auth', () => {
    test('uses the empty-string username with the PAT as the password', () => {
      const { username, password } = getAdapter('gitlab').buildBasicAuth({ token: 'glpat_abc' });
      expect(username).toBe('');
      expect(password).toBe('glpat_abc');
    });

    test('the encoded header decodes back to ":<token>" (no user prefix)', () => {
      const { username, password } = getAdapter('gitlab').buildBasicAuth({ token: 'glpat_abc' });
      const decoded = Buffer.from(`${username}:${password}`).toString('base64');
      const back = Buffer.from(decoded, 'base64').toString('utf-8');
      // The leading empty username + colon is the GitLab convention
      // that makes a "just a token" Basic header unambiguous in
      // network captures.
      expect(back).toBe(':glpat_abc');
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

/**
 * Integration test for the actual auth chain that reaches the wire:
 *
 *   1. `setActiveGitHostKind('gitea')` mirrors what `GitFsService`
 *      does right before every clone / fetch / push.
 *   2. `ensureToken(token)` reads the active host and returns the
 *      host-correct `{ username, password }` pair for the
 *      `onAuth` callback.
 *   3. isomorphic-git then base64-encodes that pair into the
 *      `Authorization: Basic <b64>` header (see
 *      `calculateBasicAuthHeader` in isomorphic-git's source).
 *
 * This test asserts the decoded credential pair, not just the
 * username literal, because the failure mode we want to catch is
 * "wrong username for this host" — a Gitea server will reject
 * `x-access-token:tok` even though `tok` itself is a valid Gitea
 * PAT. (Earlier in this PR, the host-adapter abstraction was wired
 * incorrectly: `applyAuth` inside the HttpClient was dead code, and
 * `ensureToken` hardcoded the GitHub username. This test would
 * have caught it.)
 */
describe('ensureToken — host-correct Basic auth credentials', () => {
  test('returns undefined when no token is provided (no auth attempted)', () => {
    setActiveGitHostKind('github');
    expect(ensureToken(undefined)).toBeUndefined();
    setActiveGitHostKind('gitea');
    expect(ensureToken(undefined)).toBeUndefined();
  });

  test('GitHub active host → x-access-token:<token>', () => {
    setActiveGitHostKind('github');
    const onAuth = ensureToken('ghp_abc');
    expect(onAuth).toBeDefined();
    const creds = onAuth!('https://github.com/octocat/hello.git', {
      username: '',
      password: '',
    });
    expect(creds).toEqual({ username: 'x-access-token', password: 'ghp_abc' });
    // The wire form that isomorphic-git will encode:
    expect(`Basic ${Buffer.from('x-access-token:ghp_abc').toString('base64')}`).toBe(
      `Basic ${Buffer.from(`${creds!.username}:${creds!.password}`).toString('base64')}`,
    );
  });

  test('Gitea active host → oauth2:<token> (regression test for phase-1 bug)', () => {
    setActiveGitHostKind('gitea');
    const onAuth = ensureToken('gt_abc');
    expect(onAuth).toBeDefined();
    const creds = onAuth!('https://gitea.example.com/me/notes.git', {
      username: '',
      password: '',
    });
    // The bug the phase-1 commit accidentally shipped was
    // `x-access-token` regardless of host. This assertion fails
    // loudly if anyone reverts `ensureToken` to a hardcoded
    // username.
    expect(creds).toEqual({ username: 'oauth2', password: 'gt_abc' });
    // Cross-check with the adapter directly so the test fails
    // with a meaningful message if either side drifts.
    expect(getAdapter('gitea').buildBasicAuth({ token: 'gt_abc' })).toEqual({
      username: 'oauth2',
      password: 'gt_abc',
    });
  });

  test('GitLab active host → :<token> (empty username + PAT password)', () => {
    setActiveGitHostKind('gitlab');
    const onAuth = ensureToken('glpat_abc');
    expect(onAuth).toBeDefined();
    const creds = onAuth!('https://gitlab.example.com/group/project.git', {
      username: '',
      password: '',
    });
    expect(creds).toEqual({ username: '', password: 'glpat_abc' });
    expect(getAdapter('gitlab').buildBasicAuth({ token: 'glpat_abc' })).toEqual({
      username: '',
      password: 'glpat_abc',
    });
  });

  test('host context is module-level — last setActiveGitHostKind wins', () => {
    setActiveGitHostKind('github');
    expect(getActiveGitHostKind()).toBe('github');
    setActiveGitHostKind('gitea');
    expect(getActiveGitHostKind()).toBe('gitea');
    // And ensureToken follows the most recent set.
    const creds = ensureToken('tok')!('https://example.com/o/r.git', {
      username: '',
      password: '',
    });
    expect(creds.username).toBe('oauth2');
  });
});
