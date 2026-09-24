/**
 * Versioned, typed JSON contracts for credential classes.
 *
 * Defines the full credential type hierarchy:
 * - GitHub classic PAT (ghp_...)
 * - GitHub fine-grained PAT (github_pat_...)
 * - Generic PAT (any bearer token)
 * - SSH key pair
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

import type { GitHostProvider } from '../GitHost';

/**
 * Discriminated union of supported credential kinds.
 * The `kind` field is the discriminant.
 */
export type Credential =
  | GitHubClassicPatCredential
  | GitHubFineGrainedPatCredential
  | GenericPatCredential
  | SshCredential;

/** Discriminant field name — the value of `kind` identifies the variant. */
export const CREDENTIAL_KIND = 'kind' as const;

// ── PAT variants ──────────────────────────────────────────────────────────────

/**
 * A GitHub classic personal access token (prefix `ghp_`).
 * Classic PATs do not expire but can be revoked.
 * They carry repo-level or org-level scopes.
 */
export interface GitHubClassicPatCredential {
  readonly [CREDENTIAL_KIND]: 'github_classic_pat';
  /** The token value. Never logged or included in error messages. */
  readonly token: string;
  /**
   * Scopes this token carries. Known scopes:
   * - `repo` — full repo access (required for private repos)
   * - `repo:status` — read-only repo status
   * - `workflow` — GitHub Actions workflows
   * Empty array means no scope info available (opaque token).
   */
  readonly scopes: readonly string[];
  /** Human-readable label for display in settings UI. */
  readonly label?: string;
}

/**
 * A GitHub fine-grained personal access token (prefix `github_pat_`).
 *
 * Fine-grained PATs are scoped to specific repos, orgs, or users,
 * and can have expiry dates. They do NOT reliably advertise write
 * capability via the `x-accepted-github-permissions` header on
 * `GET /repos` — see RepoAccessPreflight.ts for the preflight probe.
 *
 * The `requiresPreflight` flag signals callers to skip the fast-path
 * header check and go straight to the write-probe.
 */
export interface GitHubFineGrainedPatCredential {
  readonly [CREDENTIAL_KIND]: 'github_fine_grained_pat';
  readonly token: string;
  /**
   * The token owner's login (user or org) on whose behalf the token was created.
   * Used to correlate with HostConnection.hostLogin.
   */
  readonly ownerLogin: string;
  /**
   * Repository selection. Either a list of specific `owner/repo` slugs,
   * or the string "all" meaning all repos owned by the token owner.
   */
  readonly repositories: readonly string[] | 'all';
  /**
   * RFC 3339 expiry string, or null if the token has no expiry.
   * Past-expiry tokens are treated as invalid credentials.
   */
  readonly expiresAt: string | null;
  /**
   * Fine-grained PATs always require preflight write-probe because the
   * GitHub API does not reliably advertise write capability in headers.
   * Always true for this variant.
   */
  readonly requiresPreflight: true;
  readonly label?: string;
}

/**
 * A bearer-token credential that is not specifically a GitHub PAT.
 * Used for GitLab, Gitea, Forgejo, or any other OAuth-like provider.
 */
export interface GenericPatCredential {
  readonly [CREDENTIAL_KIND]: 'pat';
  readonly token: string;
  /**
   * Optional expiry in RFC 3339. Null means no expiry.
   * Providers that do not expose expiry SHOULD return null.
   */
  readonly expiresAt: string | null;
  /**
   * Optional refresh token for OAuth-style refresh flows.
   * Providers that do not support refresh SHOULD return null.
   * Mobile owns refresh tokens; the backend is stateless.
   */
  readonly refreshToken: string | null;
  readonly label?: string;
}

// ── SSH variant ───────────────────────────────────────────────────────────────

/**
 * SSH key pair credential.
 * Used when the user opts to use SSH instead of HTTPS PAT auth.
 */
export interface SshCredential {
  readonly [CREDENTIAL_KIND]: 'ssh';
  /**
   * PEM-encoded private key. Supports Ed25519 (preferred) and RSA.
   * Never logged.
   */
  readonly privateKey: string;
  /**
   * Public key in OpenSSH format (`ssh-ed25519 AAAA... comment`).
   * Included in the credential so the engine can validate key type.
   */
  readonly publicKey: string;
  /**
   * Passphrase protecting the private key, or null if unencrypted.
   * Never stored in plaintext; always encrypted via SecureStore.
   */
  readonly passphrase: string | null;
  /**
   * The key's fingerprint (e.g. `SHA256:...`) for display in settings.
   * Not used for authentication — included for UX only.
   */
  readonly fingerprint: string | null;
}

