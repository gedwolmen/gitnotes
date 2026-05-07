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

function base64ToBytes(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return globalThis.btoa(bin);
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
    const info = await fs.getInfoAsync(acc);
    if (!info.exists) {
      await fs.makeDirectoryAsync(acc, { intermediates: true });
    }
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

  const promises = {
    async readFile(filepath: string, opts?: ReadOpts | string): Promise<string | Uint8Array> {
      const uri = joinUri(root, filepath);
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such file '${filepath}'`);
      }
      if (info.isDirectory) {
        throw new FsError('EISDIR', `EISDIR: illegal operation on directory '${filepath}'`);
      }
      const encoding = typeof opts === 'string' ? opts : opts?.encoding;
      if (encoding === 'utf8') {
        return await FileSystem.readAsStringAsync(uri);
      }
      const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return base64ToBytes(b64);
    },

    async writeFile(
      filepath: string,
      data: string | Uint8Array,
      opts?: ReadOpts | string,
    ): Promise<void> {
      const uri = joinUri(root, filepath);
      await ensureParentDirs(uri, root, FileSystem);
      if (typeof data === 'string') {
        const encoding = typeof opts === 'string' ? opts : opts?.encoding;
        if (encoding && encoding !== 'utf8') {
          // Caller passed a non-utf8 encoding for a string body — treat it as
          // an explicit binary signal and fall through to base64 path.
        }
        await FileSystem.writeAsStringAsync(uri, data);
      } else {
        const b64 = bytesToBase64(data);
        await FileSystem.writeAsStringAsync(uri, b64, {
          encoding: FileSystem.EncodingType.Base64,
        });
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
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        throw new FsError('ENOENT', `ENOENT: no such directory '${filepath}'`);
      }
      if (!info.isDirectory) {
        throw new FsError('ENOTDIR', `ENOTDIR: not a directory '${filepath}'`);
      }
      return await FileSystem.readDirectoryAsync(uri);
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
