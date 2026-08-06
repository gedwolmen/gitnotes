jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursiveOrThrow: jest.fn(),
    getFileContent: jest.fn(),
    getRepoContents: jest.fn(async () => []),
    updateFile: jest.fn(async () => ({ ok: true })),
  },
}));

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(),
    saveAllNotes: jest.fn(),
  },
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';

describe('RepoPullService thoughts/ exclusion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllNotes as jest.Mock).mockResolvedValue([]);
  });

  it('does NOT import thoughts/*.md files as notes', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/real-note.md', sha: 'a' },
      { type: 'blob', path: 'thoughts/20240101-120000-abc12345.md', sha: 'b' },
      { type: 'blob', path: 'thoughts/20240102-130000-def67890.md', sha: 'c' },
    ]);

    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce('# Real note\n\nHello');

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];

    expect(saved).toHaveLength(1);
    expect(saved[0].filePath).toBe('notes/real-note.md');
    expect(saved.find((n: any) => n.filePath?.startsWith('thoughts/'))).toBeUndefined();
  });

  it('imports notes normally when no thoughts/ files exist', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'notes/note-a.md', sha: 'a' },
      { type: 'blob', path: 'notes/note-b.md', sha: 'b' },
    ]);

    (GitHubService.getFileContent as jest.Mock)
      .mockResolvedValueOnce('# Note A')
      .mockResolvedValueOnce('# Note B');

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved).toHaveLength(2);
  });

  it('handles repo with only thoughts/ files (no notes imported)', async () => {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([
      { type: 'blob', path: 'thoughts/20240101-120000-abc12345.md', sha: 'a' },
    ]);

    await pullFromSingleRepo('org/repo');

    const saved = (StorageService.saveAllNotes as jest.Mock).mock.calls[0][0];
    expect(saved).toHaveLength(0);
  });
});
