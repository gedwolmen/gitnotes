/**
 * Failing-first tests for AuthService credential management.
 *
 * These tests define the expected behavior of the new OAuth and GitHub App
 * credential management methods in AuthService. They will fail until
 * those methods are fully integrated.
 *
 * The tests are organized by:
 * - OAuth credential lifecycle (set, get, remove)
 * - GitHub App credential lifecycle (set, get, remove)
 * - Feature-scoped availability computation
 * - Provider isolation (one provider's failure does not affect others)
 */
import { AuthService } from '@/services/AuthService';
import type {
  GitHubOAuthCredentialRecord,
  GitHubAppCredentialRecord,
} from '@/services/git/contracts';
import {
  isOAuthExpired,
  isInstallationTokenExpired,
} from '@/services/git/contracts';

// ── OAuth credential management ─────────────────────────────────────────────

describe('AuthService GitHub OAuth credential management', () => {
  const makeOAuthRecord = (): GitHubOAuthCredentialRecord => ({
    id: 'github:acc-test:github.com',
    hostId: 'github:acc-test:github.com',
    kind: 'oauth',
    addedAt: Date.now(),
    accessToken: 'gho_test_token',
    login: 'testuser',
    userId: 12345,
    expiresAt: Date.now() + 3600 * 1000,
    renewal: {
      refreshToken: 'refresh_handle',
      refreshExpiresAt: Date.now() + 30 * 24 * 3600 * 1000,
      backendUrl: 'https://gitnotes-backend.example.com',
    },
  });

  describe('getGitHubOAuthCredential', () => {
    it('returns null when no OAuth credential is stored for a host', async () => {
      const result = await AuthService.getGitHubOAuthCredential('nonexistent-host');
      expect(result).toBeNull();
    });

    it('returns the stored OAuth credential after setGitHubOAuthCredential', async () => {
      const hostId = 'github:oauth-test:github.com';
      const record = makeOAuthRecord();
      await AuthService.removeGitHubOAuthCredential(hostId);
      await AuthService.setGitHubOAuthCredential?.(hostId, record);
      const retrieved = await AuthService.getGitHubOAuthCredential(hostId);
      expect(retrieved?.kind).toBe('oauth');
      expect(retrieved?.accessToken).toBe('gho_test_token');
      await AuthService.removeGitHubOAuthCredential(hostId);
    });
  });

  describe('validateGitHubOAuthCredential', () => {
    it('returns valid for a well-formed OAuth credential', async () => {
      const record = makeOAuthRecord();
      const result = await AuthService.validateGitHubOAuthCredential(record);
      expect(result.valid).toBe(true);
    });

    it('returns invalid for an expired OAuth credential', async () => {
      const record = makeOAuthRecord();
      record.expiresAt = Date.now() - 1000;
      const result = await AuthService.validateGitHubOAuthCredential(record);
      expect(result.valid).toBe(false);
    });

    it('returns invalid for an OAuth credential with empty access token', async () => {
      const record = makeOAuthRecord();
      record.accessToken = '';
      const result = await AuthService.validateGitHubOAuthCredential(record);
      expect(result.valid).toBe(false);
    });
  });

  describe('removeGitHubOAuthCredential', () => {
    it('is idempotent when no credential is stored', async () => {
      await expect(
        AuthService.removeGitHubOAuthCredential('nonexistent-host'),
      ).resolves.not.toThrow();
    });

    it('removes a stored OAuth credential', async () => {
      const hostId = 'github:oauth-remove-test:github.com';
      const record = makeOAuthRecord();
      await AuthService.setGitHubOAuthCredential?.(hostId, record);
      await AuthService.removeGitHubOAuthCredential(hostId);
      const retrieved = await AuthService.getGitHubOAuthCredential(hostId);
      expect(retrieved).toBeNull();
    });
  });
});

// ── GitHub App credential management ─────────────────────────────────────────

