// Clone runs through the mocked native GitEngine; the read path
// (listTree / readFile / readBlobAtRef) runs against the real gitFs adapter
// on top of the in-memory expo-file-system mock below — no network, no device.

type FsEntry = { type: 'file' | 'dir'; content?: string };

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir'; content?: string }>();
  (globalThis as Record<string, unknown>).__gitFsServiceTestFsStore = fsStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri.replace(/\/$/, ''));
      return e ? { exists: true, uri, isDirectory: e.type === 'dir' } : { exists: false, uri };
    },
    async deleteAsync(uri: string) {
      const key = uri.replace(/\/$/, '');
      for (const existing of [...fsStore.keys()]) {
        if (existing === key || existing.startsWith(`${key}/`)) fsStore.delete(existing);
      }
    },
    async makeDirectoryAsync(uri: string) {
      fsStore.set(uri.replace(/\/$/, ''), { type: 'dir' });
    },
    async readDirectoryAsync(uri: string) {
      const base = uri.replace(/\/$/, '');
      const dir = fsStore.get(base);
      if (!dir || dir.type !== 'dir') throw new Error(`ENOTDIR: ${uri}`);
      const prefix = `${base}/`;
      const names = new Set<string>();
      for (const key of fsStore.keys()) {
        if (key.startsWith(prefix)) names.add(key.slice(prefix.length).split('/')[0]);
      }
      return [...names];
    },
    async readAsStringAsync(uri: string, opts?: { encoding?: string } | string) {
      const e = fsStore.get(uri);
      if (!e || e.type !== 'file') throw new Error(`File not found: ${uri}`);
      const content = e.content ?? '';
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      if (encoding === 'base64') return Buffer.from(content, 'utf8').toString('base64');
      return content;
    },
    async writeAsStringAsync(uri: string, data?: string) {
      const e = fsStore.get(uri);
      if (e && e.type === 'file') e.content = String(data ?? '');
      else fsStore.set(uri, { type: 'file', content: String(data ?? '') });
    },
  };
});

jest.mock('../../../src/services/git/engine/GitEngine', () => ({
  clone: jest.fn(async () => ''),
}));

jest.mock('../../../src/services/git/lfs', () => ({
  LfsService: { scanRepo: jest.fn(async () => []), clearRepo: jest.fn(async () => undefined) },
}));

jest.mock('../../../src/services/git/gitHttp', () => ({ gitHttp: { request: jest.fn() } }));

function getFsStore(): Map<string, FsEntry> {
  return (globalThis as Record<string, unknown>).__gitFsServiceTestFsStore as Map<string, FsEntry>;
}

import { CloneOutOfMemoryError, GitFsService } from '../../../src/services/git/GitFsService';
import { clone as nativeClone } from '../../../src/services/git/engine/GitEngine';
import { LfsService } from '../../../src/services/git/lfs';

function seedWorktree(files: Record<string, string>, repo = 'me/repo'): string {
  const base = `file:///doc/GitNotes/${repo}`;
  const store = getFsStore();
  store.set(base, { type: 'dir' });
  store.set(`${base}/.git`, { type: 'dir' });
  store.set(`${base}/.git/HEAD`, { type: 'file', content: 'ref: refs/heads/main' });
  for (const [rel, content] of Object.entries(files)) {
    const parts = rel.split('/');
    let acc = base;
    for (const part of parts.slice(0, -1)) {
      acc = `${acc}/${part}`;
      if (!store.has(acc)) store.set(acc, { type: 'dir' });
    }
    store.set(`${base}/${rel}`, { type: 'file', content });
  }
  return base;
}

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore().clear();
  GitFsService.__resetCloneDedupForTest();
});

describe('GitFsService.clone', () => {
  test('calls the native engine with the repo URL, on-disk dest, and repoId', async () => {
    await GitFsService.clone({ repoPath: 'me/repo', branch: 'main', token: 'tok', repoId: 'repo-1' });
    expect(nativeClone).toHaveBeenCalledWith(
      'https://github.com/me/repo.git',
      'file:///doc/GitNotes/me/repo',
      'repo-1',
    );
  });

  test('passes null repoId when omitted', async () => {
    await GitFsService.clone({ repoPath: 'me/repo', branch: 'main' });
    expect(nativeClone).toHaveBeenCalledWith(
      'https://github.com/me/repo.git',
      'file:///doc/GitNotes/me/repo',
      null,
    );
  });

  test('rejects on invalid repoPath without calling the engine', async () => {
    await expect(
      GitFsService.clone({ repoPath: 'not-a-repo', branch: 'main' }),
    ).rejects.toThrow(/Invalid repo path/);
    expect(nativeClone).not.toHaveBeenCalled();
  });

  test('wraps OOM-like clone failures as CloneOutOfMemoryError', async () => {
    (nativeClone as jest.Mock).mockRejectedValueOnce(new RangeError('Array buffer allocation failed'));
    await expect(
      GitFsService.clone({ repoPath: 'me/repo', branch: 'main' }),
    ).rejects.toThrow(CloneOutOfMemoryError);
  });

  test('cleans up the partial clone directory when the engine fails', async () => {
    (nativeClone as jest.Mock).mockRejectedValueOnce(new Error('network failure'));
    await expect(
      GitFsService.clone({ repoPath: 'me/repo', branch: 'main', token: 'tok' }),
    ).rejects.toThrow('network failure');
    expect(getFsStore().has('file:///doc/GitNotes/me/repo')).toBe(false);
  });
});

