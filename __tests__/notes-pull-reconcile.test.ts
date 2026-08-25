jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursive: jest.fn(),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
    getSavedRepositories: jest.fn(),
    updateFile: jest.fn(async () => ({ ok: true })),
  },
}));

jest.mock('../src/services/SyncEngineService', () => ({
  SyncEngineService: { getMode: jest.fn(async () => 'api' as const) },
}));

jest.mock('../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

jest.mock('../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

import { pullFromSingleRepo } from '../src/services/RepoPullService';
import { GitHubService } from '../src/services/GitHubService';
import { StorageService } from '../src/services/StorageService';

const buildNote = (overrides: Record<string, unknown>) => ({
  id: 'n-' + Math.random().toString(36).slice(2),
  title: 'note',
  content: 'body',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  ...overrides,
});

describe('RepoPullService notes reconciliation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
  });

  // The bug: pullNotesFromRepo previously short-circuited when the remote tree
  // had zero matching note blobs, *before* reconciling local notes against the
  // (empty) remote set. Result: every notes file deleted on the remote left
  // its local copy lingering forever.
  it('drops local notes when the remote tree has zero notes', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      buildNote({
        id: 'ghost',
        title: 'Ghost',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/ghost.md',
      }),
    ]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved.find((n: any) => n.id === 'ghost')).toBeUndefined();
    expect(saved).toHaveLength(0);
  });

  it('drops local notes whose filePath disappeared but keeps siblings still present', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/keep.md', sha: 'a' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue('# keep\n\nbody');
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      buildNote({
        id: 'keep',
        title: 'keep',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/keep.md',
      }),
      buildNote({
        id: 'gone',
        title: 'gone',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/gone.md',
      }),
    ]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved.map((n: any) => n.id).sort()).toEqual(['keep']);
  });

  it('imports markdown, neorg, and org files as notes', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/markdown.md', sha: 'md' },
      { type: 'blob', path: 'notes/neorg.norg', sha: 'norg' },
      { type: 'blob', path: 'notes/org.org', sha: 'org' },
    ]);
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) => `# ${path}`,
    );
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0] as Array<{
      filePath: string;
      format: string;
    }>;
    expect(saved.map((note) => [note.filePath, note.format])).toEqual([
      ['notes/markdown.md', 'markdown'],
      ['notes/neorg.norg', 'neorg'],
      ['notes/org.org', 'org'],
    ]);
  });

  // Pending uploads have no filePath until NoteSyncQueueService writes one
  // back after a successful push. They must survive reconciliation regardless
  // of the remote state, otherwise a pull racing a queued upload would erase
  // the user's draft.
  it('preserves local-only notes (no filePath) even when remote is empty', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      buildNote({ id: 'draft', title: 'Draft', repo: 'org/repo', branch: 'main' }),
      buildNote({ id: 'pure-local', title: 'Pure local' }),
    ]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved.map((n: any) => n.id).sort()).toEqual(['draft', 'pure-local']);
  });

  it('does not touch notes that belong to a different repo or branch', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      buildNote({
        id: 'other-repo',
        repo: 'other/repo',
        branch: 'main',
        filePath: 'notes/x.md',
      }),
      buildNote({
        id: 'other-branch',
        repo: 'org/repo',
        branch: 'develop',
        filePath: 'notes/y.md',
      }),
    ]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved.map((n: any) => n.id).sort()).toEqual(['other-branch', 'other-repo']);
  });

  // Transient API failure (auth/rate-limit/network) must NOT wipe local notes.
  // The strict tree fetch throws, the outer try/catch returns 0, and saveAllNotes
  // is never called.
  it('skips reconciliation when the tree fetch throws (transient failure)', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockRejectedValue(
      new Error('rate limited'),
    );
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([
      buildNote({
        id: 'safe',
        repo: 'org/repo',
        branch: 'main',
        filePath: 'notes/safe.md',
      }),
    ]);

    await pullFromSingleRepo('org/repo');

    expect(StorageService.saveAllNotes).not.toHaveBeenCalled();
  });
});
