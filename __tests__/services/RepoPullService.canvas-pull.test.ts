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
  },
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

import { __resetCanvasParseLogForTests, pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';

const scene = {
  version: 1,
  width: 800,
  height: 600,
  background: '#FFFFFF',
  elements: [],
};

const buildCanvas = (overrides: Record<string, unknown>) => ({
  id: 'c-' + Math.random().toString(36).slice(2),
  title: 'canvas',
  scene,
  tags: [],
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('RepoPullService canvas pull + reconcile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalCanvases.length = 0;
    __resetCanvasParseLogForTests();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(null);
  });

  // Bug #885: fetchDirectoryFiles used a non-recursive listing, so a canvas
  // nested under canvases/<subdir>/ was never pulled.
  it('pulls canvases nested under subdirectories', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'canvases/nested/foo.json', sha: 'a' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) =>
        path === 'canvases/nested/foo.json' ? JSON.stringify(scene) : null,
    );

    await pullFromSingleRepo('org/repo');

    const pulledCanvas = mockLocalCanvases.find(
      (c: any) => c.filePath === 'canvases/nested/foo.json',
    );
    expect(pulledCanvas).toBeDefined();
    expect(pulledCanvas.scene).toEqual(scene);
    expect(pulledCanvas.lastPulledScene).toBe(JSON.stringify(scene));
  });

  // Bug #1160: canvas JSON parse failures warned without naming the file.
  it('includes the file path in a canvas JSON parse warning', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'canvases/broken.json', sha: 'a' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) =>
        path === 'canvases/broken.json' ? '{ truncated' : null,
    );

    await pullFromSingleRepo('org/repo');

    const parseWarning = warnSpy.mock.calls.find(([msg]) =>
      String(msg).includes('Failed to parse canvas JSON'),
    );
    expect(parseWarning).toBeTruthy();
    expect(parseWarning).toContain('canvases/broken.json');
    warnSpy.mockRestore();
  });

  // Bug #1191: a malformed remote canvas re-warned on every pull; it should
  // warn once per session and stay quiet until it parses cleanly again.
  it('warns a malformed canvas only once across repeat pulls', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seedBroken = () => {
      (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
        { type: 'blob', path: 'canvases/broken.json', sha: 'a' },
      ]);
      (GitHubService.getFileContent as jest.Mock).mockImplementation(
        async (_owner: string, _repo: string, path: string) =>
          path === 'canvases/broken.json' ? '{ truncated' : null,
      );
    };
    seedBroken();

    await pullFromSingleRepo('org/repo');
    await pullFromSingleRepo('org/repo');

    const warns = warnSpy.mock.calls.filter(([msg]) =>
      String(msg).includes('Failed to parse canvas JSON'),
    );
    expect(warns).toHaveLength(1);
    warnSpy.mockRestore();
  });

  // Bug #886: a canvas whose remote file was deleted, and which was NOT edited
  // locally since the last pull, must be dropped.
  it('drops a locally-unmodified canvas whose remote file was deleted', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    mockLocalCanvases.push(
      buildCanvas({
        id: 'gone',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'canvases/gone.json',
        lastPulledScene: JSON.stringify(scene),
      }),
    );

    await pullFromSingleRepo('org/repo');

    expect(mockLocalCanvases.find((c: any) => c.id === 'gone')).toBeUndefined();
    expect(mockLocalCanvases).toHaveLength(0);
  });

  // Same remote deletion, but the local scene was edited since the last pull:
  // the canvas carries unsaved local work and must be kept.
  it('keeps a locally-edited canvas whose remote file was deleted', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    mockLocalCanvases.push(
      buildCanvas({
        id: 'edited',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'canvases/edited.json',
        scene: { ...scene, background: '#000000' },
        lastPulledScene: JSON.stringify(scene),
      }),
    );

    await pullFromSingleRepo('org/repo');

    expect(mockLocalCanvases.find((c: any) => c.id === 'edited')).toBeDefined();
  });

  // Local-only canvases (no filePath) are never reconciled away.
  it('keeps local-only canvases (no filePath) when the remote is empty', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    mockLocalCanvases.push(buildCanvas({ id: 'draft', repo: 'org/repo', branch: 'main' }));

    await pullFromSingleRepo('org/repo');

    expect(mockLocalCanvases.find((c: any) => c.id === 'draft')).toBeDefined();
  });
});