describe('GitFsService clone-mode reads (worktree-backed)', () => {
  test('listTree returns a sorted recursive listing relative to the repo root', async () => {
    seedWorktree({
      'notes/foo.md': 'foo',
      'notes/sub/bar.md': 'bar',
      'README.md': 'readme',
    });

    const tree = await GitFsService.listTree({ repoPath: 'me/repo', ref: 'main' });

    expect(tree).toEqual([
      { path: 'README.md', type: 'blob', sha: '' },
      { path: 'notes', type: 'tree', sha: '' },
      { path: 'notes/foo.md', type: 'blob', sha: '' },
      { path: 'notes/sub', type: 'tree', sha: '' },
      { path: 'notes/sub/bar.md', type: 'blob', sha: '' },
    ]);
  });

  test('listTree never surfaces .git internals', async () => {
    seedWorktree({ 'notes/foo.md': 'foo' });
    getFsStore().set('file:///doc/GitNotes/me/repo/.git/objects/pack', { type: 'dir' });
    getFsStore().set('file:///doc/GitNotes/me/repo/.git/objects/pack/a.pack', { type: 'file', content: 'x' });

    const tree = await GitFsService.listTree({ repoPath: 'me/repo', ref: 'main' });

    expect(tree.some((e) => e.path.startsWith('.git'))).toBe(false);
  });

  test('listTree returns [] for a worktree with only .git', async () => {
    seedWorktree({});
    const tree = await GitFsService.listTree({ repoPath: 'me/repo', ref: 'main' });
    expect(tree).toEqual([]);
  });

  test('listTree rejects when the repo is not cloned', async () => {
    await expect(
      GitFsService.listTree({ repoPath: 'me/repo', ref: 'main' }),
    ).rejects.toThrow();
  });

  test('readFile returns the worktree file contents', async () => {
    seedWorktree({ 'notes/x.md': 'hello body' });
    const content = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: 'notes/x.md',
    });
    expect(content).toBe('hello body');
  });

  test('readFile returns null for a missing file', async () => {
    seedWorktree({ 'notes/x.md': 'hello body' });
    const content = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: 'notes/missing.md',
    });
    expect(content).toBeNull();
  });

  test('readFile returns null when the repo is not cloned', async () => {
    const content = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: 'notes/x.md',
    });
    expect(content).toBeNull();
  });

  test('readFile rejects an invalid repoPath', async () => {
    await expect(
      GitFsService.readFile({ repoPath: 'not-a-repo', ref: 'main', filepath: 'x.md' }),
    ).rejects.toThrow(/Invalid repo path/);
  });

  test('readFile refuses worktree escapes', async () => {
    seedWorktree({ 'notes/x.md': 'hello body' });
    const content = await GitFsService.readFile({
      repoPath: 'me/repo',
      ref: 'main',
      filepath: '../other-repo/secret.md',
    });
    expect(content).toBeNull();
  });

  test('readBlobAtRef returns decoded content and null when missing', async () => {
    seedWorktree({ 'notes/x.md': 'hello body' });
    const hit = await GitFsService.readBlobAtRef({ repoPath: 'me/repo', ref: 'main', filepath: 'notes/x.md' });
    expect(hit?.content).toBe('hello body');
    const miss = await GitFsService.readBlobAtRef({ repoPath: 'me/repo', ref: 'main', filepath: 'nope.md' });
    expect(miss).toBeNull();
  });
});

describe('GitFsService local repo state', () => {
  test('isCloned reflects the on-disk presence of <root>/.git/HEAD', async () => {
    expect(await GitFsService.isCloned({ repoPath: 'me/repo' })).toBe(false);
    getFsStore().set('file:///doc/GitNotes/me/repo/.git/HEAD', { type: 'file', content: 'ref: refs/heads/main' });
    expect(await GitFsService.isCloned({ repoPath: 'me/repo' })).toBe(true);
  });

  test('removeRepo deletes the on-disk dir and is idempotent', async () => {
    seedWorktree({ 'notes/x.md': 'x' });
    await GitFsService.removeRepo({ repoPath: 'me/repo' });
    expect(getFsStore().has('file:///doc/GitNotes/me/repo')).toBe(false);
    expect(getFsStore().has('file:///doc/GitNotes/me/repo/notes/x.md')).toBe(false);
    // Second call must not throw.
    await GitFsService.removeRepo({ repoPath: 'me/repo' });
  });

  test('workingTreeUri returns the absolute URI', () => {
    expect(GitFsService.workingTreeUri({ repoPath: 'me/repo' })).toBe(
      'file:///doc/GitNotes/me/repo',
    );
  });
});

describe('GitFsService.pullWithFastForward', () => {
  test('resolves ok and skips the LFS scan when no new objects arrived', async () => {
    const scanSpy = jest.spyOn(LfsService, 'scanRepo');
    const result = await GitFsService.pullWithFastForward({
      repoPath: 'me/repo',
      branch: 'main',
      token: 'tok',
    });
    expect(result.ok).toBe(true);
    expect(scanSpy).not.toHaveBeenCalled();
    scanSpy.mockRestore();
  });

  test('repairs a nested symbolic HEAD before pulling (#1192)', async () => {
    const headUri = 'file:///doc/GitNotes/me/repo/.git/HEAD';
    seedWorktree({});
    getFsStore().set(headUri, { type: 'file', content: 'ref: refs/heads/refs/heads/main\n' });

    const result = await GitFsService.pullWithFastForward({ repoPath: 'me/repo', branch: 'main' });

    expect(result.ok).toBe(true);
    expect(getFsStore().get(headUri)?.content).toBe('ref: refs/heads/main\n');
  });
});
