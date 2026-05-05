import React, { createContext, ReactNode, useCallback, useContext, useMemo, useState } from 'react';

import { useNotesData } from './NoteContext';
import { Backlink, buildBacklinkIndex } from '../services/BacklinksService';

interface BacklinksContextType {
  getBacklinks: (noteId: string) => Backlink[];
  refreshBacklinks: () => void;
}

const BacklinksContext = createContext<BacklinksContextType | undefined>(undefined);

interface BacklinksProviderProps {
  children: ReactNode;
}

export function BacklinksProvider({ children }: BacklinksProviderProps) {
  const { notes } = useNotesData();
  const [refreshVersion, setRefreshVersion] = useState(0);

  const backlinkIndex = useMemo(() => buildBacklinkIndex(notes), [notes, refreshVersion]);

  const getBacklinks = useCallback(
    (noteId: string): Backlink[] => backlinkIndex.get(noteId) ?? [],
    [backlinkIndex],
  );

  const refreshBacklinks = useCallback(() => {
    setRefreshVersion((version) => version + 1);
  }, []);

  const value = useMemo(
    () => ({
      getBacklinks,
      refreshBacklinks,
    }),
    [getBacklinks, refreshBacklinks],
  );

  return <BacklinksContext.Provider value={value}>{children}</BacklinksContext.Provider>;
}

export function useBacklinks(): BacklinksContextType {
  const context = useContext(BacklinksContext);
  if (context === undefined) {
    throw new Error('useBacklinks must be used within a BacklinksProvider');
  }
  return context;
}

export { BacklinksContext };