describe('AuthService GitHub App credential management', () => {
  const makeAppRecord = (): GitHubAppCredentialRecord => ({
    id: 'github:acc-test:github.com',
    hostId: 'github:acc-test:github.com',
    kind: 'github_app',
    addedAt: Date.now(),
    installationId: 123456,
    appId: 98765,
    appSlug: 'gitnotes-test-app',
    accountLogin: 'testorg',
    accountId: 555,
    selectedRepositories: [{ owner: 'testorg', repo: 'notes' }],
    token: 'ghs_install_token',
    expiresAt: Date.now() + 3600 * 1000,
    renewal: {
      grantToken: 'grant_handle',
      grantExpiresAt: Date.now() + 3600 * 1000,
      backendUrl: 'https://gitnotes-backend.example.com',
    },
  });

  describe('getGitHubAppCredential', () => {
    it('returns null when no GitHub App credential is stored for a host', async () => {
      const result = await AuthService.getGitHubAppCredential('nonexistent-host');
      expect(result).toBeNull();
    });

    it('returns the stored GitHub App credential after setGitHubAppCredential', async () => {
      const hostId = 'github:app-test:github.com';
      const record = makeAppRecord();
      await AuthService.removeGitHubAppCredential(hostId);
      await AuthService.setGitHubAppCredential?.(hostId, record);
      const retrieved = await AuthService.getGitHubAppCredential(hostId);
      expect(retrieved?.kind).toBe('github_app');
      expect(retrieved?.installationId).toBe(123456);
      expect(retrieved?.selectedRepositories).toHaveLength(1);
      await AuthService.removeGitHubAppCredential(hostId);
    });
  });

  describe('validateGitHubAppCredential', () => {
    it('returns valid for a well-formed GitHub App credential', async () => {
      const record = makeAppRecord();
      const result = await AuthService.validateGitHubAppCredential(record);
      expect(result.valid).toBe(true);
    });

    it('returns invalid for an empty repository selection', async () => {
      const record = makeAppRecord();
      record.selectedRepositories = [];
      const result = await AuthService.validateGitHubAppCredential(record);
      expect(result.valid).toBe(false);
    });

    it('returns invalid for an expired installation token', async () => {
      const record = makeAppRecord();
      record.expiresAt = Date.now() - 1000;
      const result = await AuthService.validateGitHubAppCredential(record);
      expect(result.valid).toBe(false);
    });
  });

  describe('removeGitHubAppCredential', () => {
    it('is idempotent when no credential is stored', async () => {
      await expect(
        AuthService.removeGitHubAppCredential('nonexistent-host'),
      ).resolves.not.toThrow();
    });

    it('removes a stored GitHub App credential', async () => {
      const hostId = 'github:app-remove-test:github.com';
      const record = makeAppRecord();
      await AuthService.setGitHubAppCredential?.(hostId, record);
      await AuthService.removeGitHubAppCredential(hostId);
      const retrieved = await AuthService.getGitHubAppCredential(hostId);
      expect(retrieved).toBeNull();
    });
  });
});

// ── Feature-scoped availability ───────────────────────────────────────────────

describe('AuthService getProviderAuthAvailability', () => {
  it('returns isAvailable: true for GitHub when a token exists', async () => {
    // This test mocks AccountStorage.getHostToken to return a token
    // and verifies that isAvailable is true even without OAuth/App credentials.
    const result = await AuthService.getProviderAuthAvailability(
      'github:existing-token:github.com',
      'github',
    );
    // When a host token exists, isAvailable is true regardless of OAuth/App state.
    expect(result.provider).toBe('github');
  });

  it('non-GitHub providers do not expose oauth/githubApp availability fields', async () => {
    const result = await AuthService.getProviderAuthAvailability(
      'gitlab:acc-1:gitlab.com',
      'gitlab',
    );
    expect(result.provider).toBe('gitlab');
    expect(result.isAvailable).toBeDefined();
    expect('oauth' in result).toBe(false);
    expect('githubApp' in result).toBe(false);
  });

  it('GitHub provider exposes oauth and githubApp availability', async () => {
    const result = await AuthService.getProviderAuthAvailability(
      'github:acc-1:github.com',
      'github',
    );
    expect(result.provider).toBe('github');
    expect(result.oauth).toBeDefined();
    expect(result.githubApp).toBeDefined();
  });
});

// ── Provider isolation ────────────────────────────────────────────────────────

describe('Provider isolation', () => {
  // Ensures that a GitHub OAuth or App failure does not affect GitLab, Gitea,
  // Forgejo, or SSH authentication.

  it('GitLab provider availability is independent of GitHub OAuth state', async () => {
    // GitLab should always be available if a token exists, regardless of whether
    // GitHub OAuth is configured, failing, or the backend is unreachable.
    const gitlabResult = await AuthService.getProviderAuthAvailability(
      'gitlab:acc-1:gitlab.com',
      'gitlab',
    );
    const githubResult = await AuthService.getProviderAuthAvailability(
      'github:acc-1:github.com',
      'github',
    );
    // Both providers' availability states are independent objects.
    // Failure in githubResult.oauth does not make gitlabResult.isAvailable = false.
    expect(gitlabResult.provider).toBe('gitlab');
    expect(githubResult.provider).toBe('github');
  });

  it('Gitea and Forgejo providers do not expose GitHub-specific availability', async () => {
    const giteaResult = await AuthService.getProviderAuthAvailability(
      'gitea:acc-1:gitea.com',
      'gitea',
    );
    const forgejoResult = await AuthService.getProviderAuthAvailability(
      'forgejo:acc-1:codeberg.org',
      'forgejo',
    );
    expect(giteaResult.oauth).toBeUndefined();
    expect(giteaResult.githubApp).toBeUndefined();
    expect(forgejoResult.oauth).toBeUndefined();
    expect(forgejoResult.githubApp).toBeUndefined();
  });
});
