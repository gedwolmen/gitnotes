// In-memory stub for expo-file-system/legacy. The store hangs off `globalThis`
// so the jest.mock factory (which can't close over locals) reads the same Map
// the test setup mutates.

interface Entry {
  type: 'file' | 'dir';
  data?: string;
  encoding?: 'utf8' | 'base64';
  size?: number;
  mtime?: number;
}

jest.mock('expo-file-system/legacy', () => {
  const EncodingType = { Base64: 'base64' as const, UTF8: 'utf8' as const };
  // The store lives inside the factory closure (jest.mock factories can't
  // reference outer locals). We pin a reference on globalThis so the test body
  // can read/clear it via a lazy getter.
  const store = new Map<string, Entry>();
  (globalThis as any).__gitFsTestStore = store;

  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType,
    async getInfoAsync(uri: string) {
      // Real expo-file-system resolves paths regardless of trailing slash —
      // 'file:///x/y' and 'file:///x/y/' both hit the same inode. Mirror that.
      const trimmed = uri.replace(/\/$/, '');
      const e = store.get(trimmed) ?? store.get(uri);
      if (!e) return { exists: false, uri };
      return {
        exists: true,
        uri,
        isDirectory: e.type === 'dir',
        size: e.size ?? 0,
        modificationTime: e.mtime ?? 0,
      };
    },
    async readAsStringAsync(uri: string, opts?: { encoding?: string }) {
      const e = store.get(uri);
      if (!e || e.type !== 'file') throw new Error(`not found: ${uri}`);
      const wantBase64 = opts?.encoding === EncodingType.Base64;
      if (wantBase64 && e.encoding === 'base64') return e.data;
      if (!wantBase64 && e.encoding === 'utf8') return e.data;
      if (wantBase64 && e.encoding === 'utf8') {
        const bytes = new TextEncoder().encode(e.data!);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return globalThis.btoa(bin);
      }
      const bin = globalThis.atob(e.data!);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return new TextDecoder('utf-8').decode(bytes);
    },
    async writeAsStringAsync(uri: string, contents: string, opts?: { encoding?: string }) {
      // Match expo-file-system's real behaviour: writing a file fails when
      // the immediate parent directory does not exist. The screenshot bug
      // (#514) showed this surfacing on real devices when isomorphic-git
      // wrote `.git/config` before its ancestors were created.
      const idx = uri.lastIndexOf('/');
      if (idx > -1) {
        const parent = uri.slice(0, idx);
        const parentEntry = store.get(parent) ?? store.get(parent + '/');
        if (!parentEntry || parentEntry.type !== 'dir') {
          throw new Error(`writeAsStringAsync: parent directory missing for ${uri}`);
        }
      }
      const encoding = opts?.encoding === EncodingType.Base64 ? 'base64' : 'utf8';
      const size =
        encoding === 'utf8'
          ? new TextEncoder().encode(contents).length
          : globalThis.atob(contents).length;
      store.set(uri, { type: 'file', data: contents, encoding, size, mtime: Date.now() / 1000 });
    },
    async deleteAsync(uri: string, opts?: { idempotent?: boolean }) {
      if (!store.has(uri) && !opts?.idempotent) throw new Error(`delete: not found ${uri}`);
      const e = store.get(uri);
      if (e?.type === 'dir') {
        const prefix = uri.endsWith('/') ? uri : uri + '/';
        for (const k of [...store.keys()]) {
          if (k.startsWith(prefix)) store.delete(k);
        }
      }
      store.delete(uri);
    },
    async readDirectoryAsync(uri: string) {
      const prefix = uri.endsWith('/') ? uri : uri + '/';
      const out: string[] = [];
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const head = rest.split('/')[0];
          if (head && !out.includes(head)) out.push(head);
        }
      }
      return out;
    },
    async makeDirectoryAsync(uri: string, opts?: { intermediates?: boolean }) {
      const trimmed = uri.replace(/\/$/, '');
      if (opts?.intermediates) {
        // Walk segments and stamp each ancestor as a dir, mirroring `mkdir -p`.
        const protoIdx = trimmed.indexOf('://');
        const headEnd = protoIdx >= 0 ? trimmed.indexOf('/', protoIdx + 3) : 0;
        if (headEnd <= 0) {
          store.set(trimmed, { type: 'dir' });
        } else {
          const head = trimmed.slice(0, headEnd);
          const rest = trimmed.slice(headEnd + 1);
          let acc = head;
          for (const part of rest.split('/').filter(Boolean)) {
            acc = acc + '/' + part;
            if (!store.has(acc)) store.set(acc, { type: 'dir' });
          }
        }
      } else {
        store.set(trimmed, { type: 'dir' });
      }
    },
  };
});

import { makeGitFs, FsError } from '../../../src/services/git/gitFs';

function getStore(): Map<string, Entry> {
  return (globalThis as any).__gitFsTestStore;
}

