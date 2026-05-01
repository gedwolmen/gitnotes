import React, { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import { pullAllFromRepos } from '../services/RepoPullService';
import { GitHubService } from '../services/GitHubService';
import { NoteSyncQueueService } from '../services/NoteSyncQueueService';
import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTodos } from '../contexts/TodoContext';
import { useRepos } from '../contexts/RepoContext';

export function StartupSyncGate({ children }: { children: React.ReactNode }) {
  const { refreshNotes } = useNotes();
  const { refreshCanvases } = useCanvases();
  const { refreshTodos } = useTodos();
  const { repositories } = useRepos();
  const lastSyncedSignature = useRef<string | null>(null);
  const isSyncing = useRef(false);

  // Track repository identity (sorted set of paths), not just length.
  // Previously the count-based guard meant remove+re-add or swapping
  // never re-triggered a pull because length didn't grow.
  const repoSignature = useMemo(
    () => [...repositories.map((r) => r.path)].sort().join('|'),
    [repositories],
  );

  useEffect(() => {
    if (isSyncing.current) return;
    if (lastSyncedSignature.current === repoSignature) return;
    if (repositories.length === 0) {
      lastSyncedSignature.current = repoSignature;
      return;
    }

    isSyncing.current = true;
    const targetSignature = repoSignature;

    (async () => {
      try {
        await GitHubService.initialize();
        await pullAllFromRepos();
      } catch (error) {
        console.warn('[StartupSync] Pull failed:', error);
      } finally {
        await Promise.all([
          refreshNotes(),
          refreshCanvases(),
          refreshTodos(),
        ]);
        lastSyncedSignature.current = targetSignature;
        isSyncing.current = false;
      }
    })();
  }, [repoSignature, repositories.length, refreshNotes, refreshCanvases, refreshTodos]);

  useEffect(() => {
    let drainInFlight = false;
    const drainAndRefresh = async () => {
      if (drainInFlight) return;
      drainInFlight = true;
      try {
        await GitHubService.initialize();
        if (!GitHubService.isAuthenticated()) return;
        const result = await NoteSyncQueueService.drain();
        if (result.succeeded > 0) {
          await refreshNotes();
        }
      } catch (error) {
        console.warn('[SyncDrain] Failed:', error);
      } finally {
        drainInFlight = false;
      }
    };

    drainAndRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') drainAndRefresh();
    });
    return () => sub.remove();
  }, [refreshNotes]);

  return <>{children}</>;
}
