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
    saveAllTodos: jest.fn(async (todos: any[]) => {
      mockLocalTodos.length = 0;
      mockLocalTodos.push(...todos);
    }),
    getAllCanvases: jest.fn(async () => []),
    mutateCanvases: jest.fn(async (mutator: any) => mutator([])),
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

const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

const seed = (paths: Record<string, string>) => {
  (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue(
    Object.keys(paths).map((p) => ({ type: 'blob', path: p, sha: 'a' })),
  );
  (GitHubService.getFileContent as jest.Mock).mockImplementation(
    async (_owner: string, _repo: string, path: string) => paths[path] ?? null,
  );
};

describe('RepoPullService todo parse handling (#1008)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLocalTodos.length = 0;
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (StorageService.getSavedRepositories as jest.Mock).mockResolvedValue([
      { path: 'org/repo', branch: 'main' },
    ]);
    (GitHubService.getTreeRecursiveOrThrow as jest.Mock).mockResolvedValue([]);
    (GitHubService.getFileContent as jest.Mock).mockResolvedValue(null);
  });

  it('pulls a valid JSON todo', async () => {
    seed({
      'todos/milk.json': JSON.stringify({ text: 'Buy milk', completed: false, priority: 'high' }),
    });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(1);
    expect(mockLocalTodos).toHaveLength(1);
    expect(mockLocalTodos[0].filePath).toBe('todos/milk.json');
    expect(mockLocalTodos[0].text).toBe('Buy milk');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('skips a malformed JSON todo without crashing and logs the parse error with the path', async () => {
    seed({ 'todos/broken.json': '{ "text": "truncated' });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(0);
    expect(mockLocalTodos).toHaveLength(0);
    const parseError = errorSpy.mock.calls.find(([msg]) =>
      String(msg).includes('Failed to parse todo JSON'),
    );
    expect(parseError).toBeTruthy();
    expect(String(parseError?.[0])).toContain('todos/broken.json');
  });

  it('skips non-JSON content (markdown/frontmatter) in a .json file without a per-file error', async () => {
    seed({ 'todos/note.md.json': '---\nid: 1\ntext: Buy milk\n---\n' });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(0);
    expect(mockLocalTodos).toHaveLength(0);
    expect(
      errorSpy.mock.calls.find(([msg]) => String(msg).includes('Failed to parse todo JSON')),
    ).toBeUndefined();
    expect(
      errorSpy.mock.calls.find(([msg]) => String(msg).includes('todos/note.md.json')),
    ).toBeTruthy();
  });

  it('skips a JSON array (not a todo object) in a .json file', async () => {
    seed({ 'todos/list.json': '[1, 2, 3]' });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(0);
    expect(mockLocalTodos).toHaveLength(0);
    expect(
      errorSpy.mock.calls.find(([msg]) => String(msg).includes('Failed to parse todo JSON')),
    ).toBeUndefined();
  });

  it('keeps an existing local todo when its remote file is malformed (no data loss)', async () => {
    mockLocalTodos.push({
      id: 'existing',
      text: 'Buy milk',
      completed: false,
      repo: 'org/repo',
      branch: 'main',
      filePath: 'todos/milk.json',
    });
    seed({ 'todos/milk.json': '{ broken' });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(0);
    expect(mockLocalTodos.find((t: any) => t.filePath === 'todos/milk.json')).toBeDefined();
  });

  it('logs an error summary listing the skipped files', async () => {
    seed({ 'todos/broken.json': '{ broken' });

    await pullFromSingleRepo('org/repo');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipped 1 todo file(s) with invalid JSON content: todos/broken.json',
      ),
    );
  });

  it('leaves markdown todo files (.md) untouched and unimported', async () => {
    seed({
      'todos/note-style.md': '---\nid: x\ntext: Markdown todo\ncompleted: false\n---',
      'todos/valid.json': JSON.stringify({ text: 'Only real todo', completed: false }),
    });

    const result = await pullFromSingleRepo('org/repo');

    expect(result.todos).toBe(1);
    expect(mockLocalTodos).toHaveLength(1);
    expect(mockLocalTodos[0].filePath).toBe('todos/valid.json');
  });
});
