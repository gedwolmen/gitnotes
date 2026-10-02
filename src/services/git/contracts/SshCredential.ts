/**
 * SSH key credential record.
 *
 * Mirrors the existing SSH key storage in AccountStorage but in a typed
 * credential-record form so the credential-kind discriminator can be
 * applied uniformly.
 *
 * Stored under `ssh_private_*` / `ssh_public_*` keys (existing keys).
 * The private key never leaves SecureStore.
 */

import type { BaseCredentialRecord } from './CredentialKind';

export interface SshCredentialRecord extends BaseCredentialRecord {
  kind: 'ssh';
  /** Private key in OpenSSH PEM format. */
  privateKey: string;
  /** Public key in OpenSSH authorized_keys format. */
  publicKey: string;
  /** Username for SSH auth (typically 'git'). */
  username: string;
}
