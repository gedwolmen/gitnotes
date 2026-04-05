import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ViewMode, ViewModePreference, DEFAULT_VIEW_MODE } from '../utils/viewModes';

const VIEW_MODE_KEY = '@gitnotes:view_mode';

interface ViewModeContextType {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  getFolderViewMode: (folderId: string | null) => ViewMode;
  setFolderViewMode: (folderId: string | null, mode: ViewMode) => void;
}

const ViewModeContext = createContext<ViewModeContextType | undefined>(undefined);

interface ViewModeProviderProps {
  children: ReactNode;
}

export function ViewModeProvider({ children }: ViewModeProviderProps) {
  const [preferences, setPreferences] = useState<ViewModePreference>({
    global: DEFAULT_VIEW_MODE,
    perFolder: {},
  });

  const loadPreferences = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(VIEW_MODE_KEY);
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
    } catch (error) {
      console.error('Failed to load view mode preferences:', error);
    }
  }, []);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const savePreferences = useCallback(async (newPrefs: ViewModePreference) => {
    try {
      await AsyncStorage.setItem(VIEW_MODE_KEY, JSON.stringify(newPrefs));
    } catch (error) {
      console.error('Failed to save view mode preferences:', error);
    }
  }, []);

  const setViewMode = useCallback((mode: ViewMode) => {
    setPreferences((prev) => {
      const newPrefs = { ...prev, global: mode };
      savePreferences(newPrefs);
      return newPrefs;
    });
  }, [savePreferences]);

  const getFolderViewMode = useCallback(
    (folderId: string | null): ViewMode => {
      if (!folderId) return preferences.global;
      return preferences.perFolder[folderId] || preferences.global;
    },
    [preferences]
  );

  const setFolderViewMode = useCallback(
    (folderId: string | null, mode: ViewMode) => {
      setPreferences((prev) => {
        const newPrefs = { ...prev };
        if (folderId) {
          newPrefs.perFolder = { ...prev.perFolder, [folderId]: mode };
        } else {
          newPrefs.global = mode;
        }
        savePreferences(newPrefs);
        return newPrefs;
      });
    },
    [savePreferences]
  );

  const value: ViewModeContextType = useMemo(
    () => ({
      viewMode: preferences.global,
      setViewMode,
      getFolderViewMode,
      setFolderViewMode,
    }),
    [preferences.global, setViewMode, getFolderViewMode, setFolderViewMode]
  );

  return <ViewModeContext.Provider value={value}>{children}</ViewModeContext.Provider>;
}

export function useViewMode(): ViewModeContextType {
  const context = useContext(ViewModeContext);
  if (context === undefined) {
    throw new Error('useViewMode must be used within a ViewModeProvider');
  }
  return context;
}