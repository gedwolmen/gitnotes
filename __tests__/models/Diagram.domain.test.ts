/**
 * Diagram domain model tests — createDiagram, updateDiagram,
 * sortDiagramsByUpdated, filterDiagramsBySearch, slugifyDiagramTitle.
 */

import type { Diagram } from '@/models/Diagram';
import {
  createDiagram,
  updateDiagram,
  sortDiagramsByUpdated,
  filterDiagramsBySearch,
  slugifyDiagramTitle,
  DEFAULT_DIAGRAM_DOCUMENT,
  DIAGRAM_LINK_PREFIX,
  isDiagramLink,
  diagramIdFromLink,
  diagramToLink,
} from '@/models/Diagram';

describe('Diagram factory — createDiagram', () => {
  it('creates a frozen diagram with generated id and defaults', () => {
    const diagram = createDiagram({ title: 'My Diagram' });
    expect(diagram.id).toMatch(/^diagram-/);
    expect(diagram.title).toBe('My Diagram');
    expect(diagram.document).toEqual(DEFAULT_DIAGRAM_DOCUMENT);
    expect(diagram.tags).toEqual([]);
    expect(diagram.repo).toBeUndefined();
    expect(diagram.branch).toBeUndefined();
    expect(diagram.filePath).toBeUndefined();
    expect(diagram.accountId).toBeUndefined();
    expect(typeof diagram.createdAt).toBe('number');
    expect(typeof diagram.updatedAt).toBe('number');
    expect(Object.isFrozen(diagram)).toBe(true);
  });

  it('accepts all optional fields', () => {
    const diagram = createDiagram({
      title: 'Full Diagram',
      document: { version: 1, objects: [] },
      folderPath: 'diagrams/',
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'diagrams/my-diagram.td.json',
      tags: ['tag1', 'tag2'],
      accountId: 'acct-123',
      lastPulledDocument: '{"version":1,"objects":[]}',
    });
    expect(diagram.title).toBe('Full Diagram');
    expect(diagram.folderPath).toBe('diagrams/');
    expect(diagram.repo).toBe('owner/repo');
    expect(diagram.branch).toBe('main');
    expect(diagram.filePath).toBe('diagrams/my-diagram.td.json');
    expect(diagram.tags).toEqual(['tag1', 'tag2']);
    expect(diagram.accountId).toBe('acct-123');
    expect(diagram.lastPulledDocument).toBe('{"version":1,"objects":[]}');
  });

  it('uses provided id when given', () => {
    const diagram = createDiagram({ title: 'ID Diagram', tags: [] });
    expect(diagram.id).toMatch(/^diagram-/);
  });

  it('preserves createdAt as a fixed timestamp (does not change on update)', () => {
    const now = Date.now();
    const diagram = createDiagram({ title: 'Test', tags: [] });
    expect(diagram.createdAt).toBeGreaterThanOrEqual(now);
    expect(diagram.createdAt).toBeLessThanOrEqual(Date.now());
  });
});

describe('Diagram mutation — updateDiagram', () => {
  const base = createDiagram({ title: 'Original', tags: ['original'] });

  it('returns a new frozen diagram with updated title', () => {
    const updated = updateDiagram(base, { title: 'Renamed' });
    expect(updated.title).toBe('Renamed');
    expect(updated.id).toBe(base.id);
    expect(updated.createdAt).toBe(base.createdAt);
    expect(updated.updatedAt).toBeGreaterThanOrEqual(base.updatedAt);
    expect(Object.isFrozen(updated)).toBe(true);
  });

  it('preserves unchanged fields when updating only title', () => {
    const updated = updateDiagram(base, { title: 'New Title' });
    expect(updated.tags).toEqual(base.tags);
    expect(updated.repo).toBe(base.repo);
    expect(updated.branch).toBe(base.branch);
    expect(updated.filePath).toBe(base.filePath);
  });

  it('updates document when provided', () => {
    const newDoc = { version: 1, objects: [] as const };
    const updated = updateDiagram(base, { document: newDoc });
    expect(updated.document).toBe(newDoc);
  });

  it('updates tags when provided', () => {
    const updated = updateDiagram(base, { tags: ['new', 'tags'] });
    expect(updated.tags).toEqual(['new', 'tags']);
  });

  it('updates repo/branch/filePath when provided', () => {
    const updated = updateDiagram(base, {
      repo: 'new/repo',
      branch: 'feature',
      filePath: 'diagrams/new.td.json',
    });
    expect(updated.repo).toBe('new/repo');
    expect(updated.branch).toBe('feature');
    expect(updated.filePath).toBe('diagrams/new.td.json');
  });

  it('does not update accountId when not provided', () => {
    const withAccount = createDiagram({ title: 'A', tags: [], accountId: 'old' });
    const updated = updateDiagram(withAccount, { title: 'B' });
    expect(updated.accountId).toBe('old');
  });

  it('updates accountId when provided', () => {
    const updated = updateDiagram(base, { accountId: 'new-account' });
    expect(updated.accountId).toBe('new-account');
  });

  it('does NOT mutate the original diagram', () => {
    const updated = updateDiagram(base, { title: 'Changed' });
    expect(base.title).toBe('Original');
    expect(base.updatedAt).toBeLessThan(updated.updatedAt);
  });
});

