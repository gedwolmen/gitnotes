import React, { useEffect, useMemo } from 'react';
import { Folder, FolderCreateInput } from '../models/Folder';
import { getChildFolders, getFolderPathParts } from '../models/Folder';
import { useFolderStore } from '../stores/folderStore';

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

export function FolderProvider({ children }: { children: React.ReactNode }) {
  const loadFolders = useFolderStore((s) => s.loadFolders);
  const needsLoad = useFolderStore((s) => s.isLoading && s.folders.length === 0);

  useEffect(() => {
    if (needsLoad) loadFolders();
  }, [needsLoad, loadFolders]);

  return <>{children}</>;
}

export function useFolders(): FolderContextType {
  const folders = useFolderStore((s) => s.folders);
  const isLoading = useFolderStore((s) => s.isLoading);
  const error = useFolderStore((s) => s.error);
  const createFolder = useFolderStore((s) => s.createFolder);
  const renameFolder = useFolderStore((s) => s.renameFolder);
  const deleteFolder = useFolderStore((s) => s.deleteFolder);
  const refreshFolders = useFolderStore((s) => s.refreshFolders);
  const clearError = useFolderStore((s) => s.clearError);

  const getFolderById = useMemo(
    () => (id: string) => folders.find((f) => f.id === id),
    [folders]
  );

  const getChildren = useMemo(
    () => (parentId: string | null) => getChildFolders(folders, parentId),
    [folders]
  );

  const getBreadcrumb = useMemo(
    () => (folder: Folder) => getFolderPathParts(folder, folders),
    [folders]
  );

  return useMemo(
    () => ({
      folders, isLoading, error, createFolder, renameFolder, deleteFolder,
      getFolderById, getChildFolders: getChildren, getFolderBreadcrumb: getBreadcrumb,
      refreshFolders, clearError,
    }),
    [folders, isLoading, error, createFolder, renameFolder, deleteFolder,
     getFolderById, getChildren, getBreadcrumb, refreshFolders, clearError],
  );
}
