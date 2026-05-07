import { create } from 'zustand';
import { Folder, FolderCreateInput } from '../models/Folder';
import { StorageService } from '../services/StorageService';
import { sortFoldersByName, getChildFolders, getFolderPathParts } from '../models/Folder';

interface FolderState {
  folders: Folder[];
  isLoading: boolean;
  error: string | null;
}

interface FolderActions {
  loadFolders: () => Promise<void>;
  createFolder: (input: FolderCreateInput) => Promise<Folder | null>;
  renameFolder: (id: string, name: string) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  refreshFolders: () => Promise<void>;
  clearError: () => void;
}

export const useFolderStore = create<FolderState & FolderActions>()((set, get) => ({
  folders: [],
  isLoading: true,
  error: null,

  loadFolders: async () => {
    try {
      set({ isLoading: true, error: null });
      const loadedFolders = await StorageService.getAllFolders();
      set({ folders: sortFoldersByName(loadedFolders), isLoading: false });
    } catch (err) {
      set({ error: 'Failed to load folders', isLoading: false });
      console.error('Error loading folders:', err);
    }
  },

  createFolder: async (input) => {
    try {
      set({ error: null });
      const newFolder = await StorageService.createFolder(input);
      set((state) => ({ folders: sortFoldersByName([...state.folders, newFolder]) }));
      return newFolder;
    } catch (err) {
      set({ error: 'Failed to create folder' });
      console.error('Error creating folder:', err);
      return null;
    }
  },

  renameFolder: async (id, name) => {
    try {
      set({ error: null });
      const updatedFolder = await StorageService.updateFolder(id, { name });
      if (updatedFolder) {
        set((state) => ({
          folders: sortFoldersByName(
            state.folders.map((f) => (f.id === id ? updatedFolder : f))
          ),
        }));
      }
      return updatedFolder;
    } catch (err) {
      set({ error: 'Failed to rename folder' });
      console.error('Error renaming folder:', err);
      return null;
    }
  },

  deleteFolder: async (id) => {
    try {
      set({ error: null });
      const success = await StorageService.deleteFolder(id);
      if (success) {
        set((state) => ({ folders: state.folders.filter((f) => f.id !== id) }));
      }
      return success;
    } catch (err) {
      set({ error: 'Failed to delete folder' });
      console.error('Error deleting folder:', err);
      return false;
    }
  },

  refreshFolders: async () => {
    await get().loadFolders();
  },

  clearError: () => set({ error: null }),
}));

export const useFolderById = (id: string) =>
  useFolderStore((s) => s.folders.find((f) => f.id === id));

export const useChildFolders = (parentId: string | null) =>
  useFolderStore((s) => getChildFolders(s.folders, parentId));
