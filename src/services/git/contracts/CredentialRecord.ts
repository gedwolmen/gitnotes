/**
 * Unified credential record — discriminated union of all credential kinds.
 *
 * Use `cred.kind` to narrow to the correct variant before accessing
 * kind-specific fields. This ensures exhaustive matching and prevents
 * cross-kind field access at compile time.
 */

import type { BaseCredentialRecord } from './CredentialKind';
import type { GitHubOAuthCredentialRecord } from './GitHubOAuthCredential';
import type { GitHubAppCredentialRecord } from './GitHubAppCredential';
import type { TokenPatCredentialRecord } from './TokenPatCredential';
import type { SshCredentialRecord } from './SshCredential';

/**
 * Discriminated union of all credential records stored by AccountStorage.
 * Switch on `kind` to access fields specific to each credential type.
 */
export type CredentialRecord =
  | GitHubOAuthCredentialRecord
  | GitHubAppCredentialRecord
  | TokenPatCredentialRecord
  | SshCredentialRecord;

/**
 * Map from CredentialKind to its record type.
 * Useful for generic credential handlers that need to reference the correct type.
 */
export type CredentialRecordFor<K extends BaseCredentialRecord['kind']> =
  & BaseCredentialRecord
  & (
    K extends 'oauth'
      ? GitHubOAuthCredentialRecord
      : K extends 'github_app'
        ? GitHubAppCredentialRecord
        : K extends 'token'
          ? TokenPatCredentialRecord
          : K extends 'ssh'
            ? SshCredentialRecord
            : never
  );

/** Check whether a raw record has a known credential kind. */
export function isKnownCredentialKind(kind: string): kind is BaseCredentialRecord['kind'] {
  return ['token', 'oauth', 'github_app', 'ssh'].includes(kind);
}
