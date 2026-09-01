import { useCallback, useEffect, useRef, useState } from 'react';

import * as GitEngine from '@/services/git/engine/GitEngine';
import type { RepoStatus } from '@/services/git/engine/GitEngine';

export interface UseGitRepoStatusResult {
  /** Latest engine status for the repo (null until the first poll resolves). */
  status: RepoStatus | null;
  /** Number of unpushed commits (engine ahead-of-remote count). */
  ahead: number;
  /** Number of commits the remote is ahead by. */
  behind: number;
  /** True while the first status load is in flight. */
  loading: boolean;
  /** Re-poll the engine immediately (e.g. after a commit or push). */
  refresh: () => Promise<void>;
}

/**
 * Polls the engine for a repo's ahead/behind status on an interval so the
 * floating git button's halo reflects unpushed commits without any manual
 * refresh. Polling is cheap (single flock probe) and matches the "poll or
 * subscribe to a store" contract from the plan.
 */
export function useGitRepoStatus(
  repoId: string | null,
  repoPath: string | null,
  pollMs = 4000,
): UseGitRepoStatusResult {
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    if (!repoId || !repoPath) {
      setStatus(null);
      setLoading(false);
      return;
    }
    try {
      const next = await GitEngine.status(repoId, repoPath);
      if (mountedRef.current) {
        setStatus(next);
        setLoading(false);
      }
    } catch {
      // A failed probe (repo removed mid-poll, transient lock) just keeps the
      // last known status; the button degrades gracefully.
      if (mountedRef.current) setLoading(false);
    }
  }, [repoId, repoPath]);

  useEffect(() => {
    mountedRef.current = true;
    void refresh();
    if (!repoId || !repoPath) {
      return () => {
        mountedRef.current = false;
      };
    }
    const timer = setInterval(() => void refresh(), pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(timer);
    };
  }, [repoId, repoPath, pollMs, refresh]);

  return {
    status,
    ahead: status?.ahead ?? 0,
    behind: status?.behind ?? 0,
    loading,
    refresh,
  };
}
