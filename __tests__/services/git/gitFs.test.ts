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
      if (encoding === 'utf8') {
        const size = new TextEncoder().encode(contents).length;
        store.set(uri, { type: 'file', data: contents, encoding, size, mtime: Date.now() / 1000 });
      } else {
        // expo-file-system's real behavior: `encoding: 'base64'` means the caller
        // passes a base64 string and we store the decoded bytes. Store the raw
        // base64 so readAsStringAsync with base64 returns the same base64 string.
        const size = contents.length;
        store.set(uri, { type: 'file', data: contents, encoding, size, mtime: Date.now() / 1000 });
      }
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

function fnv1a(bytes: Uint8Array): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function captureError(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
    return undefined;
  } catch (e) {
    return e;
  }
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

  test('large binary (>49KB) round-trips without truncation or corruption', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const size = 200000;
    const bytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) bytes[i] = (i * 31 + 7) & 0xff;

    await fs.promises.writeFile('/big.bin', bytes);
    const data = await fs.promises.readFile('/big.bin');

    expect(data).toBeInstanceOf(Uint8Array);
    const decoded = data as Uint8Array;
    expect(decoded.length).toBe(size);
    expect(fnv1a(decoded)).toBe(fnv1a(bytes));
  });

  test('case-collision guard: second casing throws EEXIST instead of clobbering', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/notes/Foo.md', 'first');

    const writeErr = await captureError(
      fs.promises.writeFile('/notes/foo.md', 'second'),
    );
    expect(writeErr).toBeInstanceOf(FsError);
    expect((writeErr as FsError).code).toBe('EEXIST');
    expect((writeErr as FsError).message).toMatch(/case-collision/);

    const readErr = await captureError(
      fs.promises.readFile('/notes/foo.md', { encoding: 'utf8' }),
    );
    expect(readErr).toBeInstanceOf(FsError);
    expect((readErr as FsError).code).toBe('EEXIST');

    expect(await fs.promises.readFile('/notes/Foo.md', { encoding: 'utf8' })).toBe(
      'first',
    );
  });

  test('unencoded read of text extension returns byte-exact Uint8Array (not string) (#1221)', async () => {
    // isomorphic-git's blob-hash / status paths read working-tree files
    // WITHOUT an encoding and require raw bytes. Returning a JS string made
    // GitObject.wrap compute the blob length in UTF-16 units and emit a
    // zero-filled blob for any file with multi-byte characters.
    const fs = makeGitFs('file:///doc/git/');
    const content = '# Hello — World\n\nThis is a test note with an em-dash.';
    await fs.promises.writeFile('/notes/test.md', content);
    const read = await fs.promises.readFile('/notes/test.md');
    expect(read).toBeInstanceOf(Uint8Array);
    const expected = new TextEncoder().encode(content);
    expect(Array.from(read as Uint8Array)).toEqual(Array.from(expected));
  });

  test('explicit utf8 read of text extension still returns a string', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const content = '# Hello World\n\nThis is a test note.';
    await fs.promises.writeFile('/notes/test.md', content);
    const read = await fs.promises.readFile('/notes/test.md', { encoding: 'utf8' });
    expect(read).toBe(content);
    expect(typeof read).toBe('string');
  });

  test('explicit utf8 read round-trips json', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const scene = { version: 1, width: 800, height: 600, elements: [] };
    const content = JSON.stringify(scene);
    await fs.promises.writeFile('/canvases/board.json', content);
    const read = await fs.promises.readFile('/canvases/board.json', { encoding: 'utf8' });
    expect(read).toBe(content);
    expect(typeof read).toBe('string');
    expect(JSON.parse(read as string)).toEqual(scene);
  });

  test('unencoded read of norg/org returns byte-exact Uint8Array', async () => {
    const fs = makeGitFs('file:///doc/git/');
    await fs.promises.writeFile('/notes/test.norg', 'Norg content');
    const norg = await fs.promises.readFile('/notes/test.norg');
    expect(norg).toBeInstanceOf(Uint8Array);
    expect(Array.from(norg as Uint8Array)).toEqual(
      Array.from(new TextEncoder().encode('Norg content')),
    );

    await fs.promises.writeFile('/notes/test.org', '* Org content');
    const org = await fs.promises.readFile('/notes/test.org');
    expect(org).toBeInstanceOf(Uint8Array);
    expect(Array.from(org as Uint8Array)).toEqual(
      Array.from(new TextEncoder().encode('* Org content')),
    );
  });

  test('binary files still use base64 path', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255, 32, 64, 128]);
    await fs.promises.writeFile('/images/photo.png', bytes);
    const read = await fs.promises.readFile('/images/photo.png');
    expect(read).toBeInstanceOf(Uint8Array);
    expect(Array.from(read as Uint8Array)).toEqual(Array.from(bytes));
  });

  test('writeFile Uint8Array to text extension uses text path, round-trips byte-exact', async () => {
    const fs = makeGitFs('file:///doc/git/');
    const content = '# Checkout\n\nemoji 🎉 and 日本語 — byte-exact round-trip';
    const bytes = new TextEncoder().encode(content);
    await fs.promises.writeFile('/notes/checkout.md', bytes);
    const back = await fs.promises.readFile('/notes/checkout.md');
    expect(back).toBeInstanceOf(Uint8Array);
    expect(Array.from(back as Uint8Array)).toEqual(Array.from(bytes));
  });

  test('writeFile non-UTF-8 bytes to text extension falls back to base64 (no corruption)', async () => {
    const fs = makeGitFs('file:///doc/git/');
    // 0xff 0xfe is an invalid UTF-8 sequence — the fatal decoder must reject
    // it and fall back to the byte-exact base64 path instead of writing a
    // silent U+FFFD replacement to disk.
    const bytes = new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x80]);
    await fs.promises.writeFile('/notes/odd.md', bytes);
    const entry = getStore().get('file:///doc/git/notes/odd.md');
    expect(entry?.encoding).toBe('base64');
    // Decode the stored base64 back and confirm the bytes match exactly.
    const bin = globalThis.atob(entry!.data!);
    const stored = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) stored[i] = bin.charCodeAt(i);
    expect(Array.from(stored)).toEqual(Array.from(bytes));
  });
});
