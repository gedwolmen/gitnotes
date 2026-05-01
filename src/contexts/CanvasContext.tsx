import React, { useEffect, useMemo, useState } from 'react';
import { Canvas, CanvasCreateInput, CanvasUpdateInput, filterCanvasesBySearch } from '../models/Canvas';
import { useCanvasStore } from '../stores/canvasStore';

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

export function CanvasProvider({ children }: { children: React.ReactNode }) {
  const loadCanvases = useCanvasStore((s) => s.loadCanvases);
  const needsLoad = useCanvasStore((s) => s.isLoading && s.canvases.length === 0);

  useEffect(() => {
    if (needsLoad) loadCanvases();
  }, [needsLoad, loadCanvases]);

  return <>{children}</>;
}

export function useCanvases(): CanvasContextType {
  const canvases = useCanvasStore((s) => s.canvases);
  const isLoading = useCanvasStore((s) => s.isLoading);
  const error = useCanvasStore((s) => s.error);
  const createCanvas = useCanvasStore((s) => s.createCanvas);
  const updateCanvas = useCanvasStore((s) => s.updateCanvas);
  const deleteCanvas = useCanvasStore((s) => s.deleteCanvas);
  const refreshCanvases = useCanvasStore((s) => s.refreshCanvases);
  const clearError = useCanvasStore((s) => s.clearError);

  const [searchQuery, setSearchQuery] = useState('');
  const filteredCanvases = useMemo(
    () => (searchQuery ? filterCanvasesBySearch(canvases, searchQuery) : canvases),
    [canvases, searchQuery],
  );

  const getCanvasById = useMemo(
    () => (id: string) => canvases.find((c) => c.id === id),
    [canvases],
  );

  return useMemo(
    () => ({
      canvases, isLoading, error, searchQuery, setSearchQuery, filteredCanvases,
      createCanvas, updateCanvas, deleteCanvas, getCanvasById, refreshCanvases, clearError,
    }),
    [canvases, isLoading, error, searchQuery, filteredCanvases,
     createCanvas, updateCanvas, deleteCanvas, getCanvasById, refreshCanvases, clearError],
  );
}
