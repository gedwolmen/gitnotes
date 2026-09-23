import React, { useEffect, useMemo, useState } from 'react';
import type { Diagram, DiagramCreateInput, DiagramUpdateInput } from '../models/Diagram';
import { filterDiagramsBySearch } from '../models/Diagram';
import { useDiagramStore } from '../stores/diagramStore';
import { useGitContentRefreshSignal } from '../hooks/useGitRefreshEvent';

interface DiagramContextType {
  diagrams: Diagram[];
  isLoading: boolean;
  error: string | null;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filteredDiagrams: Diagram[];
  createDiagram: (input: DiagramCreateInput) => Promise<Diagram | null>;
  updateDiagram: (input: DiagramUpdateInput) => Promise<Diagram | null>;
  deleteDiagram: (id: string) => Promise<boolean>;
  getDiagramById: (id: string) => Diagram | undefined;
  refreshDiagrams: () => Promise<void>;
  clearError: () => void;
}

export function DiagramProvider({ children }: { children: React.ReactNode }) {
  const loadDiagrams = useDiagramStore((s) => s.loadDiagrams);
  const refreshDiagramsFromStore = useDiagramStore((s) => s.refreshDiagrams);
  const needsLoad = useDiagramStore((s) => s.isLoading && s.diagrams.length === 0);
  const refreshSignal = useGitContentRefreshSignal();

  useEffect(() => {
    if (needsLoad) loadDiagrams();
  }, [needsLoad, loadDiagrams]);

  useEffect(() => {
    if (refreshSignal > 0) void refreshDiagramsFromStore();
  }, [refreshDiagramsFromStore, refreshSignal]);

  return <>{children}</>;
}

export function useDiagrams(): DiagramContextType {
  const diagrams = useDiagramStore((s) => s.diagrams);
  const isLoading = useDiagramStore((s) => s.isLoading);
  const error = useDiagramStore((s) => s.error);
  const createDiagram = useDiagramStore((s) => s.createDiagram);
  const updateDiagram = useDiagramStore((s) => s.updateDiagram);
  const deleteDiagram = useDiagramStore((s) => s.deleteDiagram);
  const refreshDiagrams = useDiagramStore((s) => s.refreshDiagrams);
  const clearError = useDiagramStore((s) => s.clearError);

  const [searchQuery, setSearchQuery] = useState('');
  const filteredDiagrams = useMemo(
    () => (searchQuery ? filterDiagramsBySearch(diagrams, searchQuery) : diagrams),
    [diagrams, searchQuery],
  );

  const getDiagramById = useMemo(
    () => (id: string) => diagrams.find((d) => d.id === id),
    [diagrams],
  );

  return useMemo(
    () => ({
      diagrams, isLoading, error, searchQuery, setSearchQuery, filteredDiagrams,
      createDiagram, updateDiagram, deleteDiagram, getDiagramById, refreshDiagrams, clearError,
    }),
    [diagrams, isLoading, error, searchQuery, filteredDiagrams,
     createDiagram, updateDiagram, deleteDiagram, getDiagramById, refreshDiagrams, clearError],
  );
}
