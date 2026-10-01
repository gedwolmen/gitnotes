/**
 * Feature-scoped provider availability state.
 *
 * Each independent auth mechanism carries its own availability/error state
 * so that a failure in one (e.g. GitHub OAuth backend unreachable) does NOT
 * disable unrelated providers (GitLab token, Gitea PAT, SSH) in the UI.
 */

import type { GitHostProvider } from '../GitHost';
import type { GitHubOAuthAvailability } from './GitHubOAuthCredential';
import type { GitHubAppAvailability } from './GitHubAppCredential';

/**
 * Provider-level auth availability.
 * Each field is independent — one provider going down does not affect others.
 */
export interface ProviderAuthAvailability {
  /** Provider this availability snapshot is for. */
  provider: GitHostProvider;
  /** True when at least one credential for this provider is usable. */
  isAvailable: boolean;
  /** GitHub-specific OAuth availability; undefined for non-GitHub providers. */
  oauth?: GitHubOAuthAvailability;
  /** GitHub-specific App installation availability; undefined for non-GitHub. */
  githubApp?: GitHubAppAvailability;
}

/**
 * Global auth state that aggregates per-provider snapshots.
 * Designed to be read by the UI without causing cascading disable states.
 */
export interface GlobalAuthAvailability {
  providers: Record<GitHostProvider, ProviderAuthAvailability>;
  /** true only when ALL providers are simultaneously unavailable. */
  allUnavailable: boolean;
}

/** Derive the global all-unavailable flag from per-provider states. */
export function computeAllUnavailable(
  providers: Record<GitHostProvider, ProviderAuthAvailability>,
): boolean {
  return Object.values(providers).every((p) => !p.isAvailable);
}
