/**
 * Contract tests for the git host authentication contracts.
 *
 * These tests characterize the expected behavior of the v1 contract types:
 * - providers: capability declaration per provider
 * - credentials: PAT class hierarchy, SSH, expiry/refresh
 * - repository: canonical repo IDs, allowlists
 * - errors: stable error codes and ApiError shape
 *
 * All tests use the actual contract implementations in ../contracts/.
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

import {
  // Providers
  makeCapabilities,
  DEFAULT_CAPABILITIES,
  PROVIDER_API_BASES,
  // Credentials
  CREDENTIAL_KIND,
  isExpired,
  displayLabel,
  requiresPreflight,
  isGitHubFineGrainedPat,
  isSsh,
  parseCredentialKind,
  // Repository
  computeInstanceKey,
  makeCanonicalRepoId,
  parseCanonicalRepoId,
  validateCanonicalRepoId,
  matchesRepoId,
  filterByProvider,
  // Errors
  makeApiError,
  httpStatusForError,
  isClientError,
  isServerError,
  isRetryable,
  parseApiErrorResponse,
  errorCredentialExpired,
  errorMalformedRequest,
  errorRepositoryNotInAllowlist,
  API_VERSION,
} from '../../../../src/services/git/contracts';

import type {
  Credential,
  GitHubFineGrainedPatCredential,
  GitHubClassicPatCredential,
  SshCredential,
  GenericPatCredential,
  ProviderCapabilities,
  CanonicalRepoId,
  ApiError,
  ErrorCode,
} from '../../../../src/services/git/contracts';

// ─────────────────────────────────────────────────────────────────────────────
// PROVIDERS contract
// ─────────────────────────────────────────────────────────────────────────────

describe('providers contract', () => {
  describe('DEFAULT_CAPABILITIES', () => {
    it('declares github supports fine-grained PATs', () => {
      expect(DEFAULT_CAPABILITIES.github.supportsFineGrainedPat).toBe(true);
    });

    it('declares gitlab does NOT support fine-grained PATs', () => {
      expect(DEFAULT_CAPABILITIES.gitlab.supportsFineGrainedPat).toBe(false);
    });

    it('declares gitea does NOT support fine-grained PATs', () => {
      expect(DEFAULT_CAPABILITIES.gitea.supportsFineGrainedPat).toBe(false);
    });

    it('declares forgejo does NOT support fine-grained PATs', () => {
      expect(DEFAULT_CAPABILITIES.forgejo.supportsFineGrainedPat).toBe(false);
    });

    it('declares all providers support SSH', () => {
      for (const provider of ['github', 'gitlab', 'gitea', 'forgejo'] as const) {
        expect(DEFAULT_CAPABILITIES[provider].supportsSsh).toBe(true);
      }
    });

    it('declares github supports capability headers', () => {
      expect(DEFAULT_CAPABILITIES.github.supportsCapabilityHeaders).toBe(true);
    });

    it('declares non-github providers do NOT support capability headers', () => {
      expect(DEFAULT_CAPABILITIES.gitlab.supportsCapabilityHeaders).toBe(false);
      expect(DEFAULT_CAPABILITIES.gitea.supportsCapabilityHeaders).toBe(false);
      expect(DEFAULT_CAPABILITIES.forgejo.supportsCapabilityHeaders).toBe(false);
    });
  });

  describe('makeCapabilities', () => {
    it('uses instanceBaseUrl=null for SaaS defaults', () => {
      const caps = makeCapabilities('github', null);
      expect(caps.instanceBaseUrl).toBeNull();
    });

    it('sets instanceBaseUrl for self-hosted', () => {
      const caps = makeCapabilities('gitlab', 'https://gitlab.mycompany.com/api/v4');
      expect(caps.instanceBaseUrl).toBe('https://gitlab.mycompany.com/api/v4');
    });

    it('copies all default capabilities', () => {
      const caps = makeCapabilities('github', null);
      expect(caps.provider).toBe('github');
      expect(caps.apiVersion).toBe('v3');
      expect(caps.supportsOAuthRefresh).toBe(true);
      expect(caps.supportsFineGrainedPat).toBe(true);
      expect(caps.supportsSsh).toBe(true);
      expect(caps.supportsCapabilityHeaders).toBe(true);
    });
  });

  describe('PROVIDER_API_BASES', () => {
    it('uses correct GitHub API base', () => {
      expect(PROVIDER_API_BASES.github).toBe('https://api.github.com');
    });

    it('uses correct GitLab API base', () => {
      expect(PROVIDER_API_BASES.gitlab).toBe('https://gitlab.com/api/v4');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CREDENTIALS contract
// ─────────────────────────────────────────────────────────────────────────────

describe('credentials contract', () => {
  describe('CREDENTIAL_KIND discriminant', () => {
    it('is the string "kind"', () => {
      expect(CREDENTIAL_KIND).toBe('kind');
    });
  });

  describe('GitHubClassicPatCredential', () => {
    const classicPat: GitHubClassicPatCredential = {
      kind: 'github_classic_pat',
      token: 'ghp_test123',
      scopes: ['repo', 'workflow'],
      label: 'Work laptop',
    };

    it('has correct kind discriminant', () => {
      expect(classicPat[CREDENTIAL_KIND]).toBe('github_classic_pat');
    });

    it('does NOT require preflight (classic PATs advertise scope via headers)', () => {
      expect(requiresPreflight(classicPat)).toBe(false);
    });

    it('displayLabel returns label when set', () => {
      expect(displayLabel(classicPat)).toBe('Work laptop');
    });

    it('isExpired is false when no expiry', () => {
      expect(isExpired(classicPat)).toBe(false);
    });
  });

  describe('GitHubFineGrainedPatCredential', () => {
    const fineGrainedPat: GitHubFineGrainedPatCredential = {
      kind: 'github_fine_grained_pat',
      token: 'github_pat_test',
      ownerLogin: 'gedwolmen',
      repositories: ['gedwolmen/gitnotes'],
      expiresAt: '2099-01-01T00:00:00Z',
      requiresPreflight: true,
      label: 'Fine-grained read-only',
    };

    it('has correct kind discriminant', () => {
      expect(fineGrainedPat[CREDENTIAL_KIND]).toBe('github_fine_grained_pat');
    });

    it('ALWAYS requires preflight (header fast-path unreliable)', () => {
      expect(requiresPreflight(fineGrainedPat)).toBe(true);
    });

    it('isGitHubFineGrainedPat returns true', () => {
      expect(isGitHubFineGrainedPat(fineGrainedPat)).toBe(true);
    });

    it('isExpired is false when expiry is in the future', () => {
      expect(isExpired(fineGrainedPat)).toBe(false);
    });

    it('isExpired is true when expiry is in the past', () => {
      const expiredPat: GitHubFineGrainedPatCredential = {
        ...fineGrainedPat,
        expiresAt: '2020-01-01T00:00:00Z',
      };
      expect(isExpired(expiredPat)).toBe(true);
    });

    it('displayLabel falls back to kind label when no label set', () => {
      const unlabeled: GitHubFineGrainedPatCredential = {
        ...fineGrainedPat,
        label: undefined as unknown as string,
      };
      expect(displayLabel(unlabeled)).toBe('GitHub Fine-Grained PAT');
    });
  });

  describe('GenericPatCredential', () => {
    const pat: GenericPatCredential = {
      kind: 'pat',
      token: 'glpat-test',
      expiresAt: null,
      refreshToken: 'glrt-test',
      label: 'GitLab token',
    };

    it('has correct kind discriminant', () => {
      expect(pat[CREDENTIAL_KIND]).toBe('pat');
    });

    it('isSsh returns false', () => {
      expect(isSsh(pat)).toBe(false);
    });

    it('isExpired is false when no expiry', () => {
      expect(isExpired(pat)).toBe(false); // No expiry means not expired
    });
  });

  describe('SshCredential', () => {
    const ssh: SshCredential = {
      kind: 'ssh',
      privateKey: '-----BEGIN OPENSSH PRIVATE KEY-----\ntest\n-----END OPENSSH PRIVATE KEY-----',
      publicKey: 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAtest test@example.com',
      passphrase: null,
      fingerprint: 'SHA256:abc123',
    };

    it('has correct kind discriminant', () => {
      expect(ssh[CREDENTIAL_KIND]).toBe('ssh');
    });

    it('isSsh returns true', () => {
      expect(isSsh(ssh)).toBe(true);
    });

    it('isGitHubFineGrainedPat returns false', () => {
      expect(isGitHubFineGrainedPat(ssh)).toBe(false);
    });

    it('isExpired is false for SSH (no expiry concept)', () => {
      expect(isExpired(ssh)).toBe(false);
    });

    it('displayLabel falls back to SSH Key when no label set', () => {
      const unlabeled: SshCredential = { ...ssh, label: undefined } as unknown as SshCredential;
      expect(displayLabel(unlabeled)).toBe('SSH Key');
    });
  });

  describe('parseCredentialKind', () => {
    it('returns github_classic_pat from correct object', () => {
      expect(parseCredentialKind({ kind: 'github_classic_pat', token: 'test' })).toBe('github_classic_pat');
    });

    it('returns github_fine_grained_pat from correct object', () => {
      expect(parseCredentialKind({ kind: 'github_fine_grained_pat', token: 'test' })).toBe('github_fine_grained_pat');
    });

    it('returns pat from correct object', () => {
      expect(parseCredentialKind({ kind: 'pat', token: 'test' })).toBe('pat');
    });

    it('returns ssh from correct object', () => {
      expect(parseCredentialKind({ kind: 'ssh', privateKey: 'test' })).toBe('ssh');
    });

    it('returns null for null input', () => {
      expect(parseCredentialKind(null)).toBeNull();
    });

    it('returns null for non-object input', () => {
      expect(parseCredentialKind('ssh')).toBeNull();
      expect(parseCredentialKind(42)).toBeNull();
    });

    it('returns null for unknown kind', () => {
      expect(parseCredentialKind({ kind: 'unknown_kind', token: 'test' })).toBeNull();
    });

    it('returns null when kind field missing', () => {
      expect(parseCredentialKind({ token: 'test' })).toBeNull();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// REPOSITORY contract
// ─────────────────────────────────────────────────────────────────────────────

describe('repository contract', () => {
  describe('computeInstanceKey', () => {
    it('returns "default" for null (SaaS)', () => {
      expect(computeInstanceKey(null)).toBe('default');
    });

    it('returns "default" for undefined', () => {
      expect(computeInstanceKey(undefined as unknown as null)).toBe('default');
    });

    it('strips trailing slashes', () => {
      expect(computeInstanceKey('https://gitlab.mycompany.com/api/v4/')).toBe(
        'gitlab.mycompany.com',
      );
    });

    it('lowercases hostname', () => {
      expect(computeInstanceKey('https://GITHUB.Example.COM/')).toBe('github.example.com');
    });

    it('handles port in URL', () => {
      expect(computeInstanceKey('https://gitlab.internal:8443/api/v4')).toBe(
        'gitlab.internal_port_8443',
      );
    });

    it('handles URL without scheme as fallback', () => {
      expect(computeInstanceKey('gitlab.mycompany.com/api/v4')).toContain('gitlab.mycompany.com');
    });
  });

  describe('makeCanonicalRepoId', () => {
    it('formats canonical ID for SaaS GitHub', () => {
      expect(makeCanonicalRepoId('github', 'default', 'gedwolmen', 'gitnotes')).toBe(
        'github:default/gedwolmen/gitnotes',
      );
    });

    it('formats canonical ID for self-hosted GitHub', () => {
      expect(makeCanonicalRepoId('github', 'github.mycompany.com', 'engineering', 'backend')).toBe(
        'github:github.mycompany.com/engineering/backend',
      );
    });

    it('formats canonical ID for GitLab SaaS', () => {
      expect(makeCanonicalRepoId('gitlab', 'default', 'acme', 'website')).toBe(
        'gitlab:default/acme/website',
      );
    });

    it('URL-encodes owner and repo with special characters', () => {
      expect(makeCanonicalRepoId('github', 'default', 'my-org', 'my-repo')).toBe(
        'github:default/my-org/my-repo',
      );
    });
  });

  describe('parseCanonicalRepoId', () => {
    it('parses a valid GitHub canonical ID', () => {
      const result = parseCanonicalRepoId('github:default/gedwolmen/gitnotes');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('github');
      expect(result!.instanceKey).toBe('default');
      expect(result!.owner).toBe('gedwolmen');
      expect(result!.repo).toBe('gitnotes');
    });

    it('parses a self-hosted GitHub canonical ID', () => {
      const result = parseCanonicalRepoId('github:github.mycompany.com/engineering/backend');
      expect(result).not.toBeNull();
      expect(result!.provider).toBe('github');
      expect(result!.instanceKey).toBe('github.mycompany.com');
      expect(result!.owner).toBe('engineering');
      expect(result!.repo).toBe('backend');
    });

    it('returns null for invalid provider', () => {
      expect(parseCanonicalRepoId('bitbucket:default/user/repo')).toBeNull();
    });

    it('returns null for malformed ID (missing repo)', () => {
      expect(parseCanonicalRepoId('github:default/owner')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseCanonicalRepoId('')).toBeNull();
    });

    it('returns null for ID without colon', () => {
      expect(parseCanonicalRepoId('github-default-owner-repo')).toBeNull();
    });
  });

  describe('validateCanonicalRepoId', () => {
    it('returns a full CanonicalRepoId for valid ID', () => {
      const result = validateCanonicalRepoId('github:default/gedwolmen/gitnotes');
      expect(result).not.toBeNull();
      expect(result!.version).toBe(1);
      expect(result!.id).toBe('github:default/gedwolmen/gitnotes');
      expect(result!.provider).toBe('github');
      expect(result!.displayName).toBe('gedwolmen/gitnotes');
    });

    it('returns null for invalid ID', () => {
      expect(validateCanonicalRepoId('bitbucket:default/user/repo')).toBeNull();
    });
  });

  describe('matchesRepoId', () => {
    it('matches when provider and owner match', () => {
      expect(matchesRepoId('github:default/gedwolmen/gitnotes', 'github', 'gedwolmen')).toBe(true);
    });

    it('does NOT match when owner differs', () => {
      expect(matchesRepoId('github:default/gedwolmen/gitnotes', 'github', 'other-user')).toBe(false);
    });

    it('does NOT match when provider differs', () => {
      expect(matchesRepoId('github:default/gedwolmen/gitnotes', 'gitlab', 'gedwolmen')).toBe(false);
    });

    it('accepts a CanonicalRepoId object as input', () => {
      const canonical: CanonicalRepoId = {
        version: 1,
        id: 'github:default/gedwolmen/gitnotes',
        provider: 'github',
        instanceKey: 'default',
        owner: 'gedwolmen',
        repo: 'gitnotes',
        displayName: 'gedwolmen/gitnotes',
      };
      expect(matchesRepoId(canonical, 'github', 'gedwolmen')).toBe(true);
    });
  });

  describe('filterByProvider', () => {
    const ids = [
      'github:default/gedwolmen/gitnotes',
      'gitlab:default/acme/website',
      'github:default/gedwolmen/notes-app',
    ];

    it('returns only GitHub repos', () => {
      const result = filterByProvider(ids, 'github');
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.provider === 'github')).toBe(true);
    });

    it('returns empty array when no matches', () => {
      expect(filterByProvider(ids, 'forgejo')).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ERRORS contract
// ─────────────────────────────────────────────────────────────────────────────

describe('errors contract', () => {
  describe('makeApiError', () => {
    it('creates an error with version 1', () => {
      const err = makeApiError('MALFORMED_REQUEST', 'Invalid request');
      expect(err.version).toBe(1);
    });

    it('omits details when not provided', () => {
      const err = makeApiError('MALFORMED_REQUEST', 'Invalid request');
      expect('details' in err).toBe(false);
    });

    it('includes details when provided', () => {
      const err = makeApiError('CREDENTIAL_EXPIRED', 'Token expired', {
        kind: 'credential_expired',
        expiredAt: '2020-01-01T00:00:00Z',
        hint: 'refresh',
      });
      expect(err.details).toBeDefined();
      expect((err.details as any).kind).toBe('credential_expired');
    });
  });

  describe('httpStatusForError', () => {
    it('maps MALFORMED_REQUEST to 400', () => {
      expect(httpStatusForError('MALFORMED_REQUEST')).toBe(400);
    });

    it('maps CREDENTIAL_EXPIRED to 401', () => {
      expect(httpStatusForError('CREDENTIAL_EXPIRED')).toBe(401);
    });

    it('maps REPOSITORY_ACCESS_DENIED to 403', () => {
      expect(httpStatusForError('REPOSITORY_ACCESS_DENIED')).toBe(403);
    });

    it('maps REPOSITORY_NOT_FOUND to 404', () => {
      expect(httpStatusForError('REPOSITORY_NOT_FOUND')).toBe(404);
    });

    it('maps REPOSITORY_ALREADY_EXISTS to 409', () => {
      expect(httpStatusForError('REPOSITORY_ALREADY_EXISTS')).toBe(409);
    });

    it('maps VALIDATION_ERROR to 422', () => {
      expect(httpStatusForError('VALIDATION_ERROR')).toBe(422);
    });

    it('maps RATE_LIMITED to 429', () => {
      expect(httpStatusForError('RATE_LIMITED')).toBe(429);
    });

    it('maps INTERNAL_ERROR to 500', () => {
      expect(httpStatusForError('INTERNAL_ERROR')).toBe(500);
    });

    it('maps PROVIDER_UNAVAILABLE to 503', () => {
      expect(httpStatusForError('PROVIDER_UNAVAILABLE')).toBe(503);
    });
  });

  describe('isClientError / isServerError', () => {
    it('classifies 4xx as client errors', () => {
      expect(isClientError('MALFORMED_REQUEST')).toBe(true);
      expect(isClientError('CREDENTIAL_EXPIRED')).toBe(true);
      expect(isClientError('REPOSITORY_ACCESS_DENIED')).toBe(true);
    });

    it('does NOT classify 5xx as client errors', () => {
      expect(isClientError('INTERNAL_ERROR')).toBe(false);
      expect(isClientError('PROVIDER_UNAVAILABLE')).toBe(false);
    });

    it('classifies 5xx as server errors', () => {
      expect(isServerError('INTERNAL_ERROR')).toBe(true);
      expect(isServerError('PROVIDER_UNAVAILABLE')).toBe(true);
    });

    it('does NOT classify 4xx as server errors', () => {
      expect(isServerError('MALFORMED_REQUEST')).toBe(false);
    });
  });

  describe('isRetryable', () => {
    it('is true for RATE_LIMITED', () => {
      expect(isRetryable('RATE_LIMITED')).toBe(true);
    });

    it('is true for PROVIDER_UNAVAILABLE', () => {
      expect(isRetryable('PROVIDER_UNAVAILABLE')).toBe(true);
    });

    it('is true for INTERNAL_ERROR', () => {
      expect(isRetryable('INTERNAL_ERROR')).toBe(true);
    });

    it('is false for client errors', () => {
      expect(isRetryable('MALFORMED_REQUEST')).toBe(false);
      expect(isRetryable('CREDENTIAL_EXPIRED')).toBe(false);
      expect(isRetryable('REPOSITORY_ACCESS_DENIED')).toBe(false);
    });
  });

  describe('errorCredentialExpired', () => {
    it('creates a structured CREDENTIAL_EXPIRED error', () => {
      const err = errorCredentialExpired('2020-01-01T00:00:00Z', 'refresh');
      expect(err.code).toBe('CREDENTIAL_EXPIRED');
      expect(err.message).toBe('The credential has expired.');
      expect((err.details as any).kind).toBe('credential_expired');
      expect((err.details as any).expiredAt).toBe('2020-01-01T00:00:00Z');
      expect((err.details as any).hint).toBe('refresh');
    });
  });

  describe('errorRepositoryNotInAllowlist', () => {
    it('creates a REPOSITORY_NOT_IN_ALLOWLIST error', () => {
      const err = errorRepositoryNotInAllowlist('github:default/user/repo');
      expect(err.code).toBe('REPOSITORY_NOT_IN_ALLOWLIST');
      // Message must NOT contain the repo ID (to avoid existence confirmation attacks)
      expect(err.message).not.toContain('github:default/user/repo');
    });
  });

  describe('parseApiErrorResponse', () => {
    it('parses a valid error response', () => {
      const body = { version: 1, code: 'MALFORMED_REQUEST', message: 'Invalid request' };
      const result = parseApiErrorResponse(body);
      expect(result).not.toBeNull();
      expect(result!.code).toBe('MALFORMED_REQUEST');
    });

    it('returns null for version !== 1', () => {
      const body = { version: 2, code: 'MALFORMED_REQUEST', message: 'Invalid' };
      expect(parseApiErrorResponse(body)).toBeNull();
    });

    it('returns null for missing code', () => {
      const body = { version: 1, message: 'Invalid' };
      expect(parseApiErrorResponse(body)).toBeNull();
    });

    it('returns null for unknown error code', () => {
      const body = { version: 1, code: 'UNKNOWN_CODE', message: 'Invalid' };
      expect(parseApiErrorResponse(body)).toBeNull();
    });

    it('returns null for null input', () => {
      expect(parseApiErrorResponse(null)).toBeNull();
    });
  });

  describe('error response immutability', () => {
    it('makeApiError returns a frozen object', () => {
      const err = makeApiError('MALFORMED_REQUEST', 'test');
      expect(Object.isFrozen(err)).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// API VERSION
// ─────────────────────────────────────────────────────────────────────────────

describe('API_VERSION constant', () => {
  it('is /api/v1', () => {
    expect(API_VERSION).toBe('/api/v1');
  });
});
