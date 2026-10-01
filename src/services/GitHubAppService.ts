/**
 * GitHub App installation service for mobile.
 *
 * This service handles GitHub App installation using the Worker backend at
 * https://api.gitnotes.org/api/v1. The backend signs JWS tokens for the
 * GitHub App installation flow and manages installation tokens.
 *
 * Key invariants:
 * - Backend signs short-lived JWTs as the App `state` parameter
 * - JTI replay protection for renewal
 * - One-time renewal grants
 * - Fixed redirect to gitnotes://app/callback
 *
 * Callbacks:
 * - App callback: gitnotes://app/callback
 */

import { workerApi } from "./workerApi";

/**
 * Result of a successful GitHub App installation token exchange.
 */
export interface GitHubAppTokenResult {
  installationId: number;
  appId: number;
  appSlug: string;
  accountLogin: string;
  accountId: number;
  token: string;
  expiresAt: number;
  renewalGrantToken: string;
  renewalGrantExpiresAt: number;
}

/**
 * GitHub App installation service for mobile.
 *
 * Usage:
 * ```typescript
 * const service = new GitHubAppService();
 *
 * // Step 1: Get the GitHub App installation URL
 * const { installationUrl, state } = await service.getInstallUrl();
 *
 * // Step 2: Open the URL in a browser
 * await WebBrowser.openBrowserAsync(installationUrl);
 *
 * // Step 3: After user approves installation, handle the callback
 * const result = await service.handleCallback(installationId, state, selectedRepoIds);
 *
 * // Step 4: Use the installation token
 * const { token, expiresAt } = result;
 *
 * // Step 5: Before token expires, renew using the grant token
 * const renewed = await service.renew(installationId, renewalGrantToken, jti);
 * ```
 */
export class GitHubAppService {
  /**
   * Get the GitHub App installation URL.
   *
   * @param selectedRepositoryIds - Optional array of repository IDs to pre-select
   * @param signal - Optional AbortSignal for cancellation
   * @returns Object containing installation URL and state for CSRF protection
   * @throws WorkerApiError if the backend returns an error
   */
  async getInstallUrl(
    selectedRepositoryIds?: number[],
    signal?: AbortSignal
  ): Promise<{ installationUrl: string; state: string }> {
    const response = await workerApi.app.getInstallUrl(
      {
        selected_repository_ids: selectedRepositoryIds,
      },
      signal
    );

    return {
      installationUrl: response.installation_url,
      state: response.state,
    };
  }

  /**
   * Handle the callback after user approves GitHub App installation.
   *
   * @param installationId - Numeric installation ID from the deep link
   * @param state - State parameter from the deep link
   * @param selectedRepositoryIds - Repository IDs selected during installation
   * @param signal - Optional AbortSignal for cancellation
   * @returns Installation token and metadata
   * @throws WorkerApiError if the callback fails
   */
  async handleCallback(
    installationId: number,
    state: string,
    selectedRepositoryIds?: number[],
    signal?: AbortSignal
  ): Promise<GitHubAppTokenResult> {
    const response = await workerApi.app.callback(
      {
        installation_id: installationId,
        state,
        selected_repository_ids: selectedRepositoryIds,
      },
      signal
    );

    return {
      installationId: response.installation_id,
      appId: response.app_id,
      appSlug: response.app_slug,
      accountLogin: response.account_login,
      accountId: response.account_id,
      token: response.token,
      expiresAt: response.expires_at,
      renewalGrantToken: response.renewal_grant_token,
      renewalGrantExpiresAt: response.renewal_grant_expires_at,
    };
  }

  /**
   * Renew an installation token using a one-time renewal grant.
   *
   * @param installationId - Numeric installation ID
   * @param renewalGrantToken - One-time grant token from initial installation
   * @param jti - Unique JTI for replay protection
   * @param signal - Optional AbortSignal for cancellation
   * @returns New installation token and metadata
   * @throws WorkerApiError if renewal fails
   */
  async renew(
    installationId: number,
    renewalGrantToken: string,
    jti: string,
    signal?: AbortSignal
  ): Promise<GitHubAppTokenResult> {
    const response = await workerApi.app.renew(
      {
        installation_id: installationId,
        renewal_grant_token: renewalGrantToken,
        jti,
      },
      signal
    );

    return {
      installationId: response.installation_id,
      appId: response.app_id,
      appSlug: response.app_slug,
      accountLogin: response.account_login,
      accountId: response.account_id,
      token: response.token,
      expiresAt: response.expires_at,
      renewalGrantToken: response.renewal_grant_token,
      renewalGrantExpiresAt: response.renewal_grant_expires_at,
    };
  }
}

/**
 * Singleton instance for convenience.
 */
export const gitHubAppService = new GitHubAppService();