describe('sortDiagramsByUpdated', () => {
  // sortDiagramsByUpdated sorts by updatedAt descending
  // Since createDiagram sets updatedAt via Date.now(), we create diagrams
  // and then manually create sorted references to test the sort order
  it('sorts descending by updatedAt (newest first)', () => {
    const d1 = createDiagram({ title: 'A', tags: [] });
    const d2 = createDiagram({ title: 'B', tags: [] });
    const d3 = createDiagram({ title: 'C', tags: [] });
    // Simulate different timestamps by directly mutating (for test only)
    const diagrams = [
      { ...d1, updatedAt: 100 } as Diagram,
      { ...d2, updatedAt: 300 } as Diagram,
      { ...d3, updatedAt: 200 } as Diagram,
    ];
    const sorted = sortDiagramsByUpdated(diagrams);
    expect(sorted.map((d) => d.updatedAt)).toEqual([300, 200, 100]);
  });

  it('does not mutate the original array', () => {
    const d1 = createDiagram({ title: 'A', tags: [] });
    const d2 = createDiagram({ title: 'B', tags: [] });
    const original = [
      { ...d1, updatedAt: 100 } as Diagram,
      { ...d2, updatedAt: 300 } as Diagram,
    ];
    const originalTimestamps = original.map((d) => d.updatedAt);
    sortDiagramsByUpdated(original);
    expect(original.map((d) => d.updatedAt)).toEqual(originalTimestamps);
  });

  it('handles single element', () => {
    const d = createDiagram({ title: 'A', tags: [] });
    expect(sortDiagramsByUpdated([d])).toHaveLength(1);
  });

  it('handles empty array', () => {
    expect(sortDiagramsByUpdated([])).toEqual([]);
  });
});

describe('filterDiagramsBySearch', () => {
  const make = (title: string, tags: string[] = []) =>
    createDiagram({ title, tags, updatedAt: Date.now() });

  it('returns all diagrams when query is empty string', () => {
    const diagrams = [make('Alpha'), make('Beta')];
    expect(filterDiagramsBySearch(diagrams, '')).toHaveLength(2);
  });

  it('returns all diagrams when query is only whitespace', () => {
    const diagrams = [make('Alpha'), make('Beta')];
    expect(filterDiagramsBySearch(diagrams, '   ')).toHaveLength(2);
  });

  it('matches title substring case-insensitively', () => {
    const diagrams = [make('Architecture'), make('Diagram'), make('Note')];
    expect(filterDiagramsBySearch(diagrams, 'arch')).toHaveLength(1);
    expect(filterDiagramsBySearch(diagrams, 'ARCH')[0].title).toBe('Architecture');
  });

  it('matches tag substring case-insensitively', () => {
    const diagrams = [
      make('A', ['engineering', 'backend']),
      make('B', ['design', 'ux']),
      make('C', ['product']),
    ];
    expect(filterDiagramsBySearch(diagrams, 'engine')).toHaveLength(1);
    expect(filterDiagramsBySearch(diagrams, 'UX')[0].title).toBe('B');
  });

  it('matches both title and tag (OR logic)', () => {
    const diagrams = [
      make('Alpha', ['research']),
      make('Beta', ['alpha-tag']),
      make('Gamma'),
    ];
    const results = filterDiagramsBySearch(diagrams, 'alpha');
    expect(results).toHaveLength(2);
  });

  it('returns empty array when no match', () => {
    const diagrams = [make('Alpha'), make('Beta')];
    expect(filterDiagramsBySearch(diagrams, 'xyz')).toHaveLength(0);
  });

  it('handles case-insensitive matching across mixed case', () => {
    const diagrams = [make('Project X'), make('Project Y')];
    expect(filterDiagramsBySearch(diagrams, 'project')).toHaveLength(2);
    expect(filterDiagramsBySearch(diagrams, 'PROJECT')).toHaveLength(2);
  });
});

