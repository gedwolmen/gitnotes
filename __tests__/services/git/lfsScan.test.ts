/**
 * Tests for the working-tree LFS pointer walk (`LfsService.scanRepo`).
 * The walk (issue #980) resolves directory entries and reads candidate
 * files with bounded concurrency; these tests lock the observable behavior:
 * pointer files are found, `.git` is skipped, oversize files are skipped,
 * and non-pointer files are ignored.
 */

interface Entry {
  type: 'file' | 'dir';
  content?: string;
  size?: number;
}

jest.mock('expo-file-system/legacy', () => {
  const EncodingType = { Base64: 'base64' as const, UTF8: 'utf8' as const };
  const store = new Map<string, Entry>();
  (globalThis as { __lfsScanStore?: Map<string, Entry> }).__lfsScanStore = store;
  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType,
    async getInfoAsync(uri: string) {
      const e = store.get(uri.replace(/\/$/, ''));
      if (!e) return { exists: false, uri };
      return { exists: true, uri, isDirectory: e.type === 'dir', size: e.size ?? 0 };
    },
    async readDirectoryAsync(uri: string) {
      const prefix = uri.replace(/\/$/, '') + '/';
      const out: string[] = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
          const head = k.slice(prefix.length).split('/')[0];
          if (head && !out.includes(head)) out.push(head);
        }
      }
      return out;
    },
    async readAsStringAsync(uri: string) {
      const e = store.get(uri.replace(/\/$/, ''));
      if (!e || e.type !== 'file') throw new Error(`not found: ${uri}`);
      return e.content ?? '';
    },
    async writeAsStringAsync() { /* noop — scan never writes */ },
    async makeDirectoryAsync() { /* noop */ },
    async deleteAsync() { /* noop */ },
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async () => null),
    setItem: jest.fn(async () => undefined),
    removeItem: jest.fn(async () => undefined),
  },
}));

import { describe, expect, jest, test } from '@jest/globals';
import { LfsService } from '../../../src/services/git/lfs';

function getStore(): Map<string, Entry> {
  return (globalThis as { __lfsScanStore: Map<string, Entry> }).__lfsScanStore;
}

const POINTER_A = `version https://git-lfs.github.com/spec/v1
oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
size 12345
`;
const POINTER_B = `version https://git-lfs.github.com/spec/v1
oid sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
size 42
`;

function setFile(path: string, content: string, size?: number): void {
  getStore().set(path, { type: 'file', content, size: size ?? content.length });
}

function setDir(path: string): void {
  getStore().set(path.replace(/\/$/, ''), { type: 'dir' });
}

beforeEach(() => {
  getStore().clear();
  setDir('file:///doc/worktree');
});

describe('LfsService.scanRepo walk', () => {
  test('finds pointer files across nested directories', async () => {
    setDir('file:///doc/worktree/notes');
    setFile('file:///doc/worktree/notes/a.md', '# normal note');
    setFile('file:///doc/worktree/notes/photo.png', POINTER_A);
    setFile('file:///doc/worktree/board.json', POINTER_B);

    const found = await LfsService.scanRepo('owner/repo', 'file:///doc/worktree');

    expect(Array.from(found.keys()).sort()).toEqual(['board.json', 'notes/photo.png']);
    expect(found.get('notes/photo.png')?.oid).toBe(
      '4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393',
    );
    expect(found.get('board.json')?.size).toBe(42);
  });

  test('skips .git directory entirely', async () => {
    setDir('file:///doc/worktree/.git');
    setFile('file:///doc/worktree/.git/config', '[core]\n');
    setFile('file:///doc/worktree/.git/objects/ab/abcdef', 'binary-garbage');
    setFile('file:///doc/worktree/note.md', POINTER_A);

    const found = await LfsService.scanRepo('owner/repo', 'file:///doc/worktree');

    expect(Array.from(found.keys())).toEqual(['note.md']);
  });

  test('skips files larger than the pointer cap', async () => {
    setFile('file:///doc/worktree/huge.png', POINTER_A, 4096);
    setFile('file:///doc/worktree/small.png', POINTER_B, 100);

    const found = await LfsService.scanRepo('owner/repo', 'file:///doc/worktree');

    expect(Array.from(found.keys())).toEqual(['small.png']);
  });

  test('returns empty map for repos with no pointers', async () => {
    setFile('file:///doc/worktree/readme.md', '# Hello');
    setFile('file:///doc/worktree/data.bin', '\u0000\u0001\u0002');

    const found = await LfsService.scanRepo('owner/repo', 'file:///doc/worktree');

    expect(found.size).toBe(0);
  });

  test('handles a missing working tree gracefully', async () => {
    const found = await LfsService.scanRepo('owner/repo', 'file:///doc/missing');

    expect(found.size).toBe(0);
  });
});