beforeEach(() => {
  const s = getStore();
  s.clear();
  s.set('file:///doc/git/', { type: 'dir' });
});

describe('gitFs adapter', () => {
  test('writeFile + readFile (utf8) round-trips strings', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/hello.txt', 'world');
    const data = await fs.promises.readFile('/hello.txt', { encoding: 'utf8' });
    expect(data).toBe('world');
  });

  test('writeFile + readFile (binary) round-trips Uint8Array', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
    await fs.promises.writeFile('/bin', bytes);
    const data = await fs.promises.readFile('/bin');
    expect(data).toBeInstanceOf(Uint8Array);
    expect(Array.from(data as Uint8Array)).toEqual([0, 1, 2, 3, 254, 255]);
  });

  test('readFile throws ENOENT for missing path', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const err = await fs.promises.readFile('/missing').catch((e: any) => e);
    expect(err).toBeInstanceOf(FsError);
    expect(err.code).toBe('ENOENT');
  });

  test('mkdir then readdir lists children', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.mkdir('/sub');
    await fs.promises.writeFile('/sub/a.txt', 'a');
    await fs.promises.writeFile('/sub/b.txt', 'b');
    const entries = await fs.promises.readdir('/sub');
    expect(entries.sort()).toEqual(['a.txt', 'b.txt']);
  });

  test('mkdir on existing path throws EEXIST', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.mkdir('/x');
    const err = await fs.promises.mkdir('/x').catch((e: any) => e);
    expect(err.code).toBe('EEXIST');
  });

  test('readdir throws ENOTDIR on a file', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/f.txt', 'x');
    const err = await fs.promises.readdir('/f.txt').catch((e: any) => e);
    expect(err.code).toBe('ENOTDIR');
  });

  test('unlink removes the file', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/g.txt', 'x');
    await fs.promises.unlink('/g.txt');
    const err = await fs.promises.readFile('/g.txt').catch((e: any) => e);
    expect(err.code).toBe('ENOENT');
  });

  test('stat returns file shape with isomorphic-git Stat fields', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/note.txt', 'hello');
    const s = await fs.promises.stat('/note.txt');
    expect(s.type).toBe('file');
    expect(s.size).toBe(5);
    expect(typeof s.mtimeSeconds).toBe('number');
    expect(s.mode).toBe(0o100644);
  });

  test('stat on dir returns dir mode', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.mkdir('/d');
    const s = await fs.promises.stat('/d');
    expect(s.type).toBe('dir');
    expect(s.mode).toBe(0o40755);
  });

  test('stat exposes Node-style isFile/isDirectory/isSymbolicLink methods', async () => {
    // isomorphic-git's CloneMigration path crashed on a real device with
    // "r.isDirectory is not a function" — the adapter only returned the
    // `type` field. Methods need to coexist with it.
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/note.txt', 'hi');
    await fs.promises.mkdir('/d');

    const f: any = await fs.promises.stat('/note.txt');
    expect(typeof f.isFile).toBe('function');
    expect(f.isFile()).toBe(true);
    expect(f.isDirectory()).toBe(false);
    expect(f.isSymbolicLink()).toBe(false);

    const d: any = await fs.promises.stat('/d');
    expect(d.isFile()).toBe(false);
    expect(d.isDirectory()).toBe(true);
    expect(d.isSymbolicLink()).toBe(false);
  });

  test('readlink/symlink throw — not supported on the sandbox', async () => {
    const fs = makeGitFs('file:///doc/git/');
    expect(typeof fs.promises.readlink).toBe('function');
    expect(typeof fs.promises.symlink).toBe('function');
    await expect(fs.promises.readlink!('/x')).rejects.toBeInstanceOf(FsError);
    await expect(fs.promises.symlink!('/a', '/b')).rejects.toBeInstanceOf(FsError);
  });

  test('constructor rejects roots without trailing slash', () => {
    expect(() => makeGitFs('file:///doc/git')).toThrow(/end with/);
  });

  test('writeFile auto-creates missing parent directories (#514 clone bug)', async () => {
    // Reproduces the on-device crash: isomorphic-git asks the adapter to
    // write `.git/config` before any explicit mkdir of `.git`. Real
    // expo-file-system surfaces this as "the folder doesn't exist" and
    // aborts the clone.
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/.git/config', '[core]\n');
    const back = await fs.promises.readFile('/.git/config', { encoding: 'utf8' });
    expect(back).toBe('[core]\n');
    const parent = await fs.promises.stat('/.git');
    expect(parent.type).toBe('dir');
  });

  test('writeFile auto-creates deep parent chains', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/.git/objects/pack/pack-abc.idx', 'idx');
    const back = await fs.promises.readFile('/.git/objects/pack/pack-abc.idx', {
      encoding: 'utf8',
    });
    expect(back).toBe('idx');
  });
});
