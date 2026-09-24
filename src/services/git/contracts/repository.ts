/**
 * Versioned, typed JSON contracts for repository identity and allowlists.
 *
 * Canonical IDs distinguish provider, instance, owner, and name — they
 * are the stable key used in allowlists and across the mobile↔backend
 * boundary.
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

import type { GitHostProvider } from '../GitHost';

// ── Canonical repository identifier ────────────────────────────────────────────

/**
 * A stable, globally unique repository identifier.
 *
 * Format: `<provider>:<instanceKey>/<owner>/<repo>`
 * - provider: `github`, `gitlab`, `gitea`, `forgejo`
 * - instanceKey: URL-safe key derived from the instance base URL
 *   (or `default` for SaaS providers)
 * - owner: URL-decoded owner slug
 * - repo: URL-decoded repository slug
 *
 * Examples:
 *   github:default/gedwolmen/gitnotes
 *   github:github.mycompany.com/engineering/backend
 *   gitlab:default/acme/website
 *   gitea:https://codeberg.org/forgejo/forgejo
 *
 * The instanceKey is computed as:
 *   1. Normalize: strip trailing slashes, scheme prefix if needed
 *   2. Hostname: lowercase, colons replaced with `_port_`
 *   3. URL-encode key characters
 */
export interface CanonicalRepoId {
  readonly version: 1;
  readonly id: string;
  readonly provider: GitHostProvider;
  /** URL-safe key derived from instanceBaseUrl, or "default". */
  readonly instanceKey: string;
  readonly owner: string;
  readonly repo: string;
  /** Human-readable full name `<owner>/<repo>`. */
  readonly displayName: string;
}

/**
 * Parts of a parsed canonical repo ID.
 * Used for re-serializing or constructing a CanonicalRepoId.
 */
export interface ParsedCanonicalRepoId {
  readonly provider: GitHostProvider;
  readonly instanceKey: string;
  readonly owner: string;
  readonly repo: string;
}

// ── Instance key computation ───────────────────────────────────────────────────

/** Compute the instance key from an instanceBaseUrl. */
export function computeInstanceKey(instanceBaseUrl: string | null): string {
  if (!instanceBaseUrl) return 'default';
  const normalized = instanceBaseUrl.replace(/\/+$/, '');
  const url = normalized.startsWith('http') ? normalized : `https://${normalized}`;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const port = parsed.port ? `_port_${parsed.port}` : '';
    return `${host}${port}`;
  } catch {
    // Fallback: use the raw normalized string
    return normalized.replace(/[^a-zA-Z0-9._-]/g, '_');
  }
}

// ── Canonical ID serialization ─────────────────────────────────────────────────

/**
 * Build a canonical repo ID string from its components.
 * This is the inverse of parseCanonicalRepoId.
 */
export function makeCanonicalRepoId(
  provider: GitHostProvider,
  instanceKey: string,
  owner: string,
  repo: string,
): string {
  return `${provider}:${instanceKey}/${owner}/${repo}`;
}

/**
 * Parse a canonical repo ID string into its components.
 * Returns null if the string does not match the expected format.
 */
export function parseCanonicalRepoId(id: string): ParsedCanonicalRepoId | null {
  const colonIdx = id.indexOf(':');
  if (colonIdx < 0) return null;
  const provider = id.slice(0, colonIdx) as GitHostProvider;
  const validProviders: GitHostProvider[] = ['github', 'gitlab', 'gitea', 'forgejo'];
  if (!validProviders.includes(provider)) return null;
  const remainder = id.slice(colonIdx + 1);
  const slashIdx = remainder.indexOf('/');
  if (slashIdx < 0) return null;
  const instanceKey = remainder.slice(0, slashIdx);
  const afterInstance = remainder.slice(slashIdx + 1);
  const lastSlashIdx = afterInstance.lastIndexOf('/');
  if (lastSlashIdx < 0) return null;
  const owner = decodeURIComponent(afterInstance.slice(0, lastSlashIdx));
  const repo = decodeURIComponent(afterInstance.slice(lastSlashIdx + 1));
  if (!owner || !repo) return null;
  return { provider, instanceKey, owner, repo };
}

