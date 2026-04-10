import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react';
import { Canvas, CanvasCreateInput, CanvasUpdateInput, sortCanvasesByUpdated, filterCanvasesBySearch } from '../models/Canvas';
import { StorageService } from '../services/StorageService';

interface CanvasContextType {
  canvases: Canvas[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredCanvases: Canvas[];
  createCanvas: (input: CanvasCreateInput) => Promise<Canvas | null>;
  updateCanvas: (input: CanvasUpdateInput) => Promise<Canvas | null>;
  deleteCanvas: (id: string) => Promise<boolean>;
  getCanvasById: (id: string) => Canvas | undefined;
  refreshCanvases: () => Promise<void>;
  clearError: () => void;
}

const CanvasContext = createContext<CanvasContextType | undefined>(undefined);

interface CanvasProviderProps {
  children: ReactNode;
}

export function CanvasProvider({ children }: CanvasProviderProps) {
  const [canvases, setCanvases] = useState<Canvas[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadCanvases = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await StorageService.getAllCanvases();
      setCanvases(sortCanvasesByUpdated(loaded));
    } catch (err) {
      setError('Failed to load canvases');
      console.error('Error loading canvases:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCanvases();
  }, [loadCanvases]);

  const createCanvas = useCallback(async (input: CanvasCreateInput): Promise<Canvas | null> => {
    try {
      setError(null);
      const newCanvas = await StorageService.createCanvas(input);
      setCanvases((prev) => sortCanvasesByUpdated([...prev, newCanvas]));
      return newCanvas;
    } catch (err) {
      setError('Failed to create canvas');
      console.error('Error creating canvas:', err);
      return null;
    }
  }, []);

  const updateCanvas = useCallback(async (input: CanvasUpdateInput): Promise<Canvas | null> => {
    try {
      setError(null);
      const updated = await StorageService.updateCanvas(input);
      if (updated) {
        setCanvases((prev) =>
          sortCanvasesByUpdated(prev.map((c) => (c.id === updated.id ? updated : c))),
        );
      }
      return updated;
    } catch (err) {
      setError('Failed to update canvas');
      console.error('Error updating canvas:', err);
      return null;
    }
  }, []);

  const deleteCanvas = useCallback(async (id: string): Promise<boolean> => {
    try {
      setError(null);
      const success = await StorageService.deleteCanvas(id);
      if (success) {
        setCanvases((prev) => prev.filter((c) => c.id !== id));
      }
      return success;
    } catch (err) {
      setError('Failed to delete canvas');
      console.error('Error deleting canvas:', err);
      return false;
    }
  }, []);

  const getCanvasById = useCallback(
    (id: string): Canvas | undefined => {
      return canvases.find((c) => c.id === id);
    },
    [canvases],
  );

  const refreshCanvases = useCallback(async () => {
    await loadCanvases();
  }, [loadCanvases]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const filteredCanvases = searchQuery ? filterCanvasesBySearch(canvases, searchQuery) : canvases;

  const value: CanvasContextType = useMemo(
    () => ({
      canvases,
      isLoading,
      error,
      searchQuery,
      setSearchQuery,
      filteredCanvases,
      createCanvas,
      updateCanvas,
      deleteCanvas,
      getCanvasById,
      refreshCanvases,
      clearError,
    }),
    [canvases, isLoading, error, searchQuery, filteredCanvases, createCanvas, updateCanvas, deleteCanvas, getCanvasById, refreshCanvases, clearError],
  );

  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvases(): CanvasContextType {
  const context = useContext(CanvasContext);
  if (context === undefined) {
    throw new Error('useCanvases must be used within a CanvasProvider');
  }
  return context;
}

export { CanvasContext };
