import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { GitSyncService, GitSyncResult } from '../services/GitSyncService';

export type SyncStatus = 'idle' | 'pulling' | 'merging' | 'pushing' | 'error';

interface GitSyncContextType {
  syncStatus: SyncStatus;
  lastSyncTime: Date | null;
  pendingChanges: number;
  errorMessage: string | null;

  sync: (repoPath: string, author: {name: string; email: string}, token?: string) => Promise<boolean>;
  checkStatus: (repoPath: string) => Promise<void>;
  clearError: () => void;
}

const GitSyncContext = createContext<GitSyncContextType | undefined>(undefined);

interface GitSyncProviderProps {
  children: ReactNode;
}

export function GitSyncProvider({ children }: GitSyncProviderProps) {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pendingChanges, setPendingChanges] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sync = useCallback(async (
    repoPath: string,
    author: {name: string; email: string},
    token?: string
  ): Promise<boolean> => {
    try {
      setErrorMessage(null);

      setSyncStatus('pulling');
      const pullResult: GitSyncResult = await GitSyncService.pull(repoPath, { author, token });
      if (!pullResult.success) {
        setSyncStatus('error');
        setErrorMessage(pullResult.error || 'Pull failed');
        return false;
      }

      setSyncStatus('merging');
      const commitResult: GitSyncResult = await GitSyncService.commit(
        repoPath,
        'Auto-sync: Update notes',
        { author, token }
      );
      if (!commitResult.success && commitResult.error !== 'nothing to commit') {
        setSyncStatus('error');
        setErrorMessage(commitResult.error || 'Commit failed');
        return false;
      }

      setSyncStatus('pushing');
      const pushResult: GitSyncResult = await GitSyncService.push(repoPath, { author, token });
      if (!pushResult.success) {
        setSyncStatus('error');
        setErrorMessage(pushResult.error || 'Push failed');
        return false;
      }

      setSyncStatus('idle');
      setLastSyncTime(new Date());
      setPendingChanges(0);
      return true;
    } catch (error) {
      setSyncStatus('error');
      setErrorMessage(error instanceof Error ? error.message : 'Unknown sync error');
      return false;
    }
  }, []);

  const checkStatus = useCallback(async (repoPath: string) => {
    try {
      const statuses = await GitSyncService.status(repoPath);
      setPendingChanges(statuses.length);
    } catch (error) {
      console.error('[GitSyncContext] Failed to check status:', error);
    }
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    setSyncStatus('idle');
  }, []);

  const value = {
    syncStatus,
    lastSyncTime,
    pendingChanges,
    errorMessage,
    sync,
    checkStatus,
    clearError,
  };

  return (
    <GitSyncContext.Provider value={value}>
      {children}
    </GitSyncContext.Provider>
  );
}

export function useGitSync() {
  const context = useContext(GitSyncContext);
  if (!context) {
    throw new Error('useGitSync must be used within GitSyncProvider');
  }
  return context;
}