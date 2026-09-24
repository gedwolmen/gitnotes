/**
 * Versioned, typed JSON contracts for Git host provider capabilities.
 *
 * These types are shared between mobile and backend. They describe WHAT
 * each provider supports — not HOW the provider flow is implemented.
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

import type { GitHostProvider } from '../GitHost';

/** API version strings per provider. */
export type ProviderApiVersion = 'v3' | 'v4' | 'v1';

/**
 * Capabilities a provider adapter must declare.
 * Handlers use these caps to branch without instanceof chains.
 */
export interface ProviderCapabilities {
  /** Provider identifier matching GitHostProvider. */
  readonly provider: GitHostProvider;
  /** REST API version string used by this provider. */
  readonly apiVersion: ProviderApiVersion;
  /** Whether this provider issues OAuth tokens with refresh grants. */
  readonly supportsOAuthRefresh: boolean;
  /**
   * Whether the provider supports GitHub-style fine-grained PATs.
   * When false, only classic PATs are accepted.
   */
  readonly supportsFineGrainedPat: boolean;
  /**
   * Whether the provider supports SSH key authentication.
   * When true, the credential adapter accepts SSH key credential variants.
   */
  readonly supportsSsh: boolean;
  /**
   * Whether the provider's API returns `x-accepted-github-permissions`-style
   * capability headers on 403 responses. Used for fast-path preflight.
   */
  readonly supportsCapabilityHeaders: boolean;
  /**
   * Self-hosted instance base URL, or null for SaaS defaults.
   * Used to build the canonical instance key in repository identifiers.
   */
  readonly instanceBaseUrl: string | null;
}

/** Maps a provider to its default (SaaS) API base URL. */
export const PROVIDER_API_BASES: Record<GitHostProvider, string> = {
  github: 'https://api.github.com',
  gitlab: 'https://gitlab.com/api/v4',
  gitea: 'https://gitea.com/api/v1',
  forgejo: 'https://codeberg.org/api/v1',
};

/**
 * Default capabilities for each known provider.
 * Self-hosted instances override `instanceBaseUrl` at runtime.
 */
export const DEFAULT_CAPABILITIES: Record<GitHostProvider, Omit<ProviderCapabilities, 'instanceBaseUrl'>> = {
  github: {
    provider: 'github',
    apiVersion: 'v3',
    supportsOAuthRefresh: true,
    supportsFineGrainedPat: true,
    supportsSsh: true,
    supportsCapabilityHeaders: true,
  },
  gitlab: {
    provider: 'gitlab',
    apiVersion: 'v4',
    supportsOAuthRefresh: true,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
  gitea: {
    provider: 'gitea',
    apiVersion: 'v1',
    supportsOAuthRefresh: false,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
  forgejo: {
    provider: 'forgejo',
    apiVersion: 'v1',
    supportsOAuthRefresh: false,
    supportsFineGrainedPat: false,
    supportsSsh: true,
    supportsCapabilityHeaders: false,
  },
};

/**
 * Build a ProviderCapabilities value for a specific instance.
 * SaaS: pass null as instanceBaseUrl.
 * Self-hosted: pass the instance base URL.
 */
export function makeCapabilities(
  provider: GitHostProvider,
  instanceBaseUrl: string | null,
): ProviderCapabilities {
  const defaults = DEFAULT_CAPABILITIES[provider];
  return {
    ...defaults,
    instanceBaseUrl,
  };
}
