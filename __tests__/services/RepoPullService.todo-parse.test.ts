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

const mockLocalTodos: any[] = [];

jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: jest.fn(),
    getAllNotes: jest.fn(async () => []),
    saveAllNotes: jest.fn(async () => undefined),
    getAllTodos: jest.fn(async () => mockLocalTodos),
    saveAllTodos: jest.fn(async () => undefined),
    getAllCanvases: jest.fn(async () => []),
    mutateCanvases: jest.fn(async (mutator: any) => mutator([])),
  },
}));

jest.mock('../../src/services/GitService', () => ({
  GitService: {
    invalidateRepoFoldersCache: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/NoteSyncQueueService', () => ({
  NoteSyncQueueService: {
    getAll: jest.fn(async () => []),
    isTombstoned: jest.fn(async () => false),
  },
}));

import { pullFromSingleRepo } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';

const remoteFiles: Record<string, string> = {};

describe('RepoPullService todo JSON parse resilience (#1008)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalTodos.length = 0;
    Object.keys(remoteFiles).forEach((k) => delete remoteFiles[k]);
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (StorageService.getAllTodos as jest.Mock).mockResolvedValue(mockLocalTodos);
  });

  function remoteTodo(path: string, content: string): void {
    remoteFiles[path] = content;
  }

  function applyRemoteTree(): void {
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue(
      Object.keys(remoteFiles).map((path) => ({ type: 'blob', path, sha: 'a' })),
    );
    (GitHubService.getFileContent as jest.Mock).mockImplementation(
      async (_owner: string, _repo: string, path: string) => remoteFiles[path] ?? null,
    );
  }

  it('imports a valid JSON todo and skips malformed ones without crashing', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    remoteTodo(
      'todos/valid.json',
      JSON.stringify({ text: 'Write tests', completed: false, priority: 1, tags: ['dev'] }, null, 2),
    );
    remoteTodo(
      'todos/broken.json',
      '{ this is not valid JSON !!!',
    );
    applyRemoteTree();

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(1);
    const saved = (StorageService.saveAllTodos as jest.Mock).mock.calls[0][0] as unknown[];
    expect(saved).toHaveLength(1);
    expect((saved[0] as { text: string }).text).toBe('Write tests');

    const parseError = errorSpy.mock.calls.find(([msg]) => String(msg).includes('Failed to parse todo JSON'));
    expect(parseError).toBeTruthy();
    expect(String(parseError?.[0])).toContain('todos/broken.json');
    errorSpy.mockRestore();
  });

  it('skips non-JSON content (markdown/frontmatter) inside .json files and reports the count', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    remoteTodo('todos/valid.json', JSON.stringify({ text: 'Keep me', completed: false }));
    remoteTodo(
      'todos/legacy.md.json',
      '---\nid: abc\ntext: A frontmatter todo\ncompleted: false\n---',
    );
    remoteTodo('todos/empty.json', '');
    applyRemoteTree();

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(1);
    const saved = (StorageService.saveAllTodos as jest.Mock).mock.calls[0][0] as unknown[];
    expect(saved).toHaveLength(1);

    const summary = errorSpy.mock.calls.find(([msg]) => String(msg).includes('Skipped 2 todo file(s)'));
    expect(summary).toBeTruthy();
    expect(String(summary?.[0])).toContain('todos/legacy.md.json');
    expect(String(summary?.[0])).toContain('todos/empty.json');
    errorSpy.mockRestore();
  });

  it('leaves markdown todo files (.md) untouched and unimported', async () => {
    remoteTodo(
      'todos/note-style.md',
      '---\nid: x\ntext: Markdown todo\ncompleted: false\n---',
    );
    remoteTodo('todos/valid.json', JSON.stringify({ text: 'Only real todo', completed: false }));
    applyRemoteTree();

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(1);
    expect(StorageService.saveAllTodos as jest.Mock).toHaveBeenCalledTimes(1);
  });
});
