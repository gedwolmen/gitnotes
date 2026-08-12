import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SortMode } from '../types/SortTypes';

const DEFAULT_SORT_MODE: SortMode = { field: 'modified', direction: 'desc' };

type EntityListFilters = Record<string, unknown>;

export interface UseEntityListConfig<T> {
  data: T[];
  searchFields: (keyof T)[];
  sortFn?: (a: T, b: T, mode: SortMode) => number;
  filterFn?: (item: T, filters: EntityListFilters) => boolean;
  entityName: string;
  refreshFn?: () => Promise<void>;
  initialSearchQuery?: string;
  initialSortMode?: SortMode;
  initialFilters?: EntityListFilters;
  persistenceKey?: string;
}

export interface UseEntityListReturn<T> {
  filteredData: T[];
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
  filters: EntityListFilters;
  setFilters: (f: EntityListFilters) => void;
  isRefreshing: boolean;
  refresh: () => Promise<void>;
  isEmpty: boolean;
  hasActiveFilters: boolean;
  clearFilters: () => void;
}

function hasMeaningfulFilterValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function normalizeSearchValue(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) return value.map(normalizeSearchValue).join(' ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

export function useEntityList<T>(config: UseEntityListConfig<T>): UseEntityListReturn<T> {
  const {
    data,
    searchFields,
    sortFn,
    filterFn,
    entityName,
    refreshFn,
    initialSearchQuery = '',
    initialSortMode = DEFAULT_SORT_MODE,
    initialFilters = {},
    persistenceKey,
  } = config;

  void entityName;

  const [searchQuery, setSearchQuery] = useState(initialSearchQuery);
  const [sortMode, setSortMode] = useState<SortMode>(initialSortMode);
  const [filters, setFilters] = useState<EntityListFilters>(initialFilters);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hydrated, setHydrated] = useState(!persistenceKey);

  useEffect(() => {
    if (!persistenceKey) return;

    AsyncStorage.getItem(persistenceKey)
      .then((raw) => {
        if (!raw) return;
        try {
          const persistedFilters: EntityListFilters = JSON.parse(raw);
          setFilters({ ...initialFilters, ...persistedFilters });
        } catch {
          setFilters(initialFilters);
        }
      })
      .finally(() => setHydrated(true));
  }, [persistenceKey]);

  useEffect(() => {
    if (!persistenceKey || !hydrated) return;
    AsyncStorage.setItem(persistenceKey, JSON.stringify(filters)).catch(() => {});
  }, [filters, hydrated, persistenceKey]);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const filteredData = useMemo(() => {
    let nextData = data;

    if (filterFn) {
      nextData = nextData.filter((item) => filterFn(item, filters));
    }

    if (normalizedSearchQuery) {
      nextData = nextData.filter((item) =>
        searchFields.some((field) =>
          normalizeSearchValue(item[field]).toLowerCase().includes(normalizedSearchQuery),
        ),
      );
    }

    if (!sortFn) {
      return nextData;
    }

    return [...nextData].sort((a, b) => sortFn(a, b, sortMode));
  }, [data, filterFn, filters, normalizedSearchQuery, searchFields, sortFn, sortMode]);

  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await (refreshFn?.() ?? Promise.resolve());
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshFn]);

  const clearFilters = useCallback(() => {
    setFilters({});
    setSearchQuery('');
  }, []);

  const hasActiveFilters = useMemo(
    () =>
      normalizedSearchQuery.length > 0 ||
      Object.values(filters).some((value) => hasMeaningfulFilterValue(value)),
    [filters, normalizedSearchQuery],
  );

  return {
    filteredData,
    searchQuery,
    setSearchQuery,
    sortMode,
    setSortMode,
    filters,
    setFilters,
    isRefreshing,
    refresh,
    isEmpty: filteredData.length === 0,
    hasActiveFilters,
    clearFilters,
  };
}
