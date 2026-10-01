/**
 * Explicit credential-kind discriminator.
 *
 * Every credential stored in AccountStorage carries a `kind` field so that
 * code consuming it can switch on the exact variant rather than probing for
 * the presence/absence of fields.
 *
 * The four variants:
 * - `token`  — legacy PAT / token-based auth, backed by a raw bearer token.
 * - `oauth`  — GitHub OAuth 2.0 / PKCE flow, exchanged via the backend.
 * - `github_app` — GitHub App installation, token issued/renewed by backend.
 * - `ssh`    — SSH keypair (ed25519), loaded into the native Git engine.
 */
export const CREDENTIAL_KINDS = ['token', 'oauth', 'github_app', 'ssh'] as const;

export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

/** Per-kind validity result used during credential validation. */
export type CredentialValidity =
  | { valid: true }
  | { valid: false; reason: CredentialInvalidReason };

export type CredentialInvalidReason =
  | 'unknown_kind'
  | 'empty_repository_selection'
  | 'expired_metadata'
  | 'invalid_renewal_metadata'
  | 'cross_provider_reuse'
  | 'cross_account_reuse'
  | 'installation_inactive'
  | 'corrupt_record';

/** Shared shape for all credential records stored by AccountStorage. */
export interface BaseCredentialRecord {
  /** Stable id; format `<hostId>:<kind>`. */
  id: string;
  hostId: string;
  kind: CredentialKind;
  addedAt: number;
}

/** Validate a credential record's metadata without making network calls.
 *
 * Returns `valid: true` when the record is structurally sound and not
 * obviously stale. Network-layer validation (token exchange, installation
 * token refresh) happens separately in the service layer.
 */
export function validateCredentialRecord(
  record: BaseCredentialRecord,
): CredentialValidity {
  if (!CREDENTIAL_KINDS.includes(record.kind)) {
    return { valid: false, reason: 'unknown_kind' };
  }
  if (!record.id || !record.hostId) {
    return { valid: false, reason: 'corrupt_record' };
  }
  return { valid: true };
}
