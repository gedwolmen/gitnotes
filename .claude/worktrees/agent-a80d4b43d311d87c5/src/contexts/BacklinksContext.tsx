import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { Note } from '../models/Note';
import { parseWikiLinks, extractWikiLinkTargets, Backlink } from '../utils/wikiLinkParser';
import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKLINKS_KEY = '@gitnotes:backlinks';

interface BacklinksContextType {
  getBacklinks: (noteId: string, noteTitle: string, allNotes: Note[]) => Backlink[];
  rebuildIndex: (notes: Note[]) => Promise<void>;
  getLinkedNoteIds: (noteId: string) => string[];
}

const BacklinksContext = createContext<BacklinksContextType | undefined>(undefined);

interface BacklinksProviderProps {
  children: ReactNode;
}

interface BacklinkIndex {
  [noteId: string]: string[];
}

export function BacklinksProvider({ children }: BacklinksProviderProps) {
  const buildIndex = useCallback((notes: Note[]): BacklinkIndex => {
    const index: BacklinkIndex = {};

    for (const note of notes) {
      const targets = extractWikiLinkTargets(note.content || '');
      index[note.id] = targets;
    }

    return index;
  }, []);

  const rebuildIndex = useCallback(async (notes: Note[]) => {
    try {
      const index = buildIndex(notes);
      await AsyncStorage.setItem(BACKLINKS_KEY, JSON.stringify(index));
    } catch (error) {
      console.error('[BacklinksProvider] Failed to rebuild index:', error);
    }
  }, [buildIndex]);

  const getLinkedNoteIds = useCallback((noteId: string): string[] => {
    return [];
  }, []);

  const getBacklinks = useCallback(
    (noteId: string, noteTitle: string, allNotes: Note[]): Backlink[] => {
      const backlinks: Backlink[] = [];
      const normalizedTitle = noteTitle.toLowerCase().trim();

      for (const note of allNotes) {
        if (note.id === noteId) continue;

        const targets = extractWikiLinkTargets(note.content || '');
        if (targets.some((t) => t.toLowerCase().trim() === normalizedTitle)) {
          const context = note.content?.slice(0, 150) || '';
          backlinks.push({
            noteId: note.id,
            noteTitle: note.title || 'Untitled',
            context,
          });
        }
      }

      return backlinks;
    },
    []
  );

  const value = useMemo(
    () => ({
      getBacklinks,
      rebuildIndex,
      getLinkedNoteIds,
    }),
    [getBacklinks, rebuildIndex, getLinkedNoteIds]
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
