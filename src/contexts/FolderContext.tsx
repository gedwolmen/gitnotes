import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Folder, FolderCreateInput } from '../models/Folder';
import { StorageService } from '../services/StorageService';
import { sortFoldersByName, getChildFolders, getFolderPathParts } from '../models/Folder';

interface FolderContextType {
  folders: Folder[];
  isLoading: boolean;
  error: string | null;
  createFolder: (input: FolderCreateInput) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  getFolderById: (id: string) => Folder | undefined;
  getChildFolders: (parentId: string | null) => Folder[];
  getFolderBreadcrumb: (folder: Folder) => Folder[];
  refreshFolders: () => Promise<void>;
  clearError: () => void;
}

const FolderContext = createContext<FolderContextType | undefined>(undefined);

interface FolderProviderProps {
  children: ReactNode;
}

export function FolderProvider({ children }: FolderProviderProps) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadFolders = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedFolders = await StorageService.getAllFolders();
      setFolders(sortFoldersByName(loadedFolders));
    } catch (err) {
      setError('Failed to load folders');
      console.error('Error loading folders:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const createFolder = useCallback(async (input: FolderCreateInput): Promise<Folder | null> => {
    try {
      setError(null);
      const newFolder = await StorageService.createFolder(input);
      setFolders((prev) => sortFoldersByName([...prev, newFolder]));
      return newFolder;
    } catch (err) {
      setError('Failed to create folder');
      console.error('Error creating folder:', err);
      return null;
    }
  }, []);

  const renameFolder = useCallback(async (id: string, name: string): Promise<Folder | null> => {
    try {
      setError(null);
      const updatedFolder = await StorageService.updateFolder(id, { name });
      if (updatedFolder) {
        setFolders((prev) =>
          sortFoldersByName(prev.map((folder) => (folder.id === updatedFolder.id ? updatedFolder : folder)))
        );
      }
      return updatedFolder;
    } catch (err) {
      setError('Failed to rename folder');
      console.error('Error renaming folder:', err);
      return null;
    }
  }, []);

  const deleteFolder = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      const success = await StorageService.deleteFolder(id);
      if (success) {
        setFolders((prev) => prev.filter((folder) => folder.id !== id));
      }
      return success;
    } catch (err) {
      setError('Failed to delete folder');
      console.error('Error deleting folder:', err);
      return false;
    }
  }, []);

  const getFolderById = useCallback(
    (id: string): Folder | undefined => {
      return folders.find((folder) => folder.id === id);
    },
    [folders]
  );

  const getChildren = useCallback(
    (parentId: string | null): Folder[] => {
      return getChildFolders(folders, parentId);
    },
    [folders]
  );

  const getBreadcrumb = useCallback(
    (folder: Folder): Folder[] => {
      return getFolderPathParts(folder, folders);
    },
    [folders]
  );

  const refreshFolders = useCallback(async () => {
    await loadFolders();
  }, [loadFolders]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value: FolderContextType = useMemo(() => ({
    folders,
    isLoading,
    error,
    createFolder,
    renameFolder,
    deleteFolder,
    getFolderById,
    getChildFolders: getChildren,
    getFolderBreadcrumb: getBreadcrumb,
    refreshFolders,
    clearError,
  }), [folders, isLoading, error, createFolder, renameFolder, deleteFolder, getFolderById, getChildren, getBreadcrumb, refreshFolders, clearError]);

  return <FolderContext.Provider value={value}>{children}</FolderContext.Provider>;
}

export function useFolders(): FolderContextType {
  const context = useContext(FolderContext);
  if (context === undefined) {
    throw new Error('useFolders must be used within a FolderProvider');
  }
  return context;
}

export { FolderContext };