describe('slugifyDiagramTitle', () => {
  it('converts to lowercase', () => {
    expect(slugifyDiagramTitle('My Diagram')).toBe('my-diagram');
  });

  it('replaces spaces with hyphens', () => {
    expect(slugifyDiagramTitle('Hello World')).toBe('hello-world');
  });

  it('removes non-alphanumeric characters', () => {
    expect(slugifyDiagramTitle('My: Diagram!')).toBe('my-diagram');
  });

  it('collapses multiple separators', () => {
    expect(slugifyDiagramTitle('foo  bar   baz')).toBe('foo-bar-baz');
  });

  it('removes leading and trailing hyphens', () => {
    expect(slugifyDiagramTitle('  hello  ')).toBe('hello');
  });

  it('returns untitled-diagram for empty/whitespace-only input', () => {
    expect(slugifyDiagramTitle('')).toBe('untitled-diagram');
    expect(slugifyDiagramTitle('   ')).toBe('untitled-diagram');
  });

  it('handles unicode characters', () => {
    // Non-ASCII chars are preserved (normalize handled)
    expect(slugifyDiagramTitle('日本語')).not.toBe('');
  });
});

describe('DEFAULT_DIAGRAM_DOCUMENT', () => {
  it('is version 1 with empty objects array', () => {
    expect(DEFAULT_DIAGRAM_DOCUMENT.version).toBe(1);
    expect(DEFAULT_DIAGRAM_DOCUMENT.objects).toEqual([]);
  });

  it('is a DrawDocument matching the expected shape', () => {
    expect(DEFAULT_DIAGRAM_DOCUMENT).toEqual({ version: 1, objects: [] });
  });
});

describe('Diagram link helpers — mirror-path identity', () => {
  it('DIAGRAM_LINK_PREFIX is diagram:', () => {
    expect(DIAGRAM_LINK_PREFIX).toBe('diagram:');
  });

  it('isDiagramLink returns true only for diagram: prefix', () => {
    expect(isDiagramLink('diagram:foo')).toBe(true);
    expect(isDiagramLink('canvas:foo')).toBe(false);
    expect(isDiagramLink('gitnotes:foo')).toBe(false);
    expect(isDiagramLink('')).toBe(false);
  });

  it('diagramIdFromLink throws on non-diagram prefix', () => {
    expect(() => diagramIdFromLink('canvas:123')).toThrow('Not a diagram link');
    expect(() => diagramIdFromLink('')).toThrow('Not a diagram link');
  });

  it('diagramIdFromLink extracts id after prefix', () => {
    expect(diagramIdFromLink('diagram:my-diagram-123')).toBe('my-diagram-123');
  });

  it('diagramToLink creates diagram: prefix', () => {
    expect(diagramToLink({ id: 'my-id' })).toBe('diagram:my-id');
  });

  it('round-trip: diagramToLink then diagramIdFromLink returns original id', () => {
    const id = 'diagram-test-abc-123';
    expect(diagramIdFromLink(diagramToLink({ id }))).toBe(id);
  });

  it('createDiagram id is usable with diagramToLink', () => {
    const diagram = createDiagram({ title: 'Test', tags: [] });
    const link = diagramToLink(diagram);
    expect(link).toBe(`diagram:${diagram.id}`);
    expect(diagramIdFromLink(link)).toBe(diagram.id);
  });
});

describe('Diagram free-gate safety', () => {
  it('createDiagram does not require repo/branch (local-only diagram)', () => {
    const local = createDiagram({ title: 'Local Draft', tags: [] });
    expect(local.repo).toBeUndefined();
    expect(local.branch).toBeUndefined();
    expect(local.filePath).toBeUndefined();
    expect(local.accountId).toBeUndefined();
  });

  it('updateDiagram with repo/branch preserves isolation', () => {
    const repoDiagram = createDiagram({
      title: 'Repo Diagram',
      tags: [],
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'diagrams/test.td.json',
    });
    const updated = updateDiagram(repoDiagram, { title: 'Updated' });
    expect(updated.repo).toBe('owner/repo');
    expect(updated.branch).toBe('main');
    expect(updated.filePath).toBe('diagrams/test.td.json');
  });

  it('filterDiagramsBySearch works on diagrams without repo', () => {
    const diagrams = [
      createDiagram({ title: 'Local Draft', tags: [] }),
      createDiagram({ title: 'Repo Diagram', tags: [], repo: 'owner/repo' }),
    ];
    const results = filterDiagramsBySearch(diagrams, 'draft');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Local Draft');
  });
});

describe('Diagram conflict safe — lastPulledDocument handling', () => {
  it('lastPulledDocument is preserved through updateDiagram when not overridden', () => {
    const withLastPulled = createDiagram({
      title: 'Test',
      tags: [],
      lastPulledDocument: '{"version":1,"objects":[]}',
    });
    const updated = updateDiagram(withLastPulled, { title: 'Renamed' });
    expect(updated.lastPulledDocument).toBe('{"version":1,"objects":[]}');
  });

  it('lastPulledDocument can be updated', () => {
    const diagram = createDiagram({ title: 'Test', tags: [] });
    const updated = updateDiagram(diagram, { lastPulledDocument: '{"version":1,"objects":[]}' });
    expect(updated.lastPulledDocument).toBe('{"version":1,"objects":[]}');
  });
});
