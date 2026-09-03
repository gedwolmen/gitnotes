import { useCallback, useEffect, useRef, useState } from 'react';

import * as GitEngine from '@/services/git/engine/GitEngine';
import { useRepoStore } from '@/stores/repoStore';
import type { GitRepository } from '@/services/GitService';

export type GitStateMode = 'conflicts' | 'changes' | 'push' | 'clean';

export interface RepoGitState {
  repoId: string;
  repoPath: string;
  /** Working-tree changes (uncommitted, not yet in the index). */
  uncommitted: number;
  /** Files staged in the index but not yet committed. */
  staged: number;
  /** Unpushed commits (engine ahead-of-remote count). */
  ahead: number;
  /** Commits the remote is ahead by. */
  behind: number;
  /** Current branch name from the engine. */
  currentBranch: string;
  /** True when the engine reports unresolved conflict entries. */
  conflicts: boolean;
  /** True while the latest poll attempt is in flight. */
  loading: boolean;
  /** Wall-clock time of the most recent change sample (used to order repos). */
  sampledAt: number;
}

export interface AggregatedGitState {
  perRepo: Map<string, RepoGitState>;
  totalUncommitted: number;
  totalStaged: number;
  totalAhead: number;
  anyConflicts: boolean;
  anyBusy: boolean;
  /**
   * Repo with the most "active" state — conflicts > changes > push > ahead.
   * Used by the floating button to navigate to the repo the user cares about
   * right now. Null when everything is clean.
   */
  latestChangedRepoId: string | null;
  /**
   * Coarse color/state for the floating button:
   *   - conflicts (red): anyConflicts
   *   - changes  (green): uncommitted or staged anywhere, no conflicts
   *   - push     (blue): only ahead > 0, no changes and no conflicts
   *   - clean    (muted): everything clean
   */
  mode: GitStateMode;
  refresh: () => Promise<void>;
}

const POLL_MS = 4000;

/**
 * Polls the engine for every cloned repo in the store and aggregates:
 *   - uncommitted / staged (from `statuses()`)
 *   - ahead / behind    (from `status()`)
 *   - conflicts         (from `getConflicts()`)
 *
 * Single source of truth for the floating button's color/tap/hold behavior
 * and for the per-repo badges in the repo picker. Polling is cheap; results
 * are batched so the UI re-renders once per tick.
 */
export function useAllReposStatus(pollMs: number = POLL_MS): AggregatedGitState {
  const repositories = useRepoStore((s) => s.repositories);
  const [perRepo, setPerRepo] = useState<Map<string, RepoGitState>>(new Map());
  const mountedRef = useRef(true);
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const results = await Promise.all(
      repositories.map(async (repo: GitRepository) => {
        const sampledAt = Date.now();
        const [status, files, conflicts] = await Promise.all([
          GitEngine.status(repo.id, repo.path).catch(() => null),
          GitEngine.statuses(repo.path).catch(() => [] as Awaited<ReturnType<typeof GitEngine.statuses>>),
          GitEngine.conflicts(repo.path).catch(() => [] as Awaited<ReturnType<typeof GitEngine.conflicts>>),
        ]);

        let uncommitted = 0;
        let staged = 0;
        for (const file of files) {
          if (file.staged) staged += 1;
          else if (file.status !== 'Unmodified') uncommitted += 1;
        }

        return {
          repoId: repo.id,
          repoPath: repo.path,
          uncommitted,
          staged,
          ahead: status?.ahead ?? 0,
          behind: status?.behind ?? 0,
          currentBranch: status?.currentBranch ?? '',
          conflicts: conflicts.length > 0,
          loading: false,
          sampledAt,
        } satisfies RepoGitState;
      }),
    );

    if (!mountedRef.current || seqRef.current !== seq) return;
    const next = new Map<string, RepoGitState>();
    for (const entry of results) next.set(entry.repoId, entry);
    setPerRepo(next);
  }, [repositories]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (repositories.length === 0) {
      return () => {
        mountedRef.current = false;
      };
    }
    const timer = setInterval(() => void refresh(), pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [refresh, pollMs, repositories.length]);

  return aggregate(perRepo, refresh);
}

/**
 * Pure aggregator: collapses per-repo state into the shape the UI consumes.
 * Exported for unit tests and for callers that already have a snapshot.
 */
export function aggregate(
  perRepo: Map<string, RepoGitState>,
  refresh: AggregatedGitState['refresh'] = async () => undefined,
): AggregatedGitState {
  let totalUncommitted = 0;
  let totalStaged = 0;
  let totalAhead = 0;
  let anyConflicts = false;
  let anyBusy = false;
  let latestChangedRepoId: string | null = null;
  let latestScore = -1;
  let latestSampledAt = 0;

  for (const entry of perRepo.values()) {
    totalUncommitted += entry.uncommitted;
    totalStaged += entry.staged;
    totalAhead += entry.ahead;
    if (entry.conflicts) anyConflicts = true;
    if (entry.loading) anyBusy = true;

    // Score encodes priority for navigation: conflicts > changes > staged > ahead > clean.
    // Higher score wins; ties broken by sampledAt (most recent first).
    const score =
      entry.conflicts ? 4
        : entry.uncommitted > 0 ? 3
        : entry.staged > 0 ? 2
        : entry.ahead > 0 ? 1
        : 0;
    if (score <= 0) continue;
    if (score > latestScore || (score === latestScore && entry.sampledAt > latestSampledAt)) {
      latestScore = score;
      latestSampledAt = entry.sampledAt;
      latestChangedRepoId = entry.repoId;
    }
  }

  const mode: GitStateMode = anyConflicts
    ? 'conflicts'
    : totalUncommitted > 0 || totalStaged > 0
      ? 'changes'
      : totalAhead > 0
        ? 'push'
        : 'clean';

  return {
    perRepo,
    totalUncommitted,
    totalStaged,
    totalAhead,
    anyConflicts,
    anyBusy,
    latestChangedRepoId,
    mode,
    refresh,
  };
}