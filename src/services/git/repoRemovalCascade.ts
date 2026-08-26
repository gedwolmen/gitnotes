// Stub for deleted repoRemovalCascade module

import type { GitRepository } from '../GitService';
import type { GitHostProvider } from './GitHost';

export interface RemovedHostRef {
  hostId: string;
  provider: GitHostProvider;
}

export const reposAffectedByRemovedHosts = (
  _repositories: GitRepository[],
  _removedHosts: RemovedHostRef[],
  _providerAccountCount: ReadonlyMap<GitHostProvider, number>
): GitRepository[] => [];

export const buildProviderAccountCount = (_accountSummaries: unknown[]): ReadonlyMap<GitHostProvider, number> => new Map();
