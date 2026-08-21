// Progress-threading tests for RepoPullService (task-4 of the add-repo-freeze
// fix). Mirrors the mock strategy of RepoPullService.canvas-pull.test.ts.
//
// The post-clone import (notes/todos/canvases/templates) previously ran with
// NO progress callback, so the shared progress bar froze at the last clone
// state while the pull ran. These tests assert that pullFromSingleRepo now
// threads an optional onProgress callback through every per-type pull and
// emits app-authored phases in a sensible order with monotonic loaded counts.

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
    updateFile: jest.fn(async () => ({ ok: true })),
  },
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api' as const) },
}));

const mockLocalCanvases: any[] = [];

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(async () => []),
    saveAllNotes: jest.fn(async () => undefined),
    getAllTodos: jest.fn(async () => []),
    saveAllTodos: jest.fn(async () => undefined),
    getAllCanvases: jest.fn(async () => mockLocalCanvases),
    mutateCanvases: jest.fn(async (mutator: any) => mutator(mockLocalCanvases)),
    loadCustomTemplates: jest.fn(async () => []),
    saveCustomTemplates: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

// No template repo configured by default, so the templates pull does not run
// and `pullTemplatesFromRepo` is not reached in the base phase-order test.
jest.mock('../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: { get: jest.fn(async () => null) },
}));

import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';
import { TemplateRepoPreferenceService } from '../../src/services/TemplateRepoPreferenceService';

type ProgressCall = { phase: string; loaded: number; total: number | null };

const scene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [],
};

const DEFAULT_TREE = [
  { type: 'blob', path: 'notes/alpha.md', sha: 'a' },
  { type: 'blob', path: 'notes/beta.md', sha: 'b' },
  { type: 'blob', path: 'notes/gamma.md', sha: 'c' },
  { type: 'blob', path: 'todos/list.json', sha: 'd' },
  { type: 'blob', path: 'canvases/board.json', sha: 'e' },
];

describe('RepoPullService progress threading', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalCanvases.length = 0;
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (TemplateRepoPreferenceService.get as jest.Mock).mockResolvedValue(null);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue(DEFAULT_TREE);
    // Notes resolve on microtasks; todos/canvases resolve on later macrotasks
    // so the three concurrent per-type pulls emit phases in a deterministic
    // order (notes → todos → canvases) matching the app-authored sequence.
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) => {
        if (path.startsWith('notes/')) return `# ${path}`;
        if (path.startsWith('todos/')) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          return JSON.stringify({ text: 'Todo item', completed: false });
        }
        if (path.startsWith('canvases/')) {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return JSON.stringify(scene);
        }
        return null;
      },
    );
  });

  it('emits phases in order Reading → notes → todos → canvases with monotonic loaded counts', async () => {
    const calls: ProgressCall[] = [];
    const onProgress = (phase: string, loaded: number, total: number | null) => {
      calls.push({ phase, loaded, total });
    };

    await pullFromSingleRepo('org/repo', onProgress);

    // First call announces the pull start with no known total.
    expect(calls[0]).toEqual({ phase: 'Reading repository…', loaded: 0, total: null });

    // Distinct phase sequence — the per-type pulls each emit their phase as
    // they process fetched files, and the templates pull is skipped entirely
    // (no template repo configured).
    expect([...new Set(calls.map((c) => c.phase))]).toEqual([
      'Reading repository…',
      'Importing notes…',
      'Importing todos…',
      'Importing canvases…',
    ]);

    // Loaded counts must be monotonic (non-decreasing) within each phase and
    // must reach the phase total (3 notes, 1 todo, 1 canvas).
    const byPhase = new Map<string, ProgressCall[]>();
    for (const call of calls) {
      byPhase.set(call.phase, [...(byPhase.get(call.phase) ?? []), call]);
    }
    for (const [phase, phaseCalls] of byPhase) {
      if (phase === 'Reading repository…') continue;
      const totals = new Set(phaseCalls.map((c) => c.total));
      expect(totals.size).toBe(1);
      for (let i = 1; i < phaseCalls.length; i++) {
        expect(phaseCalls[i].loaded).toBeGreaterThanOrEqual(phaseCalls[i - 1].loaded);
      }
      const last = phaseCalls[phaseCalls.length - 1];
      expect(last.loaded).toBe(last.total);
    }

    expect(byPhase.get('Importing notes…')?.length).toBe(3);
    expect(byPhase.get('Importing todos…')?.length).toBe(1);
    expect(byPhase.get('Importing canvases…')?.length).toBe(1);
  });

  it('is a no-op when onProgress is omitted (existing behavior unchanged)', async () => {
    const result = await pullFromSingleRepo('org/repo');

    expect(result).toEqual({ repos: 1, notes: 3, canvases: 1, todos: 1, templates: 0 });
    // Notes were still imported through the normal path.
    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0] as unknown[];
    expect(saved).toHaveLength(3);
    expect(saved.map((n) => (n as { filePath: string }).filePath)).toEqual([
      'notes/alpha.md',
      'notes/beta.md',
      'notes/gamma.md',
    ]);
  });

  it('forwards onProgress to the templates pull when a template repo is configured', async () => {
    (TemplateRepoPreferenceService.get as jest.Mock).mockResolvedValue({
      repoPath: 'org/repo',
      branch: 'main',
    });
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/alpha.md', sha: 'a' },
      { type: 'blob', path: 'todos/list.json', sha: 'b' },
      { type: 'blob', path: 'canvases/board.json', sha: 'c' },
      { type: 'blob', path: 'templates/note-template.md', sha: 'd' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) => {
        if (path === 'notes/alpha.md') return '# Alpha';
        if (path === 'todos/list.json') return JSON.stringify({ text: 'Todo', completed: false });
        if (path === 'canvases/board.json') return JSON.stringify(scene);
        if (path === 'templates/note-template.md')
          return '---\nname: My Template\n---\n# {{title}}';
        return null;
      },
    );

    const phases: string[] = [];
    await pullFromSingleRepo('org/repo', (phase) => {
      phases.push(phase);
    });

    expect(phases[0]).toBe('Reading repository…');
    // The templates pull runs after the per-type Promise.all settles, so it
    // is always the final phase emitted.
    expect(phases[phases.length - 1]).toBe('Importing templates…');
    expect(new Set(phases)).toEqual(
      new Set([
        'Reading repository…',
        'Importing notes…',
        'Importing todos…',
        'Importing canvases…',
        'Importing templates…',
      ]),
    );
  });
});
