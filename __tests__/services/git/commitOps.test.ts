/**
 * commitOps.test.ts
 *
 * Unit tests for the four commit primitives in commitOps.ts:
 * - commitWrite  — produces a real commit for notes/foo.md
 * - commitDelete — no-ops gracefully on NotFoundError
 * - commitRename — produces ONE commit (single parent) covering both old + new paths
 * - ensureOnBranch — repairs missing refs/heads/<branch> and fetches if local ref missing
 */

jest.mock('isomorphic-git', () => {
  const mocks = {
    add: jest.fn(async (..._a: any[]) => undefined),
    remove: jest.fn(async (..._a: any[]) => undefined),
    commit: jest.fn(async (..._a: any[]) => 'commit-sha-1'),
    currentBranch: jest.fn(async (..._a: any[]) => 'main'),
    checkout: jest.fn(async (..._a: any[]) => undefined),
    fetch: jest.fn(async (..._a: any[]) => undefined),
    status: jest.fn(async (..._a: any[]) => 'modified'),
    resolveRef: jest.fn(async (..._a: any[]) => 'resolved-sha'),
  };
  (globalThis as any).__commitOpsGitMocks = mocks;
  return {
    __esModule: true,
    default: mocks,
  };
});

jest.mock('expo-file-system/legacy', () => {
  const fsStore = new Map<string, { type: 'file' | 'dir' }>();
  const contentStore = new Map<string, string>();
  (globalThis as any).__commitOpsFsStore = fsStore;
  (globalThis as any).__commitOpsFsContent = contentStore;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType: { Base64: 'base64', UTF8: 'utf8' },
    async getInfoAsync(uri: string) {
      const e = fsStore.get(uri);
      if (e) return { exists: true, uri, isDirectory: e.type === 'dir' };
      if (contentStore.has(uri)) return { exists: true, uri, isDirectory: false };
      return { exists: false, uri };
    },
    readAsStringAsync: jest.fn(async (uri: string) => {
      const c = contentStore.get(uri);
      if (c === undefined) throw Object.assign(new Error(`ENOENT: ${uri}`), { code: 'ENOENT' });
      return c;
    }),
    writeAsStringAsync: jest.fn(async (uri: string, data?: string) => {
      fsStore.set(uri, { type: 'file' });
      if (typeof data === 'string') contentStore.set(uri, data);
    }),
    async deleteAsync(uri: string) {
      fsStore.delete(uri);
      contentStore.delete(uri);
    },
    async makeDirectoryAsync(uri: string) {
      fsStore.set(uri, { type: 'dir' });
    },
  };
});

jest.mock('../../../src/services/git/gitFs', () => ({
  makeGitFs: jest.fn(() => ({
    promises: {
      readFile: jest.fn(),
      writeFile: jest.fn(),
      unlink: jest.fn(),
    },
  })),
}));

jest.mock('../../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
}));

jest.mock('../../../src/stores/gitActivityStore', () => ({
  useGitActivityStore: {
    getState: jest.fn(() => ({ incrementRevision: jest.fn() })),
  },
}));

import * as FileSystem from 'expo-file-system/legacy';
import {
  commitWrite,
  commitDelete,
  commitRename,
  ensureOnBranch,
} from '../../../src/services/git/commitOps';

function getGitMocks() {
  return (globalThis as any).__commitOpsGitMocks as {
    add: jest.Mock;
    remove: jest.Mock;
    commit: jest.Mock;
    currentBranch: jest.Mock;
    checkout: jest.Mock;
    fetch: jest.Mock;
    status: jest.Mock;
    resolveRef: jest.Mock;
  };
}

function getFsStore() {
  return (globalThis as any).__commitOpsFsStore as Map<string, { type: 'file' | 'dir' }>;
}

function getFsContent() {
  return (globalThis as any).__commitOpsFsContent as Map<string, string>;
}

const author = { name: 'Test User', email: 'test@example.com' };

beforeEach(() => {
  jest.clearAllMocks();
  getFsStore().clear();
  getFsContent().clear();
  getGitMocks().status.mockResolvedValue('modified');
  getGitMocks().currentBranch.mockResolvedValue('main');
  getGitMocks().commit.mockResolvedValue('commit-sha-1');
});

// ─── commitWrite ─────────────────────────────────────────────────────────────

