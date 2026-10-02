/**
 * Token / PAT credential record.
 *
 * This is the existing credential shape used by the current `HostConnection`
 * token path. It is preserved unchanged so that token-based auth and
 * OAuth/GitHub App auth remain fully separate code paths with no shared
 * state that could cause one provider's failure to cascade to another.
 *
 * Stored under `host_token:*` (existing keys — NOT modified by this change).
 */

import type { BaseCredentialRecord } from './CredentialKind';

export interface TokenPatCredentialRecord extends BaseCredentialRecord {
  kind: 'token';
  /** Raw bearer token / PAT. Used as-is for HTTPS auth. */
  token: string;
  /** Login on this host (may differ across providers). */
  hostLogin: string;
  /** Numeric user id on the host. */
  hostUserId: number;
  /** Display name on the host. */
  name: string;
  /** Primary email on the host, if known. */
  email: string | null;
  /** Avatar URL on the host, if known. */
  avatarUrl: string | null;
}
