import { bentoSizeForIndex, buildPinnedFeed, buildRecentFeed } from '../src/utils/recentItems';
import type { Note } from '../src/models/Note';
import type { Canvas } from '../src/models/Canvas';

function makeNote(overrides: Partial<Note>): Note {
  return {
    id: overrides.id ?? `n-${Math.random()}`,
    title: overrides.title ?? 'note',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
    tags: overrides.tags ?? [],
    format: overrides.format,
    isPinned: overrides.isPinned,
    repo: overrides.repo,
    branch: overrides.branch,
    filePath: overrides.filePath,
    folderPath: overrides.folderPath,
  };
}

function makeCanvas(overrides: Partial<Canvas>): Canvas {
  return {
    id: overrides.id ?? `c-${Math.random()}`,
    title: overrides.title ?? 'canvas',
    scene: overrides.scene ?? { version: 1, width: 100, height: 100, background: '#fff', elements: [] },
    folderPath: overrides.folderPath,
    repo: overrides.repo,
    branch: overrides.branch,
    filePath: overrides.filePath,
    tags: overrides.tags ?? [],
    createdAt: overrides.createdAt ?? 0,
    updatedAt: overrides.updatedAt ?? 0,
  };
}

describe('buildRecentFeed', () => {
  it('returns empty when no inputs', () => {
    expect(buildRecentFeed([], [])).toEqual([]);
  });

  it('mixes notes / documents / canvases sorted by updatedAt desc', () => {
    const items = buildRecentFeed(
      [
        makeNote({ id: 'n1', updatedAt: 100 }),
        makeNote({ id: 'd1', updatedAt: 300, format: 'pdf' }),
      ],
      [makeCanvas({ id: 'c1', updatedAt: 200 })],
    );
    expect(items.map((i) => `${i.kind}:${i.data.id}`)).toEqual([
      'document:d1',
      'canvas:c1',
      'note:n1',
    ]);
  });

  it('excludes pinned notes by default', () => {
    const items = buildRecentFeed(
      [
        makeNote({ id: 'pinned', updatedAt: 500, isPinned: true }),
        makeNote({ id: 'fresh', updatedAt: 100 }),
      ],
      [],
    );
    expect(items.map((i) => i.data.id)).toEqual(['fresh']);
  });

  it('keeps pinned items when excludePinned is false', () => {
    const items = buildRecentFeed(
      [
        makeNote({ id: 'pinned', updatedAt: 500, isPinned: true }),
        makeNote({ id: 'fresh', updatedAt: 100 }),
      ],
      [],
      { excludePinned: false },
    );
    expect(items.map((i) => i.data.id)).toEqual(['pinned', 'fresh']);
  });

  it('respects limit', () => {
    const items = buildRecentFeed(
      [
        makeNote({ id: 'a', updatedAt: 3 }),
        makeNote({ id: 'b', updatedAt: 2 }),
        makeNote({ id: 'c', updatedAt: 1 }),
      ],
      [],
      { limit: 2 },
    );
    expect(items.map((i) => i.data.id)).toEqual(['a', 'b']);
  });

  it('marks pdf notes as document kind, others as note', () => {
    const [pdf, md] = buildRecentFeed(
      [
        makeNote({ id: 'pdf', updatedAt: 2, format: 'pdf' }),
        makeNote({ id: 'md', updatedAt: 1, format: 'markdown' }),
      ],
      [],
    );
    expect(pdf.kind).toBe('document');
    expect(md.kind).toBe('note');
  });
});

describe('buildPinnedFeed', () => {
  it('returns empty when nothing is pinned', () => {
    expect(buildPinnedFeed([makeNote({ id: 'a' })], [])).toEqual([]);
  });

  it('returns only pinned notes, sorted by updatedAt desc', () => {
    const items = buildPinnedFeed(
      [
        makeNote({ id: 'p1', updatedAt: 100, isPinned: true }),
        makeNote({ id: 'free', updatedAt: 200 }),
        makeNote({ id: 'p2', updatedAt: 300, isPinned: true }),
      ],
      [],
    );
    expect(items.map((i) => i.data.id)).toEqual(['p2', 'p1']);
  });

  it('caps to limit', () => {
    const items = buildPinnedFeed(
      [
        makeNote({ id: 'a', updatedAt: 3, isPinned: true }),
        makeNote({ id: 'b', updatedAt: 2, isPinned: true }),
        makeNote({ id: 'c', updatedAt: 1, isPinned: true }),
      ],
      [],
      2,
    );
    expect(items).toHaveLength(2);
    expect(items[0].data.id).toBe('a');
  });
});

describe('bentoSizeForIndex', () => {
  it('maps 0 to large, 1-2 to medium, rest to small', () => {
    expect(bentoSizeForIndex(0)).toBe('large');
    expect(bentoSizeForIndex(1)).toBe('medium');
    expect(bentoSizeForIndex(2)).toBe('medium');
    expect(bentoSizeForIndex(3)).toBe('small');
    expect(bentoSizeForIndex(99)).toBe('small');
  });
});
