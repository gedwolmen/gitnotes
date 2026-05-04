import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useEntityList } from '../src/hooks/useEntityList';
import { SortMode } from '../src/types/SortTypes';

type Item = {
  id: string;
  title: string;
  notes?: string;
  tags: string[];
  category: 'work' | 'personal';
  modified: number;
  created: number;
};

const items: Item[] = [
  {
    id: '1',
    title: 'Alpha note',
    notes: 'First work item',
    tags: ['urgent', 'docs'],
    category: 'work',
    modified: 300,
    created: 100,
  },
  {
    id: '2',
    title: 'Beta task',
    notes: 'Personal errands',
    tags: ['home'],
    category: 'personal',
    modified: 100,
    created: 300,
  },
  {
    id: '3',
    title: 'Gamma plan',
    notes: 'Second work item',
    tags: ['backlog'],
    category: 'work',
    modified: 200,
    created: 200,
  },
];

function sortItems(a: Item, b: Item, mode: SortMode): number {
  const left = a[mode.field as keyof Item];
  const right = b[mode.field as keyof Item];

  let comparison = 0;

  if (typeof left === 'string' && typeof right === 'string') {
    comparison = left.localeCompare(right);
  } else {
    comparison = Number(left) - Number(right);
  }

  return mode.direction === 'asc' ? comparison : comparison * -1;
}

describe('useEntityList', () => {
  test('returns all data when no search or filters are active', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title', 'notes', 'tags'],
        sortFn: sortItems,
        entityName: 'notes',
      }),
    );

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['1', '3', '2']);
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.isEmpty).toBe(false);
  });

  test('filters by search query across specified fields', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title', 'notes', 'tags'],
        entityName: 'notes',
      }),
    );

    act(() => {
      result.current.setSearchQuery('urgent');
    });

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['1']);
    expect(result.current.hasActiveFilters).toBe(true);
  });

  test('sorts by specified field and direction', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title'],
        sortFn: sortItems,
        initialSortMode: { field: 'title', direction: 'asc' },
        entityName: 'notes',
      }),
    );

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['1', '2', '3']);

    act(() => {
      result.current.setSortMode({ field: 'created', direction: 'desc' });
    });

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['2', '3', '1']);
  });

  test('combines search, filter, and sort correctly', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title', 'notes'],
        sortFn: sortItems,
        filterFn: (item, filters) => {
          const category = filters.category as Item['category'] | undefined;
          return category ? item.category === category : true;
        },
        initialSortMode: { field: 'title', direction: 'desc' },
        entityName: 'notes',
      }),
    );

    act(() => {
      result.current.setFilters({ category: 'work' });
      result.current.setSearchQuery('item');
    });

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['3', '1']);
  });

  test('detects empty state when no items match', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title', 'notes'],
        entityName: 'notes',
      }),
    );

    act(() => {
      result.current.setSearchQuery('missing');
    });

    expect(result.current.filteredData).toEqual([]);
    expect(result.current.isEmpty).toBe(true);
  });

  test('clearFilters resets search and filters to restore full data', () => {
    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title', 'notes'],
        filterFn: (item, filters) => {
          const category = filters.category as Item['category'] | undefined;
          return category ? item.category === category : true;
        },
        entityName: 'notes',
      }),
    );

    act(() => {
      result.current.setFilters({ category: 'personal' });
      result.current.setSearchQuery('beta');
    });

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['2']);

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filteredData.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(result.current.searchQuery).toBe('');
    expect(result.current.filters).toEqual({});
    expect(result.current.hasActiveFilters).toBe(false);
  });

  test('tracks refresh state around the refresh function', async () => {
    let resolveRefresh: (() => void) | undefined;
    const refreshFn = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    const { result } = renderHook(() =>
      useEntityList<Item>({
        data: items,
        searchFields: ['title'],
        refreshFn,
        entityName: 'notes',
      }),
    );

    let refreshPromise: Promise<void> | undefined;

    act(() => {
      refreshPromise = result.current.refresh();
    });

    expect(result.current.isRefreshing).toBe(true);
    expect(refreshFn).toHaveBeenCalledTimes(1);

    act(() => {
      resolveRefresh?.();
    });

    await act(async () => {
      await refreshPromise;
    });

    await waitFor(() => {
      expect(result.current.isRefreshing).toBe(false);
    });
  });
});
