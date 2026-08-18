jest.mock('../../../src/services/git/LocalGitWriter', () => {
  const writeAndCommit = jest.fn(async () => ({ success: true }));
  const push = jest.fn(async () => ({ success: true }));
  (globalThis as any).__lgwForMigrationTest = { writeAndCommit, push };
  return {
    LocalGitWriter: { writeAndCommit, push },
  };
});

jest.mock('../../../src/services/StorageService', () => ({
  StorageService: {
    getAllNotes: jest.fn(async () => [
      {
        id: 'n1',
        title: 'Local note',
        content: 'body',
        repo: 'me/repo',
        filePath: 'notes/local.md',
        format: 'markdown',
        tags: [],
      },
      {
        id: 'n2',
        title: 'Other repo',
        content: 'x',
        repo: 'other/repo',
        filePath: 'notes/x.md',
      },
      // No filePath — never persisted to a repo, must be skipped.
      { id: 'n3', title: 'Draft', content: 'unsaved', repo: 'me/repo' },
    ]),
    getAllTodos: jest.fn(async () => [
      { id: 't1', text: 'do thing', repo: 'me/repo', filePath: 'todos/do-thing.json' },
    ]),
    mutateCanvases: jest.fn(async (mutator: any) => {
      const list = [
        { id: 'c1', title: 'Diagram', scene: { nodes: [] }, repo: 'me/repo', filePath: 'canvases/d.json' },
      ];
      mutator(list);
    }),
  },
}));

jest.mock('../../../src/services/GitHubService', () => ({
  GitHubService: {
    getUser: jest.fn(() => ({ login: 'me', name: 'Me User', email: 'me@example.com' })),
  },
}));

jest.mock('../../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => 'tok') },
}));

jest.mock('../../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: { get: jest.fn(async () => null) },
}));

jest.mock('../../../src/stores/templateStore', () => ({
  useTemplateStore: { getState: () => ({ customTemplates: [] }) },
}));

jest.mock('../../../src/services/NoteGitHubSyncService', () => ({
  applyNoteTagsToContent: (content: string) => content,
  applyNoteColorToContent: (content: string) => content,
}));

jest.mock('../../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: { purgeForRepo: jest.fn(async () => undefined) },
}));

jest.mock('../../../src/services/TemplateMarkdownService', () => ({
  serializeTemplate: () => '---\n---\n',
  templateSlug: (s: string) => s,
}));

import { CloneMigrationService } from '../../../src/services/git/CloneMigrationService';
import { NoteSyncQueueService } from '../../../src/services/NoteSyncQueueService';

const purgeForRepo = NoteSyncQueueService.purgeForRepo as jest.Mock;

function getLgwMocks() {
  return (globalThis as any).__lgwForMigrationTest as {
    writeAndCommit: jest.Mock;
    push: jest.Mock;
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  const m = getLgwMocks();
  m.writeAndCommit.mockResolvedValue({ success: true });
  m.push.mockResolvedValue({ success: true });
});

describe('CloneMigrationService.migrateRepo', () => {
  test('writes only items whose repo matches and which have a filePath', async () => {
    const report = await CloneMigrationService.migrateRepo('me/repo', 'main');
    expect(report.notes).toBe(1); // n1 in repo with filePath; n2 wrong repo; n3 no filePath
    expect(report.todos).toBe(1);
    expect(report.canvases).toBe(1);
    expect(report.failures).toEqual([]);
    expect(report.success).toBe(true);

    expect(getLgwMocks().writeAndCommit).toHaveBeenCalledTimes(3);
    // All writeAndCommit calls must be staged-only (push:false) — the
    // stage/push engine owns the flush.
    for (const call of getLgwMocks().writeAndCommit.mock.calls) {
      expect(call[0].push).toBe(false);
    }
    expect(getLgwMocks().push).not.toHaveBeenCalled();
    // Leftover API-mode queue items for the migrated repo are purged so
    // the Stage cannot show a mixed API/clone state (issue #902).
    expect(purgeForRepo).toHaveBeenCalledWith('me/repo');
  });

  test('reports failures without pushing (the engine owns the flush)', async () => {
    getLgwMocks().writeAndCommit.mockResolvedValueOnce({
      success: false,
      error: 'disk full',
    });
    const report = await CloneMigrationService.migrateRepo('me/repo', 'main');
    // First call (the note) failed; todo + canvas succeeded.
    expect(report.notes).toBe(0);
    expect(report.todos).toBe(1);
    expect(report.canvases).toBe(1);
    expect(report.failures).toEqual([
      { kind: 'note', filePath: 'notes/local.md', error: 'disk full' },
    ]);
    expect(getLgwMocks().push).not.toHaveBeenCalled();
  });

  test('skips push when nothing migrated', async () => {
    const Storage = require('../../../src/services/StorageService').StorageService;
    Storage.getAllNotes.mockResolvedValueOnce([]);
    Storage.getAllTodos.mockResolvedValueOnce([]);
    Storage.mutateCanvases.mockImplementationOnce(async (mutator: any) => mutator([]));
    const report = await CloneMigrationService.migrateRepo('empty/repo', 'main');
    expect(report.notes).toBe(0);
    expect(report.todos).toBe(0);
    expect(report.canvases).toBe(0);
    expect(getLgwMocks().push).not.toHaveBeenCalled();
  });
});
