import React, { useEffect, useRef } from 'react';
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
  const lastSyncedCount = useRef(-1);
  const isSyncing = useRef(false);

  useEffect(() => {
    if (isSyncing.current) return;
    if (repositories.length <= lastSyncedCount.current) return;

    isSyncing.current = true;
    const targetCount = repositories.length;

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
        lastSyncedCount.current = targetCount;
        isSyncing.current = false;
      }
    })();
  }, [repositories.length, refreshNotes, refreshCanvases, refreshTodos]);

  useEffect(() => {
    const drainAndRefresh = async () => {
      try {
        await GitHubService.initialize();
        if (!GitHubService.isAuthenticated()) return;
        const result = await NoteSyncQueueService.drain();
        if (result.succeeded > 0) {
          await refreshNotes();
        }
      } catch (error) {
        console.warn('[SyncDrain] Failed:', error);
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
