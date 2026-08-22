import * as FileSystem from 'expo-file-system/legacy';
import type { PromiseFsClient } from 'isomorphic-git';

// Node-style FS errors. isomorphic-git inspects `err.code` to decide whether a
// missing path is a legitimate "not yet created" condition or a real failure.
class FsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'FsError';
  }
}

async function base64ToBytesAsync(b64: string): Promise<Uint8Array> {
  // Decode base64 in 4-char aligned chunks without calling atob on the full string.
  // atob materializes the entire decoded string synchronously, blocking the JS thread.
  const CHUNK_CHARS = 65532; // Multiple of 4 so every chunk boundary is 4-char aligned
  const cleaned = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  const totalChars = cleaned.length;

  if (totalChars === 0) return new Uint8Array(0);

  // Quick path for small inputs (no yielding needed)
  if (totalChars <= CHUNK_CHARS) {
    return _decodeBase64Chunk(cleaned);
  }

  // Chunked decoding with yields
  const resultParts: Uint8Array[] = [];

  for (let i = 0; i < totalChars; i += CHUNK_CHARS) {
    const end = Math.min(i + CHUNK_CHARS, totalChars);
    // Align to 4-char boundary
    let alignedEnd = end;
    while (alignedEnd > i && (alignedEnd - i) % 4 !== 0) alignedEnd--;
    if (alignedEnd <= i) alignedEnd = Math.min(i + 4, totalChars); // fallback

    const chunkStr = cleaned.slice(i, alignedEnd);
    const decoded = _decodeBase64Chunk(chunkStr);
    resultParts.push(decoded);

    if (alignedEnd < totalChars) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Concatenate all parts
  const totalLen = resultParts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of resultParts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

function _decodeBase64Chunk(b64: string): Uint8Array {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const cleaned = b64.replace(/[^A-Za-z0-9+/=]/g, '');
  let outLen = Math.floor((cleaned.length / 4) * 3);
  if (cleaned.endsWith('==')) outLen -= 2;
  else if (cleaned.endsWith('=')) outLen -= 1;
  const bytes = new Uint8Array(Math.max(0, outLen));
  let bi = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c1 = chars.indexOf(cleaned[i]);
    const c2 = chars.indexOf(cleaned[i + 1]);
    const c3 = cleaned[i + 2] === '=' ? 64 : chars.indexOf(cleaned[i + 2]);
    const c4 = cleaned[i + 3] === '=' ? 64 : chars.indexOf(cleaned[i + 3]);
    if (c1 < 0 || c2 < 0) break;
    bytes[bi++] = (c1 << 2) | (c2 >> 4);
    if (c3 !== 64 && c3 >= 0) bytes[bi++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (c4 !== 64 && c4 >= 0) bytes[bi++] = ((c3 & 3) << 6) | c4;
  }
  return bytes.subarray(0, bi);
}

async function bytesToBase64Async(bytes: Uint8Array): Promise<string> {
  const CHUNK = 65535;
  if (bytes.length <= CHUNK) {
    return Buffer.from(bytes).toString('base64');
  }
  let result = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.slice(i, Math.min(i + CHUNK, bytes.length));
    result += Buffer.from(chunk).toString('base64');
    if (i + CHUNK < bytes.length) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }
  return result;
}

// Text extensions used by gitnotes scopes (notes, todos, canvases, templates).
// These files are UTF-8 plain text and do not need the base64 round-trip.
const TEXT_EXTS = new Set(['md', 'markdown', 'norg', 'org', 'txt', 'json']);

function isTextExtension(filepath: string): boolean {
  const ext = filepath.split('.').pop()?.toLowerCase();
  return ext !== undefined && TEXT_EXTS.has(ext);
}

function joinUri(root: string, virtualPath: string): string {
  // virtualPath is git's view: "/foo/bar" or "foo/bar". Map onto the on-disk
  // root which already ends in "file:///.../<base>/".
  const trimmed = virtualPath.replace(/^\/+/, '');
  return root + trimmed;
}

async function ensureParentDirs(
  fileUri: string,
  rootUri: string,
  fs: typeof FileSystem,
  existingDirs: Set<string>,
): Promise<void> {
  // expo-file-system's writeAsStringAsync errors with "folder doesn't exist"
  // when any ancestor of the target path is missing. isomorphic-git issues
  // writes against deep paths like `.git/objects/pack/<sha>` without always
  // mkdir'ing every ancestor first, so the adapter has to bridge that gap.
  if (!fileUri.startsWith(rootUri)) return;
  const rel = fileUri.slice(rootUri.length);
  const parts = rel.split('/').filter(Boolean);
  parts.pop();
  let acc = rootUri;
  for (const part of parts) {
    acc = acc + part + '/';
    if (existingDirs.has(acc)) continue;
    const info = await fs.getInfoAsync(acc);
    if (!info.exists) {
      await fs.makeDirectoryAsync(acc, { intermediates: true });
    }
    existingDirs.add(acc);
  }
}

interface ReadOpts {
  encoding?: 'utf8' | string;
}

/**
 * Build a PromiseFsClient that isomorphic-git can drive against
 * `expo-file-system/legacy`. The `root` argument is the absolute on-disk URI
 * (e.g. `file:///.../GitNotes/`) to which all virtual git paths get
 * appended. Keeping the root out of the virtual path avoids the `file://` →
 * `file:/` collapsing that path-normalisers do on protocol-prefixed strings.
 */
export function makeGitFs(root: string): PromiseFsClient {
  if (!root.endsWith('/')) {
    throw new Error(`gitFs root must end with '/': ${root}`);
  }

  // Cache of directory URIs known to exist under `root`. Cloning produces
  // thousands of writes into the same handful of ancestors (.git/objects/xx,
  // .git/objects/pack, the working tree) — a getInfoAsync per ancestor per
  // write saturated the JS thread with native bridge roundtrips. The cache
  // collapses all ancestor lookups for an already-created directory to a
  // single Set.has() check.
  const existingDirs = new Set<string>([root]);

  // Case-insensitive filesystems (APFS/NTFS) collapse case-variant paths onto
  // one file, so a second write would silently clobber the first. Remember the
  // first-seen spelling per lowercased URI and throw EEXIST on any variant.
  const caseMap = new Map<string, string>(); // lowercased URI -> canonical URI
  function guardCase(filepath: string, uri: string): void {
    if (uri === root) return; // the adapter root itself is case-exempt
    const key = uri.toLowerCase();
    const canonical = caseMap.get(key);
    if (canonical === undefined) {
      caseMap.set(key, uri);
      return;
    }
    if (canonical !== uri) {
      const incoming = filepath.replace(/^\/+/, '');
      const existing = canonical.slice(root.length);
      throw new FsError(
        'EEXIST',
        `case-collision: "${incoming}" collides with "${existing}" on this filesystem`,
      );
    }
  }

  // Yield to the event loop every N writes. Cloning 10k+ objects still
  // accumulates JS-thread work even after the ancestor + base64 fixes;
  // without periodic yields, taps queued in the bridge would still see
  // multi-second latency on the largest repos. Bounded counter so the
  // yield cost itself stays a tiny fraction of total clone time.
  const YIELD_EVERY_N_WRITES = 50;
  let writesSinceYield = 0;
  const maybeYield = () => {
    writesSinceYield += 1;
    if (writesSinceYield < YIELD_EVERY_N_WRITES) return Promise.resolve();
    writesSinceYield = 0;
    return new Promise<void>((resolve) => {
      if (typeof setImmediate === 'function') {
        setImmediate(resolve);
      } else {
        setTimeout(resolve, 0);
      }
    });
  };

  const promises = {
    async readFile(filepath: string, opts?: ReadOpts | string): Promise<string | Uint8Array> {
      const uri = joinUri(root, filepath);
      guardCase(filepath, uri);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such file '${filepath}'`);
      }
      if (info.isDirectory) {
        throw new FsError('EISDIR', `EISDIR: illegal operation on directory '${filepath}'`);
      }
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      if (encoding === 'utf8' || (!encoding && isTextExtension(filepath))) {
        const text = await FileSystem.readAsStringAsync(uri);
        await maybeYield();
        return text;
      }
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const bytes = await base64ToBytesAsync(b64);
      await maybeYield();
      return bytes;
    },

    async writeFile(
      filepath: string,
      data: string | Uint8Array,
      opts?: ReadOpts | string,
    ): Promise<void> {
      const uri = joinUri(root, filepath);
      guardCase(filepath, uri);
      await ensureParentDirs(uri, root, FileSystem, existingDirs);
      if (typeof data === 'string') {
        const encoding = typeof opts === 'string' ? opts : opts?.encoding;
        if (encoding && encoding !== 'utf8') {
          // Caller declared a non-utf8 encoding (e.g. 'base64') for a string
          // body — write through expo-file-system's matching encoding rather
          // than the default utf8 path so binary survives the round-trip.
          if (encoding === 'base64') {
            await FileSystem.writeAsStringAsync(uri, data, {
              encoding: FileSystem.EncodingType.Base64,
            });
            await maybeYield();
            return;
          }
          throw new FsError(
            'EINVAL',
            `writeFile encoding '${encoding}' not supported for '${filepath}'`,
          );
        }
        await FileSystem.writeAsStringAsync(uri, data);
        await maybeYield();
      } else if (isTextExtension(filepath)) {
        // Text-extension files (notes, canvases, todos) are UTF-8 plain text
        // even when isomorphic-git hands us raw bytes (checkout writes blobs
        // as Uint8Array). Decode once and write via the text path instead of
        // the base64 round-trip. Fatal decoding guarantees the round-trip is
        // byte-exact: any non-UTF-8 payload falls back to the base64 path so
        // no data is silently rewritten (#986).
        let text: string | null = null;
        const TD: typeof TextDecoder | undefined = (
          globalThis as unknown as { TextDecoder?: typeof TextDecoder }
        ).TextDecoder;
        if (TD) {
          try {
            text = new TD('utf-8', { fatal: true }).decode(data);
          } catch {
            text = null;
          }
        }
        if (text !== null) {
          await FileSystem.writeAsStringAsync(uri, text);
          await maybeYield();
          return;
        }
        const b64 = await bytesToBase64Async(data);
        await FileSystem.writeAsStringAsync(uri, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await maybeYield();
      } else {
        const b64 = await bytesToBase64Async(data);
        await FileSystem.writeAsStringAsync(uri, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        await maybeYield();
      }
    },

    async unlink(filepath: string): Promise<void> {
      const uri = joinUri(root, filepath);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such file '${filepath}'`);
      }
      await FileSystem.deleteAsync(uri, { idempotent: true });
    },

    async readdir(filepath: string): Promise<string[]> {
      const uri = joinUri(root, filepath);
      guardCase(filepath, uri);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such directory '${filepath}'`);
      }
      if (!info.isDirectory) {
        throw new FsError('ENOTDIR', `ENOTDIR: not a directory '${filepath}'`);
      }
      const entries = await FileSystem.readDirectoryAsync(uri);
      await maybeYield();
      return entries;
    },

    async mkdir(filepath: string): Promise<void> {
      const uri = joinUri(root, filepath);
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) {
        throw new FsError('EEXIST', `EEXIST: file already exists '${filepath}'`);
      }
      // intermediates:true so a single mkdir of a deep path (e.g. the repo
      // working dir on first clone) creates all missing ancestors. The Node
      // POSIX contract is `mkdir -p` semantics for isomorphic-git — it relies
      // on EEXIST as the only error for "already there", which we still emit
      // via the explicit existence check above.
      await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
      existingDirs.add(uri.endsWith('/') ? uri : uri + '/');
    },

    async rmdir(filepath: string): Promise<void> {
      const uri = joinUri(root, filepath);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such directory '${filepath}'`);
      }
      if (!info.isDirectory) {
        throw new FsError('ENOTDIR', `ENOTDIR: not a directory '${filepath}'`);
      }
      await FileSystem.deleteAsync(uri, { idempotent: false });
    },

    async stat(filepath: string): Promise<{
      type: 'file' | 'dir';
      mode: number;
      size: number;
      ino: number;
      mtimeSeconds: number;
      mtimeNanoseconds: number;
      ctimeSeconds: number;
      ctimeNanoseconds: number;
      uid: number;
      gid: number;
      dev: number;
      isFile: () => boolean;
      isDirectory: () => boolean;
      isSymbolicLink: () => boolean;
    }> {
      const uri = joinUri(root, filepath);
      guardCase(filepath, uri);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such path '${filepath}'`);
      }
      const isDir = !!info.isDirectory;
      // expo-file-system returns modificationTime in seconds. ctime isn't
      // exposed; reuse mtime — git only cares about ordering, not which
      // clock recorded it.
      const mtimeSeconds = Math.floor(info.modificationTime ?? 0);
      // Some isomorphic-git code paths reach for Node-style `Stats` predicate
      // methods (`.isDirectory()` etc.) instead of the `type` field. Provide
      // both — the field for fast-path callers, the methods for the rest.
      return {
        type: isDir ? 'dir' : 'file',
        mode: isDir ? 0o40755 : 0o100644,
        size: isDir ? 0 : info.size ?? 0,
        ino: 0,
        mtimeSeconds,
        mtimeNanoseconds: 0,
        ctimeSeconds: mtimeSeconds,
        ctimeNanoseconds: 0,
        uid: 0,
        gid: 0,
        dev: 0,
        isFile: () => !isDir,
        isDirectory: () => isDir,
        isSymbolicLink: () => false,
      };
    },

    async lstat(filepath: string) {
      // No symlinks on iOS sandboxes anyway — lstat == stat.
      return promises.stat(filepath);
    },

    async readlink(filepath: string): Promise<string> {
      throw new FsError('EINVAL', `readlink not supported '${filepath}'`);
    },

    async symlink(_target: string, filepath: string): Promise<void> {
      throw new FsError('EPERM', `symlink not supported '${filepath}'`);
    },
  };

  return { promises };
}

export { FsError };
