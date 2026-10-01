/**
 * Credential contract types for independent provider authentication.
 *
 * These types define the wire shape between mobile storage, the backend
 * OAuth/GitHub App services, and the native Git credential engine.
 * They are deliberately separate from the existing HostConnection token
 * storage so that:
 *
 * 1. OAuth and GitHub App credentials never share keys with PAT/SSH.
 * 2. One provider's failure (backend down, token expired) cannot cascade
 *    to unrelated providers (GitLab, Gitea, Forgejo, SSH).
 * 3. Each credential kind is validated exhaustively via discriminated unions.
 */

// Credential kind
export { CREDENTIAL_KINDS, type CredentialKind, type CredentialValidity, type CredentialInvalidReason } from './CredentialKind';
export { validateCredentialRecord } from './CredentialKind';

// OAuth
export { type GitHubOAuthCredentialRecord, type OAuthExpiry, type OAuthRenewalMetadata, type OAuthErrorCode, type GitHubOAuthAvailability, validateOAuthCredential, isOAuthExpired, isRefreshExpired } from './GitHubOAuthCredential';

// GitHub App
export {
  type GitHubInstallationId,
  type GitHubAppId,
  type InstallationTokenExpiry,
  type SelectedRepository,
  type AppRenewalMetadata,
  type GitHubAppErrorCode,
  type GitHubAppAvailability,
  type GitHubAppCredentialRecord,
  validateGitHubAppCredential,
  isInstallationTokenExpired,
  isGrantExpired,
  hasEmptyRepositorySelection,
} from './GitHubAppCredential';

// Token / PAT (existing shape, formalized as a credential record)
export { type TokenPatCredentialRecord } from './TokenPatCredential';

// SSH
export { type SshCredentialRecord } from './SshCredential';

// Unified
export { type CredentialRecord, type CredentialRecordFor, isKnownCredentialKind } from './CredentialRecord';

// Provider availability
export { type ProviderAuthAvailability, type GlobalAuthAvailability, computeAllUnavailable } from './ProviderAuthAvailability';
