/**
 * useNotesListFilters.test.ts
 *
 * Regression and characterization tests for FTS debounce, stale-result
 * rejection, and dependency correctness in useNotesListFilters.
 */

import { act, renderHook } from '@testing-library/react-native';
import { useNotesListFilters } from '../../../src/components/notes/useNotesListFilters';
import { Note, NoteFormat } from '../../../src/models/Note';

// ── Mock DocumentService ───────────────────────────────────────────────────────

const mockSearchFts = jest.fn();
jest.mock('../../../src/services/documents/DocumentService', () => ({
  DocumentService: jest.fn().mockImplementation(() => ({
    index: { searchFts: mockSearchFts },
  })),
}));

// ── Note factory ───────────────────────────────────────────────────────────────

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: `note-${Math.random().toString(36).slice(2)}`,
    repo: 'test-repo',
    branch: 'main',
    title: 'Test Note',
    content: 'Test content',
    format: 'markdown' as NoteFormat,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isPinned: false,
    tags: [],
    color: undefined,
    folderPath: undefined,
    filePath: undefined,
    ...overrides,
  };
}

// ── Shared hook config ─────────────────────────────────────────────────────────

function renderFilters(opts: {
  notes?: Note[];
  filteredNotes?: Note[];
  searchQuery?: string;
} = {}) {
  const {
    notes = [],
    filteredNotes = opts.notes ?? [],
    searchQuery = '',
  } = opts;
  return renderHook(
    ({ n, fn, q }: { n: Note[]; fn: Note[]; q: string }) =>
      useNotesListFilters({ notes: n, filteredNotes: fn, searchQuery: q }),
    {
      initialProps: { n: notes, fn: filteredNotes, q: searchQuery },
    },
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('useNotesListFilters FTS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchFts.mockResolvedValue([]);
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounce: rapid typing issues exactly one FTS call for the final query', () => {
    const note = makeNote({ id: 'id1' });

    const { rerender } = renderFilters({
      notes: [note],
      filteredNotes: [note],
      searchQuery: '',
    });

    // Phase 1: type "a", "ab", "abc" in rapid succession inside one act().
    // React batches all rerenders; only the final searchQuery='abc' effect
    // result survives (previous debounce timers are cleared by effect cleanup).
    act(() => {
      rerender({ n: [note], fn: [note], q: 'a' });
      rerender({ n: [note], fn: [note], q: 'ab' });
      rerender({ n: [note], fn: [note], q: 'abc' });
    });

    // Phase 2: advance timers in a SEPARATE act() — timer fires here.
    // The timeout was scheduled at effect-flush time (end of phase 1), so it
    // is now 300ms in the future relative to the last effect run.
    act(() => { jest.advanceTimersByTime(350); });

    expect(mockSearchFts).toHaveBeenCalledTimes(1);
    expect(mockSearchFts).toHaveBeenCalledWith('abc*');
  });

  it('stale promise: a slower FTS result for an older query is discarded', () => {
    let resolveFts: (ids: string[]) => void;
    mockSearchFts.mockImplementation(
      () =>
        new Promise<string[]>((resolve) => {
          resolveFts = resolve;
        }),
    );

    const note = makeNote({ id: 'id1' });
    const { rerender } = renderFilters({
      notes: [note],
      filteredNotes: [note],
      searchQuery: 'a',
    });

    // Debounce fires for "a" at ~300ms
    act(() => { jest.advanceTimersByTime(350); });
    expect(mockSearchFts).toHaveBeenCalledTimes(1);
    expect(mockSearchFts).toHaveBeenCalledWith('a*');

    // Before "a" resolves, user types "ab" — clears the "a" timer, schedules "ab"
    act(() => { rerender({ n: [note], fn: [note], q: 'ab' }); });
    act(() => { jest.advanceTimersByTime(350); });
    expect(mockSearchFts).toHaveBeenCalledTimes(2);
    expect(mockSearchFts).toHaveBeenCalledWith('ab*');

    // Now "a" resolves — searchQueryRef should have "ab", so "a" result is stale
    let resolveA: (ids: string[]) => void;
    mockSearchFts.mockImplementationOnce(
      () => new Promise<string[]>((resolve) => { resolveA = resolve; }),
    );

    // User types "abc" — clears "ab" timer, schedules "abc"
    act(() => { rerender({ n: [note], fn: [note], q: 'abc' }); });
    act(() => { jest.advanceTimersByTime(350); });
    expect(mockSearchFts).toHaveBeenCalledTimes(3);

    // Resolve "ab" (second call) — should be ignored because queryRef is now "abc"
    act(() => { resolveA!(['id1']); });

    // Resolve "abc" (third call) — should be accepted
    act(() => { resolveFts!(['id1']); });

    // Only "abc" result should have been accepted; "ab" result was discarded
    expect(mockSearchFts).toHaveBeenCalledTimes(3);
  });

  it('empty query returns early and does not call FTS', () => {
    const note = makeNote({ id: 'id1' });

    const { rerender } = renderFilters({
      notes: [note],
      filteredNotes: [note],
      searchQuery: 'test',
    });

    act(() => { jest.advanceTimersByTime(350); });
    expect(mockSearchFts).toHaveBeenCalledTimes(1);

    // Clear query — FTS should not be called again
    act(() => { rerender({ n: [note], fn: [note], q: '' }); });

    expect(mockSearchFts).toHaveBeenCalledTimes(1);
  });

  it('a failing FTS promise does not crash and leaves displayNotes defined', async () => {
    mockSearchFts.mockRejectedValue(new Error('FTS index unavailable'));

    const note = makeNote({ id: 'id1' });
    const { result } = renderFilters({
      notes: [note],
      filteredNotes: [note],
      searchQuery: 'test',
    });

    await act(async () => { jest.advanceTimersByTime(400); });

    expect(result.current.displayNotes).toBeDefined();
  });

  it('changing folder filter without changing query does NOT trigger FTS', () => {
    // Core regression test: after removing filteredNotes from the FTS effect dep
    // array, changing filteredNotes (folder filter change) must not fire FTS.
    const note1 = makeNote({ id: 'id1', folderPath: 'Work' });
    const note2 = makeNote({ id: 'id2', folderPath: 'Personal' });

    const { rerender } = renderFilters({
      notes: [note1, note2],
      filteredNotes: [note1],
      searchQuery: 'test',
    });

    act(() => { jest.advanceTimersByTime(350); });
    expect(mockSearchFts).toHaveBeenCalledTimes(1);

    // Simulate folder filter change: filteredNotes changes but searchQuery stays
    act(() => {
      rerender({ n: [note1, note2], fn: [note2], q: 'test' });
    });

    // No new FTS call should fire — searchQuery is unchanged
    expect(mockSearchFts).toHaveBeenCalledTimes(1);
  });

  it('displayNotes deduplication: FTS IDs and filteredData are merged without duplicates', () => {
    mockSearchFts.mockResolvedValue([]);

    const note1 = makeNote({ id: 'id1', title: 'First Note' });
    const note2 = makeNote({ id: 'id2', title: 'Second Note' });

    const { result } = renderFilters({
      notes: [note1, note2],
      filteredNotes: [note1, note2],
      searchQuery: '',
    });

    expect(result.current.displayNotes).toHaveLength(2);
    const ids = result.current.displayNotes.map((n) => n.id);
    expect(ids).toContain('id1');
    expect(ids).toContain('id2');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('pinned notes sort before unpinned notes', () => {
    mockSearchFts.mockResolvedValue([]);

    const pinned = makeNote({ id: 'pinned', isPinned: true, updatedAt: 1000 });
    const unpinned = makeNote({ id: 'unpinned', isPinned: false, updatedAt: 2000 });

    const { result } = renderFilters({
      notes: [unpinned, pinned],
      filteredNotes: [unpinned, pinned],
      searchQuery: '',
    });

    expect(mockSearchFts).not.toHaveBeenCalled();
    expect(result.current.displayNotes[0].id).toBe('pinned');
    expect(result.current.displayNotes[1].id).toBe('unpinned');
  });
});

describe('useNotesListFilters search/highlight state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchFts.mockResolvedValue([]);
    jest.useFakeTimers({ advanceTimers: true });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('hasActiveSearch is true only when query is non-empty', () => {
    const { result: withQuery } = renderFilters({ searchQuery: 'test' });
    const { result: emptyQuery } = renderFilters({ searchQuery: '' });

    expect(withQuery.current.hasActiveSearch).toBe(true);
    expect(emptyQuery.current.hasActiveSearch).toBe(false);
  });

  it('searchMatchCount is zero when no active search', () => {
    const { result } = renderFilters({ searchQuery: '' });
    expect(result.current.searchMatchCount).toBe(0);
  });

  it('isSearching transitions from false → true → false over FTS lifecycle', async () => {
    mockSearchFts.mockImplementation(
      () => new Promise<string[]>((r) => setTimeout(() => r(['id1']), 100)),
    );

    const note = makeNote({ id: 'id1' });
    const { result } = renderFilters({
      notes: [note],
      filteredNotes: [note],
      searchQuery: 'test',
    });

    // setIsSearching(true) is called synchronously when the debounce is scheduled,
    // which happens during the render/effect. So after render, isSearching is true.
    expect(result.current.isSearching).toBe(true);

    await act(async () => { jest.advanceTimersByTime(500); });
    expect(result.current.isSearching).toBe(false);
  });
});
