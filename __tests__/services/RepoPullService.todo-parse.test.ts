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

import { pullFromSingleRepo, __resetSkippedTodoLogForTests } from '../../src/services/RepoPullService';
import { GitHubService } from '../../src/services/GitHubService';
import { StorageService } from '../../src/services/StorageService';

const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

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
    __resetSkippedTodoLogForTests();
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
    const parseError = warnSpy.mock.calls.find(([msg]) =>
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
      warnSpy.mock.calls.find(([msg]) => String(msg).includes('Failed to parse todo JSON')),
    ).toBeUndefined();
    expect(
      warnSpy.mock.calls.find(([msg]) => String(msg).includes('todos/note.md.json')),
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

  it('logs a warning summary listing newly-skipped files', async () => {
    seed({ 'todos/broken.json': '{ broken' });

    await pullFromSingleRepo('org/repo');

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Skipped 1 todo file(s) with invalid JSON content: todos/broken.json',
      ),
    );
  });

  it('does not re-warn the same skipped files on a repeat pull (#1161)', async () => {
    seed({ 'todos/broken.json': '{ broken' });

    await pullFromSingleRepo('org/repo');
    warnSpy.mockClear();
    await pullFromSingleRepo('org/repo');

    expect(
      warnSpy.mock.calls.filter(([msg]) => String(msg).includes('Skipped')),
    ).toHaveLength(0);
    expect(
      warnSpy.mock.calls.filter(([msg]) => String(msg).includes('Failed to parse todo JSON')),
    ).toHaveLength(0);
  });

  it('warns again only for newly-broken files on a repeat pull (#1161)', async () => {
    seed({ 'todos/broken.json': '{ broken' });

    await pullFromSingleRepo('org/repo');
    warnSpy.mockClear();

    seed({
      'todos/broken.json': '{ broken',
      'todos/worse.json': '{ also broken',
    });
    await pullFromSingleRepo('org/repo');

    const summary = warnSpy.mock.calls.find(([msg]) => String(msg).includes('Skipped'));
    expect(summary).toBeTruthy();
    expect(String(summary?.[0])).toContain('Skipped 1 todo file(s)');
    expect(String(summary?.[0])).toContain('todos/worse.json');
    expect(String(summary?.[0])).not.toContain('todos/broken.json');
  });

  it('re-warns a previously-skipped file that breaks again after being fixed (#1161)', async () => {
    seed({ 'todos/flaky.json': '{ broken' });
    await pullFromSingleRepo('org/repo');

    seed({ 'todos/flaky.json': JSON.stringify({ text: 'Fixed', completed: false }) });
    await pullFromSingleRepo('org/repo');
    expect(mockLocalTodos).toHaveLength(1);
    warnSpy.mockClear();

    seed({ 'todos/flaky.json': '{ broken again' });
    await pullFromSingleRepo('org/repo');

    expect(
      warnSpy.mock.calls.some(([msg]) =>
        String(msg).includes('todos/flaky.json'),
      ),
    ).toBe(true);
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
