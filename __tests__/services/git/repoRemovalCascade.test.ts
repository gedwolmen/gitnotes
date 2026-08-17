import { describe, expect, it } from '@jest/globals';

import type { GitRepository } from '../../../src/services/GitService';
import type { GitHostProvider } from '../../../src/services/git/GitHost';
import {
  buildProviderAccountCount,
  reposAffectedByRemovedHosts,
  type RemovedHostRef,
} from '../../../src/services/git/repoRemovalCascade';

function repo(overrides: Partial<GitRepository> & { path: string }): GitRepository {
  return {
    id: `id-${overrides.path}`,
    name: overrides.path,
    provider: 'github',
    ...overrides,
  };
}

describe('reposAffectedByRemovedHosts', () => {
  it('matches repos stamped with a removed host id', () => {
    const repositories = [
      repo({ path: 'octo/notes', hostId: 'host-1' }),
      repo({ path: 'octo/other', hostId: 'host-2' }),
      repo({ path: 'mono/draw', hostId: 'host-3' }),
    ];
    const removedHosts: RemovedHostRef[] = [
      { id: 'host-1', provider: 'github' },
      { id: 'host-3', provider: 'gitlab' },
    ];
    const counts = new Map<GitHostProvider, number>([['github', 1], ['gitlab', 1]]);

    const affected = reposAffectedByRemovedHosts(repositories, removedHosts, counts);

    expect(affected.map((r) => r.path).sort()).toEqual(['mono/draw', 'octo/notes']);
  });

  it('matches legacy unstamped repos by provider when only one account uses that provider', () => {
    const repositories = [
      repo({ path: 'legacy/notes' }),
      repo({ path: 'legacy/todos', provider: 'gitlab' }),
    ];
    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);

    const affected = reposAffectedByRemovedHosts(repositories, removedHosts, counts);

    expect(affected.map((r) => r.path)).toEqual(['legacy/notes']);
  });

  it('does NOT match legacy repos when multiple accounts use the same provider', () => {
    const repositories = [
      repo({ path: 'legacy/notes' }),
      repo({ path: 'legacy/todos' }),
    ];
    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 2]]);

    const affected = reposAffectedByRemovedHosts(repositories, removedHosts, counts);

    expect(affected).toEqual([]);
  });

  it('defaults a legacy repo with undefined provider to github', () => {
    const repositories: GitRepository[] = [
      { id: 'id-1', name: 'legacy', path: 'legacy/notes' },
    ];
    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);

    const affected = reposAffectedByRemovedHosts(repositories, removedHosts, counts);

    expect(affected.map((r) => r.path)).toEqual(['legacy/notes']);
  });

  it('does not mutate the input array', () => {
    const repositories = [
      repo({ path: 'octo/notes', hostId: 'host-1' }),
      repo({ path: 'octo/other', hostId: 'host-2' }),
    ];
    const removedHosts: RemovedHostRef[] = [{ id: 'host-1', provider: 'github' }];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);
    const snapshot = [...repositories];

    reposAffectedByRemovedHosts(repositories, removedHosts, counts);

    expect(repositories).toEqual(snapshot);
  });

  it('returns an empty array when no hosts are removed', () => {
    const repositories = [repo({ path: 'octo/notes', hostId: 'host-1' })];
    const counts = new Map<GitHostProvider, number>([['github', 1]]);

    const affected = reposAffectedByRemovedHosts(repositories, [], counts);

    expect(affected).toEqual([]);
  });
});

describe('buildProviderAccountCount', () => {
  it('counts multiple hosts with the same provider on one account as a single account', () => {
    const summaries = [
      {
        hosts: [
          { provider: 'github' as const },
          { provider: 'github' as const },
          { provider: 'gitlab' as const },
        ],
      },
    ];

    const counts = buildProviderAccountCount(summaries);

    expect(counts.get('github')).toBe(1);
    expect(counts.get('gitlab')).toBe(1);
  });

  it('counts distinct providers across multiple accounts', () => {
    const summaries = [
      { hosts: [{ provider: 'github' as const }] },
      { hosts: [{ provider: 'github' as const }, { provider: 'gitlab' as const }] },
      { hosts: [{ provider: 'gitea' as const }] },
    ];

    const counts = buildProviderAccountCount(summaries);

    expect(counts.get('github')).toBe(2);
    expect(counts.get('gitlab')).toBe(1);
    expect(counts.get('gitea')).toBe(1);
    expect(counts.get('forgejo')).toBeUndefined();
  });

  it('returns an empty map for no summaries', () => {
    const counts = buildProviderAccountCount([]);

    expect(counts.size).toBe(0);
  });
});