// ── Credential reference (token id, not the secret) ──────────────────────────

/**
 * A reference to a stored credential, without the secret value.
 * Used in API responses and repository allowlists.
 */
export interface CredentialRef {
  /** Stable identifier for this credential within the mobile store. */
  readonly id: string;
  /** Which variant this credential is. */
  readonly kind: Credential['kind'];
  /** Human-readable label, if set. */
  readonly label: string | null;
  /** The provider this credential is associated with. */
  readonly provider: GitHostProvider;
  /** Expiry RFC 3339 string, or null if no expiry. */
  readonly expiresAt: string | null;
  /** Whether this credential requires a preflight write-probe before use. */
  readonly requiresPreflight: boolean;
}

// ── Credential value envelope (transit only) ──────────────────────────────────

/**
 * Full credential including the secret, used only when transmitting
 * FROM mobile TO the native Git engine or to the backend.
 * Never persisted; always transient.
 */
export type CredentialEnvelope =
  | GitHubClassicPatEnvelope
  | GitHubFineGrainedPatEnvelope
  | GenericPatEnvelope
  | SshEnvelope;

export interface GitHubClassicPatEnvelope {
  readonly [CREDENTIAL_KIND]: 'github_classic_pat';
  readonly token: string;
  readonly scopes: readonly string[];
}

export interface GitHubFineGrainedPatEnvelope {
  readonly [CREDENTIAL_KIND]: 'github_fine_grained_pat';
  readonly token: string;
  readonly requiresPreflight: true;
}

export interface GenericPatEnvelope {
  readonly [CREDENTIAL_KIND]: 'pat';
  readonly token: string;
  readonly expiresAt: string | null;
  readonly refreshToken: string | null;
}

export interface SshEnvelope {
  readonly [CREDENTIAL_KIND]: 'ssh';
  readonly privateKey: string;
  readonly publicKey: string;
  readonly passphrase: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** True when the credential has an expiry that has already passed. */
export function isExpired(credential: Credential | CredentialRef): boolean {
  // Only GitHubFineGrainedPatCredential and GenericPatCredential have expiresAt.
  // GitHubClassicPatCredential and SshCredential do not.
  if (credential.kind === 'github_classic_pat' || credential.kind === 'ssh') return false;
  const expiresAt = (credential as GitHubFineGrainedPatCredential | GenericPatCredential).expiresAt;
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

/** Returns the display label, falling back to the kind when no label set. */
export function displayLabel(credential: Credential | CredentialRef): string {
  if ('label' in credential && credential.label) return credential.label;
  const kindLabels = {
    github_classic_pat: 'GitHub Classic PAT',
    github_fine_grained_pat: 'GitHub Fine-Grained PAT',
    pat: 'Personal Access Token',
    ssh: 'SSH Key',
  } as const;
  return kindLabels[credential.kind] ?? credential.kind;
}

/** True when the credential kind requires preflight write-probing. */
export function requiresPreflight(credential: Credential | CredentialRef): boolean {
  return credential.kind === 'github_fine_grained_pat';
}

/** True when the credential is a GitHub fine-grained PAT. */
export function isGitHubFineGrainedPat(
  credential: Credential | CredentialRef,
): credential is GitHubFineGrainedPatCredential {
  return credential.kind === 'github_fine_grained_pat';
}

/** True when the credential is an SSH key. */
export function isSsh(credential: Credential | CredentialRef): boolean {
  return credential.kind === 'ssh';
}

/**
 * Extract the credential kind from a raw object (for parsing incoming JSON).
 * Returns null if the kind is not a valid discriminant.
 */
export function parseCredentialKind(value: unknown): Credential['kind'] | null {
  if (typeof value !== 'object' || value === null) return null;
  const obj = value as Record<string, unknown>;
  const kind = obj[CREDENTIAL_KIND];
  if (typeof kind !== 'string') return null;
  const valid = ['github_classic_pat', 'github_fine_grained_pat', 'pat', 'ssh'] as const;
  if (!valid.includes(kind as (typeof valid)[number])) return null;
  return kind as Credential['kind'];
}
