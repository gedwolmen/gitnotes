import React, { useEffect, useRef } from 'react';
import { pullAllFromRepos } from '../services/RepoPullService';
import { useNotes } from '../contexts/NoteContext';
import { useCanvases } from '../contexts/CanvasContext';
import { useTodos } from '../contexts/TodoContext';

export function StartupSyncGate({ children }: { children: React.ReactNode }) {
  const { refreshNotes } = useNotes();
  const { refreshCanvases } = useCanvases();
  const { refreshTodos } = useTodos();
  const hasSynced = useRef(false);

  useEffect(() => {
    if (hasSynced.current) return;
    hasSynced.current = true;

    (async () => {
      try {
        await pullAllFromRepos();
      } catch (error) {
        console.warn('[StartupSync] Pull failed:', error);
      } finally {
        await Promise.all([
          refreshNotes(),
          refreshCanvases(),
          refreshTodos(),
        ]);
      }
    })();
  }, [refreshNotes, refreshCanvases, refreshTodos]);

  return <>{children}</>;
}
