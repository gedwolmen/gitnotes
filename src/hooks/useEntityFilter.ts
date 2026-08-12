import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { GitRepository } from '../services/GitService';

export interface FilterableItem {
  repo?: string;
  branch?: string;
  filePath?: string;
  folderPath?: string;
  tags?: string[];
  accountId?: string;
}

export interface EntityFilterState {
  selectedRepo: GitRepository | null;
  selectedBranch: string | null;
  selectedFolder: string | null;
  selectedTags: string[];
  selectedAccountId: string | null;
}

export interface UseEntityFilterReturn<T extends FilterableItem> {
  state: EntityFilterState;
  setSelectedRepo: (repo: GitRepository | null) => void;
  setSelectedBranch: (branch: string | null) => void;
  setSelectedFolder: (folder: string | null) => void;
  setSelectedAccountId: (accountId: string | null) => void;
  toggleTag: (tag: string) => void;
  clearAll: () => void;
  applyFilters: (input: T[]) => T[];
  allBranches: string[];
  allFolders: string[];
  allTags: string[];
  activeCount: number;
}

function folderCandidates(item: FilterableItem): string[] {
  const out: string[] = [];
  if (item.folderPath) out.push(item.folderPath);
  if (item.filePath) {
    const idx = item.filePath.lastIndexOf('/');
    if (idx > 0) out.push(item.filePath.slice(0, idx));
  }
  return out;
}

export function useEntityFilter<T extends FilterableItem>(
  items: T[],
  persistenceKey?: string,
): UseEntityFilterReturn<T> {
  const [selectedRepo, setSelectedRepoState] = useState<GitRepository | null>(null);
  const [selectedBranch, setSelectedBranchState] = useState<string | null>(null);
  const [selectedFolder, setSelectedFolderState] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedAccountId, setSelectedAccountIdState] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(!persistenceKey);

  useEffect(() => {
    if (!persistenceKey) return;

    AsyncStorage.getItem(persistenceKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const persistedState: EntityFilterState = JSON.parse(raw);
          setSelectedRepoState(persistedState.selectedRepo);
          setSelectedBranchState(persistedState.selectedBranch);
          setSelectedFolderState(persistedState.selectedFolder);
          setSelectedTags(persistedState.selectedTags);
          setSelectedAccountIdState(persistedState.selectedAccountId);
        } catch {
          setSelectedRepoState(null);
          setSelectedBranchState(null);
          setSelectedFolderState(null);
          setSelectedTags([]);
          setSelectedAccountIdState(null);
        }
      })
      .finally(() => setHydrated(true));
  }, [persistenceKey]);

  useEffect(() => {
    if (!persistenceKey || !hydrated) return;
    const state: EntityFilterState = {
      selectedRepo,
      selectedBranch,
      selectedFolder,
      selectedTags,
      selectedAccountId,
    };
    AsyncStorage.setItem(persistenceKey, JSON.stringify(state)).catch(() => {});
  }, [
    hydrated,
    persistenceKey,
    selectedAccountId,
    selectedBranch,
    selectedFolder,
    selectedRepo,
    selectedTags,
  ]);

  const setSelectedRepo = useCallback((repo: GitRepository | null) => {
    setSelectedRepoState(repo);
    setSelectedBranchState(null);
    setSelectedFolderState(null);
  }, []);

  const setSelectedBranch = useCallback((branch: string | null) => {
    setSelectedBranchState(branch);
  }, []);

  const setSelectedFolder = useCallback((folder: string | null) => {
    setSelectedFolderState(folder);
  }, []);

  const setSelectedAccountId = useCallback((accountId: string | null) => {
    setSelectedAccountIdState(accountId);
  }, []);

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }, []);

  const clearAll = useCallback(() => {
    setSelectedRepoState(null);
    setSelectedBranchState(null);
    setSelectedFolderState(null);
    setSelectedTags([]);
    setSelectedAccountIdState(null);
  }, []);

  const allBranches = useMemo(() => {
    if (!selectedRepo) return [];
    const set = new Set<string>();
    for (const item of items) {
      if (item.repo === selectedRepo.path && item.branch) set.add(item.branch);
    }
    return Array.from(set).sort();
  }, [items, selectedRepo]);

  const allFolders = useMemo(() => {
    const set = new Set<string>();
    const scoped = selectedRepo ? items.filter((i) => i.repo === selectedRepo.path) : items;
    for (const item of scoped) {
      for (const path of folderCandidates(item)) {
        const trimmed = path.trim();
        if (!trimmed) continue;
        const parts = trimmed.split('/').filter(Boolean);
        let acc = '';
        for (const seg of parts) {
          acc = acc ? `${acc}/${seg}` : seg;
          set.add(acc);
        }
      }
    }
    return Array.from(set).sort();
  }, [items, selectedRepo]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      item.tags?.forEach((t) => set.add(t));
    }
    return Array.from(set).sort();
  }, [items]);

  const applyFilters = useCallback(
    (input: T[]): T[] => {
      return input.filter((item) => {
        if (selectedRepo && item.repo !== selectedRepo.path) return false;
        if (selectedBranch && item.branch !== selectedBranch) return false;
        if (selectedAccountId && item.accountId !== selectedAccountId) return false;
        if (selectedFolder) {
          const cands = folderCandidates(item);
          const matches = cands.some(
            (fp) => fp === selectedFolder || fp.startsWith(`${selectedFolder}/`),
          );
          if (!matches) return false;
        }
        if (selectedTags.length > 0) {
          const itemTags = item.tags ?? [];
          if (!selectedTags.every((t) => itemTags.includes(t))) return false;
        }
        return true;
      });
    },
    [selectedRepo, selectedBranch, selectedFolder, selectedTags, selectedAccountId],
  );

  const activeCount =
    (selectedRepo ? 1 : 0) +
    (selectedBranch ? 1 : 0) +
    (selectedFolder ? 1 : 0) +
    (selectedTags.length > 0 ? 1 : 0) +
    (selectedAccountId ? 1 : 0);

  return {
    state: { selectedRepo, selectedBranch, selectedFolder, selectedTags, selectedAccountId },
    setSelectedRepo,
    setSelectedBranch,
    setSelectedFolder,
    setSelectedAccountId,
    toggleTag,
    clearAll,
    applyFilters,
    allBranches,
    allFolders,
    allTags,
    activeCount,
  };
}
