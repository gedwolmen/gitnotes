/**
 * RepositoryAccessPolicyService.ts
 *
 * Manages per-host repository access policies with explicit selection enforcement.
 * Persists under lowercase host key; last_modified_at is local-only.
 *
 * Key invariants:
 * - Every operation (clone, fetch, pull, push, queue) requires explicit repo selection
 * - Write verification is cached per-repo and invalidated on 401/403/rescan
 * - PAT/SSH/classic credential support is preserved
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { StorageService } from './StorageService';
import { parseRepoPath } from '../utils/gitPathParser';
import {
  type RepositoryAccessPolicy,
  type CanonicalRepoId,
  createRepositoryAccessPolicy,
  isRepoAllowed,
  isRepoWriteVerified,
  addRepoToPolicy,
  removeRepoFromPolicy,
  verifyWriteForRepo,
  computeInstanceKey,
} from './git/contracts';

const POLICY_STORAGE_PREFIX = '@gitnotes:repo_policy:';

function normalizeHostKey(hostId: string): string {
  return hostId.toLowerCase();
}

function policyStorageKey(hostId: string): string {
  return `${POLICY_STORAGE_PREFIX}${normalizeHostKey(hostId)}`;
}

async function loadPolicyFromStorage(hostId: string): Promise<RepositoryAccessPolicy> {
  const key = policyStorageKey(hostId);
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return createRepositoryAccessPolicy(hostId);
    }
    const parsed = JSON.parse(raw) as RepositoryAccessPolicy;
    return {
      hostId: parsed.hostId ?? hostId,
      allowedRepositories: Array.isArray(parsed.allowedRepositories) ? parsed.allowedRepositories : [],
      writeVerifiedRepositories: Array.isArray(parsed.writeVerifiedRepositories) ? parsed.writeVerifiedRepositories : [],
      lastModifiedAt: typeof parsed.lastModifiedAt === 'number' ? parsed.lastModifiedAt : Date.now(),
    };
  } catch {
    return createRepositoryAccessPolicy(hostId);
  }
}

async function savePolicyToStorage(policy: RepositoryAccessPolicy): Promise<void> {
  const key = policyStorageKey(policy.hostId);
  try {
    await AsyncStorage.setItem(key, JSON.stringify(policy));
  } catch (error) {
    console.warn('[RepositoryAccessPolicyService] Failed to persist policy:', error);
  }
}

class RepositoryNotSelectedError extends Error {
  constructor(
    public readonly hostId: string,
    public readonly repoId: CanonicalRepoId,
  ) {
    super(`Repository ${repoId.id} is not selected for host ${hostId}. Explicit selection is required before any operation.`);
    this.name = 'RepositoryNotSelectedError';
  }
}

class WriteNotVerifiedError extends Error {
  constructor(
    public readonly hostId: string,
    public readonly repoId: CanonicalRepoId,
  ) {
    super(`Repository ${repoId.id} write access is not verified for host ${hostId}.`);
    this.name = 'WriteNotVerifiedError';
  }
}

const policyCache = new Map<string, RepositoryAccessPolicy>();
let cacheInitialized = false;

const RepositoryAccessPolicyService = {
  async initialize(): Promise<void> {
    if (cacheInitialized) return;
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const policyKeys = allKeys.filter((k) => k.startsWith(POLICY_STORAGE_PREFIX));
      await Promise.all(
        policyKeys.map(async (key) => {
          try {
            const raw = await AsyncStorage.getItem(key);
            if (raw) {
              const policy = JSON.parse(raw) as RepositoryAccessPolicy;
              policyCache.set(policy.hostId, policy);
            }
          } catch {
            // skip invalid entries
          }
        }),
      );
      cacheInitialized = true;
    } catch {
      cacheInitialized = true;
    }
  },

  async getPolicy(hostId: string): Promise<RepositoryAccessPolicy> {
    const cached = policyCache.get(hostId);
    if (cached) return cached;
    if (!cacheInitialized) {
      await this.initialize();
      const recached = policyCache.get(hostId);
      if (recached) return recached;
    }

    const policy = await loadPolicyFromStorage(hostId);
    policyCache.set(hostId, policy);
    return policy;
  },

  getNormalizedHostKey(hostId: string): string {
    return normalizeHostKey(hostId);
  },

  async isRepoAllowed(hostId: string, repoId: CanonicalRepoId): Promise<boolean> {
    const policy = await this.getPolicy(hostId);
    return isRepoAllowed(policy, repoId);
  },

  async isRepoWriteVerified(hostId: string, repoId: CanonicalRepoId): Promise<boolean> {
    const policy = await this.getPolicy(hostId);
    return isRepoWriteVerified(policy, repoId);
  },

  async selectRepository(
    hostId: string,
    repoId: CanonicalRepoId,
    options?: { writeVerified?: boolean },
  ): Promise<void> {
    const policy = await this.getPolicy(hostId);
    addRepoToPolicy(policy, repoId);
    if (options?.writeVerified) {
      verifyWriteForRepo(policy, repoId);
    }
    await savePolicyToStorage(policy);
  },

  async deselectRepository(hostId: string, repoId: CanonicalRepoId): Promise<void> {
    const policy = await this.getPolicy(hostId);
    removeRepoFromPolicy(policy, repoId);
    await savePolicyToStorage(policy);
  },

  async markWriteVerified(hostId: string, repoId: CanonicalRepoId): Promise<void> {
    const policy = await this.getPolicy(hostId);
    verifyWriteForRepo(policy, repoId);
    await savePolicyToStorage(policy);
  },

  async ensurePolicy(hostId: string): Promise<RepositoryAccessPolicy> {
    const policy = await this.getPolicy(hostId);
    return policy;
  },

  makeCanonicalRepoId(
    provider: string,
    instanceBaseUrl: string | null,
    owner: string,
    repo: string,
  ): CanonicalRepoId {
    const instanceKey = computeInstanceKey(instanceBaseUrl);
    return {
      version: 1,
      id: `${provider}:${instanceKey}/${owner}/${repo}`,
      provider: provider as CanonicalRepoId['provider'],
      instanceKey,
      owner,
      repo,
      displayName: `${owner}/${repo}`,
    };
  },

  parseCanonicalRepoId(id: string): CanonicalRepoId | null {
    const { parseCanonicalRepoId: parse } = require('./git/contracts');
    return parse(id);
  },

  async resolveHostIdForRepoPath(repoPath: string): Promise<string | null> {
    const repos = await StorageService.getSavedRepositories();
    const repo = repos.find((r) => r.path === repoPath);
    return repo?.hostId ?? null;
  },

  async invalidateWriteVerificationForRepoPath(repoPath: string, provider: string, instanceBaseUrl: string | null): Promise<void> {
    const parsed = parseRepoPath(repoPath);
    if (!parsed) return;

    const hostId = await this.resolveHostIdForRepoPath(repoPath);
    if (!hostId) return;

    const canonicalRepoId = this.makeCanonicalRepoId(provider, instanceBaseUrl, parsed.owner, parsed.repo);
    const policy = await this.getPolicy(hostId);
    policy.writeVerifiedRepositories = policy.writeVerifiedRepositories.filter((r) => r.id !== canonicalRepoId.id);
    await savePolicyToStorage(policy);
  },

  async invalidateAllWriteVerificationsForHost(hostId: string): Promise<void> {
    const policy = await this.getPolicy(hostId);
    policy.writeVerifiedRepositories = [];
    await savePolicyToStorage(policy);
  },

  async invalidateAllWriteVerificationsGlobal(): Promise<void> {
    const hostIds = Array.from(policyCache.keys());
    await Promise.all(hostIds.map((hostId) => this.invalidateAllWriteVerificationsForHost(hostId)));
  },

  async clearAllPolicies(): Promise<void> {
    policyCache.clear();
    cacheInitialized = false;
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const policyKeys = allKeys.filter((k) => k.startsWith(POLICY_STORAGE_PREFIX));
      await AsyncStorage.multiRemove(policyKeys);
    } catch (error) {
      console.warn('[RepositoryAccessPolicyService] Failed to clear policies:', error);
    }
  },

  async requireRepoSelectedForPath(repoPath: string, provider: string, instanceBaseUrl: string | null): Promise<void> {
    const parsed = parseRepoPath(repoPath);
    if (!parsed) return;

    const hostId = await this.resolveHostIdForRepoPath(repoPath);
    if (!hostId) return;

    const canonicalRepoId = this.makeCanonicalRepoId(provider, instanceBaseUrl, parsed.owner, parsed.repo);
    await requireRepoSelected(hostId, canonicalRepoId);
  },

  /**
   * Gate function: ensures a repository is explicitly selected before any operation.
   * Throws RepositoryNotSelectedError if the repo is not in the policy allowlist.
   *
   * This is the central enforcement point for the "explicit selection required" invariant.
   * Call this before clone, fetch, pull, push, or queue operations.
   */
  async requireRepoSelected(
    hostId: string,
    repoId: CanonicalRepoId,
  ): Promise<void> {
    const policy = await this.getPolicy(hostId);
    if (!isRepoAllowed(policy, repoId)) {
      throw new RepositoryNotSelectedError(hostId, repoId);
    }
  },

  /**
   * Gate function: ensures a repository has verified write access before any write operation.
   * Throws WriteNotVerifiedError if write has not been verified.
   *
   * Call this before push or any operation that requires write access.
   */
  async requireWriteVerified(
    hostId: string,
    repoId: CanonicalRepoId,
  ): Promise<void> {
    const policy = await this.getPolicy(hostId);
    if (!isRepoAllowed(policy, repoId)) {
      throw new RepositoryNotSelectedError(hostId, repoId);
    }
    if (!isRepoWriteVerified(policy, repoId)) {
      throw new WriteNotVerifiedError(hostId, repoId);
    }
  },

  /**
   * Check if an operation can proceed (for non-throwing callers).
   */
  async canProceed(
    hostId: string,
    repoId: CanonicalRepoId,
    requireWrite?: boolean,
  ): Promise<boolean> {
    try {
      if (requireWrite) {
        await this.requireWriteVerified(hostId, repoId);
      } else {
        await this.requireRepoSelected(hostId, repoId);
      }
      return true;
    } catch {
      return false;
    }
  },
};

export { RepositoryAccessPolicyService, RepositoryNotSelectedError, WriteNotVerifiedError };
export async function requireRepoSelected(
  hostId: string,
  repoId: CanonicalRepoId,
): Promise<void> {
  return RepositoryAccessPolicyService.requireRepoSelected(hostId, repoId);
}

export async function requireWriteVerified(
  hostId: string,
  repoId: CanonicalRepoId,
): Promise<void> {
  return RepositoryAccessPolicyService.requireWriteVerified(hostId, repoId);
}

export async function canProceed(
  hostId: string,
  repoId: CanonicalRepoId,
  requireWrite?: boolean,
): Promise<boolean> {
  return RepositoryAccessPolicyService.canProceed(hostId, repoId, requireWrite);
}

export default RepositoryAccessPolicyService;