describe('commitWrite', () => {
  test('writes file, stages, and commits', async () => {
    const result = await commitWrite({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: '# Hello',
      message: 'Add note: foo',
      author,
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBe('commit-sha-1');

    // File was written to disk
    expect(getFsContent().has('notes/foo.md')).toBe(false); // path includes owner/repo
    expect(
      getFsContent().has('me/repo/notes/foo.md') ||
        getFsContent().has('file:///doc/GitNotes/me/repo/notes/foo.md'),
    ).toBe(true);

    // git.add was called with correct params
    expect(getGitMocks().add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/foo.md',
    });

    // git.commit was called
    expect(getGitMocks().commit).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      message: 'Add note: foo',
      author,
    });
  });

  test('strips leading slash from filePath', async () => {
    const result = await commitWrite({
      repo: 'me/repo',
      branch: 'main',
      filePath: '/notes/foo.md',
      content: 'content',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(true);
    expect(getGitMocks().add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/foo.md', // leading slash stripped
    });
  });

  test('returns error for invalid repo path', async () => {
    const result = await commitWrite({
      repo: 'invalid',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'content',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid repo path');
  });

  test('short-circuits when file status is unmodified', async () => {
    getGitMocks().status.mockResolvedValue('unmodified');

    const result = await commitWrite({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'content',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBeUndefined();
    expect(getGitMocks().commit).not.toHaveBeenCalled();
  });

  test('returns error when write throws', async () => {
    (FileSystem.writeAsStringAsync as jest.Mock).mockRejectedValueOnce(new Error('disk full'));

    const result = await commitWrite({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: 'content',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('disk full');
  });
});

// ─── commitDelete ────────────────────────────────────────────────────────────

describe('commitDelete', () => {
  test('deletes file, stages removal, and commits', async () => {
    const result = await commitDelete({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      message: 'Delete note: foo',
      author,
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBe('commit-sha-1');

    expect(getGitMocks().remove).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/foo.md',
    });

    expect(getGitMocks().commit).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      message: 'Delete note: foo',
      author,
    });
  });

  test('no-ops gracefully when file already gone (NotFoundError)', async () => {
    getGitMocks().remove.mockRejectedValueOnce(
      Object.assign(new Error('NotFoundError: file not found'), { code: 'NotFoundError' }),
    );

    const result = await commitDelete({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/nonexistent.md',
      message: 'Delete note: nonexistent',
      author,
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBeUndefined();
    expect(getGitMocks().commit).not.toHaveBeenCalled();
  });

  test('no-ops gracefully when file already gone (ENOENT)', async () => {
    getGitMocks().remove.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT: no such file'), { code: 'ENOENT' }),
    );

    const result = await commitDelete({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/nonexistent.md',
      message: 'Delete note: nonexistent',
      author,
    });

    expect(result.success).toBe(true);
    expect(getGitMocks().commit).not.toHaveBeenCalled();
  });

  test('returns error for invalid repo path', async () => {
    const result = await commitDelete({
      repo: 'invalid',
      branch: 'main',
      filePath: 'notes/foo.md',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid repo path');
  });

  test('re-throws remove error when code is not NotFoundError/ENOENT', async () => {
    getGitMocks().remove.mockRejectedValueOnce(new Error('some other error'));

    const result = await commitDelete({
      repo: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('some other error');
  });
});

// ─── commitRename ─────────────────────────────────────────────────────────────

describe('commitRename', () => {
  test('produces ONE commit covering both old + new paths', async () => {
    const result = await commitRename({
      repo: 'me/repo',
      branch: 'main',
      prevFilePath: 'notes/old.md',
      filePath: 'notes/new.md',
      content: '# New content',
      message: 'Rename note: old → new',
      author,
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBe('commit-sha-1');

    // old file removed from index
    expect(getGitMocks().remove).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/old.md',
    });

    // new file staged
    expect(getGitMocks().add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/new.md',
    });

    // single commit for both changes
    expect(getGitMocks().commit).toHaveBeenCalledTimes(1);
    expect(getGitMocks().commit).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      message: 'Rename note: old → new',
      author,
    });
  });

  test('skips remove when old file already gone (NotFoundError)', async () => {
    getGitMocks().remove.mockRejectedValueOnce(
      Object.assign(new Error('NotFoundError'), { code: 'NotFoundError' }),
    );

    const result = await commitRename({
      repo: 'me/repo',
      branch: 'main',
      prevFilePath: 'notes/nonexistent.md',
      filePath: 'notes/new.md',
      content: '# New',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(true);
    // remove was called but failed gracefully; add and commit still happen
    expect(getGitMocks().add).toHaveBeenCalled();
    expect(getGitMocks().commit).toHaveBeenCalledTimes(1);
  });

  test('skips remove when old file already gone (ENOENT)', async () => {
    getGitMocks().remove.mockRejectedValueOnce(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    const result = await commitRename({
      repo: 'me/repo',
      branch: 'main',
      prevFilePath: 'notes/nonexistent.md',
      filePath: 'notes/new.md',
      content: '# New',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(true);
    expect(getGitMocks().add).toHaveBeenCalled();
    expect(getGitMocks().commit).toHaveBeenCalledTimes(1);
  });

  test('returns error for invalid repo path', async () => {
    const result = await commitRename({
      repo: 'invalid',
      branch: 'main',
      prevFilePath: 'notes/old.md',
      filePath: 'notes/new.md',
      content: 'content',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid repo path');
  });

  test('returns error when add throws', async () => {
    getGitMocks().remove.mockResolvedValue(undefined);
    getGitMocks().add.mockRejectedValueOnce(new Error('add failed'));

    const result = await commitRename({
      repo: 'me/repo',
      branch: 'main',
      prevFilePath: 'notes/old.md',
      filePath: 'notes/new.md',
      content: '# New',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('add failed');
  });

  test('strips leading slashes from both paths', async () => {
    const result = await commitRename({
      repo: 'me/repo',
      branch: 'main',
      prevFilePath: '/notes/old.md',
      filePath: '/notes/new.md',
      content: '# New',
      message: 'msg',
      author,
    });

    expect(result.success).toBe(true);
    expect(getGitMocks().remove).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/old.md', // stripped
    });
    expect(getGitMocks().add).toHaveBeenCalledWith({
      fs: expect.any(Object),
      dir: '/me/repo',
      filepath: 'notes/new.md', // stripped
    });
  });
});

// ─── ensureOnBranch ──────────────────────────────────────────────────────────

describe('ensureOnBranch', () => {
  let fs: ReturnType<typeof makeGitFs>;
  let dir: string;

  beforeEach(() => {
    const { makeGitFs } = require('../../../src/services/git/gitFs');
    fs = makeGitFs('file:///doc/GitNotes/');
    dir = '/me/repo';
  });

  test('no-op when already on the requested branch', async () => {
    getGitMocks().currentBranch.mockResolvedValue('main');

    await ensureOnBranch(fs, dir, 'main');

    expect(getGitMocks().checkout).not.toHaveBeenCalled();
    expect(getGitMocks().fetch).not.toHaveBeenCalled();
  });

  test('repairs HEAD ref then checks out when branch differs', async () => {
    getGitMocks().currentBranch.mockResolvedValue('other');
    getGitMocks().checkout.mockResolvedValue(undefined);

    await ensureOnBranch(fs, dir, 'main');

    // repairHeadRef is called (mocked)
    const { repairHeadRef } = require('../../../src/services/git/GitFsService');
    expect(repairHeadRef).toHaveBeenCalledWith(fs, dir, 'main');

    expect(getGitMocks().checkout).toHaveBeenCalledWith({ fs, dir, ref: 'refs/heads/main' });
  });

  test('fetches then retries checkout when local ref is missing', async () => {
    getGitMocks().currentBranch.mockResolvedValue('other');
    getGitMocks().checkout
      .mockRejectedValueOnce(new Error('ref not found'))
      .mockResolvedValueOnce(undefined);

    await ensureOnBranch(fs, dir, 'main');

    expect(getGitMocks().fetch).toHaveBeenCalledWith({
      fs,
      http: expect.any(Object),
      dir,
      ref: 'main',
      singleBranch: true,
      depth: 1,
      tags: false,
      onAuth: expect.any(Function),
    });
    expect(getGitMocks().checkout).toHaveBeenCalledTimes(2);
    expect(getGitMocks().checkout).toHaveBeenLastCalledWith({ fs, dir, ref: 'refs/heads/main' });
  });

  test('propagates error when checkout fails after fetch', async () => {
    getGitMocks().currentBranch.mockResolvedValue('other');
    getGitMocks().checkout.mockRejectedValue(new Error('checkout failed'));

    // ensureOnBranch doesn't return error, it throws
    await expect(ensureOnBranch(fs, dir, 'main')).rejects.toThrow('checkout failed');
  });
});

// ─── integration-style: real-looking write → commit cycle ───────────────────

describe('commitWrite — full cycle', () => {
  test('produces a real commit for notes/foo.md', async () => {
    getGitMocks().status.mockResolvedValue('modified');
    getGitMocks().commit.mockResolvedValue('real-commit-sha');

    const result = await commitWrite({
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: '# Test Note\n\nHello world',
      message: 'Add note: foo',
      author: { name: 'Alice', email: 'alice@example.com' },
    });

    expect(result.success).toBe(true);
    expect(result.oid).toBe('real-commit-sha');

    // Verify the write landed at the correct virtual path
    const gitAddCall = getGitMocks().add.mock.calls[0][0];
    expect(gitAddCall.filepath).toBe('notes/foo.md');
    expect(gitAddCall.dir).toBe('/owner/repo');

    // Verify the commit message and author
    const gitCommitCall = getGitMocks().commit.mock.calls[0][0];
    expect(gitCommitCall.message).toBe('Add note: foo');
    expect(gitCommitCall.author).toEqual({ name: 'Alice', email: 'alice@example.com' });
  });
});

function makeGitFs(root: string) {
  const { makeGitFs: _makeGitFs } = require('../../../src/services/git/gitFs');
  return _makeGitFs(root);
}