/**
 * Validate that a raw string is a well-formed canonical repo ID.
 * Returns null if validation fails.
 */
export function validateCanonicalRepoId(id: string): CanonicalRepoId | null {
  const parsed = parseCanonicalRepoId(id);
  if (!parsed) return null;
  const instanceKey = computeInstanceKey(parsed.instanceKey === 'default' ? null : parsed.instanceKey);
  return {
    version: 1,
    id,
    provider: parsed.provider,
    instanceKey,
    owner: parsed.owner,
    repo: parsed.repo,
    displayName: `${parsed.owner}/${parsed.repo}`,
  };
}

// ── Repository allowlist ──────────────────────────────────────────────────────

/**
 * A local allowlist entry for a single repository.
 * Controls whether the app will sync with the given repository.
 *
 * The allowlist is maintained on mobile and sent to the backend
 * so the backend can validate that repository access is authorized.
 */
export interface RepositoryAllowlistEntry {
  /** The canonical repo ID this entry controls. */
  readonly repoId: string;
  /** The allowlist entry version, for future schema migrations. */
  readonly version: 1;
  /** When this entry was added (RFC 3339). */
  readonly addedAt: string;
  /** Whether sync is enabled for this repository. */
  readonly enabled: boolean;
  /** Optional human-readable alias (e.g. "Work Notes"). */
  readonly alias: string | null;
}

/** The full repository allowlist. */
export interface RepositoryAllowlist {
  readonly version: 1;
  /** All entries, newest first by addedAt. */
  readonly entries: readonly RepositoryAllowlistEntry[];
}

// ── Repository access descriptor ─────────────────────────────────────────────

/**
 * Describes an authenticated repository access grant.
 * Emitted by mobile and consumed by the backend to issue
 * short-lived repository-scoped credentials.
 */
export interface RepositoryAccessGrant {
  readonly version: 1;
  /** The canonical repo ID. */
  readonly repoId: string;
  /** The provider's numeric user ID for the authenticated user. */
  readonly hostUserId: number;
  /** The provider login of the authenticated user. */
  readonly hostLogin: string;
  /** Whether the current token has write access (may require preflight). */
  readonly writeAccess: boolean;
  /** Expiry of this grant, if known (RFC 3339). Null means unknown. */
  readonly expiresAt: string | null;
  /** A proof-of-access token issued by the provider (e.g. GitHub app installation token). */
  readonly providerToken?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Check whether a canonical repo ID matches a given provider and owner.
 * Useful for filtering allowlists.
 */
export function matchesRepoId(
  id: CanonicalRepoId | string,
  provider: GitHostProvider,
  owner: string,
): boolean {
  const canonical = typeof id === 'string' ? validateCanonicalRepoId(id) : id;
  if (!canonical) return false;
  return canonical.provider === provider && canonical.owner === owner;
}

/**
 * Returns the set of owners (unique) represented in a list of canonical repo IDs.
 */
export function extractOwners(ids: readonly (CanonicalRepoId | string)[]): Set<string> {
  const owners = new Set<string>();
  for (const id of ids) {
    const canonical = typeof id === 'string' ? validateCanonicalRepoId(id) : id;
    if (canonical) owners.add(canonical.owner);
  }
  return owners;
}

/**
 * Returns the subset of repo IDs that match a given provider.
 */
export function filterByProvider(
  ids: readonly (CanonicalRepoId | string)[],
  provider: GitHostProvider,
): CanonicalRepoId[] {
  const result: CanonicalRepoId[] = [];
  for (const id of ids) {
    const canonical = typeof id === 'string' ? validateCanonicalRepoId(id) : id;
    if (canonical && canonical.provider === provider) result.push(canonical);
  }
  return result;
}
