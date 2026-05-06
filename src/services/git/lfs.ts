import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { parseRepoPath } from '../../utils/gitPathParser';

/**
 * Git LFS pointer parser + on-demand object download.
 *
 * Pointer file spec (https://github.com/git-lfs/git-lfs/blob/main/docs/spec.md):
 *
 *   version https://git-lfs.github.com/spec/v1
 *   oid sha256:<64 hex chars>
 *   size <integer bytes>
 *
 * Lines are LF-terminated, the file ends with LF, and ASCII only. Real
 * pointers are tiny (~130 bytes); a >2 KiB file masquerading as one is
 * almost certainly a regular text file and we skip it cheaply.
 */
const POINTER_MAX_BYTES = 2048;
const POINTER_VERSION = 'https://git-lfs.github.com/spec/v1';
const OID_REGEX = /^oid sha256:([0-9a-f]{64})$/;
const SIZE_REGEX = /^size (\d+)$/;

export interface LfsPointer {
  oid: string;
  size: number;
}

const STORAGE_KEY_PREFIX = '@gitnotes:lfs_pending:';
const storageKey = (repoKey: string) => `${STORAGE_KEY_PREFIX}${repoKey}`;

/**
 * Parse a buffer (string or Uint8Array) as an LFS pointer file.
 * Returns `{ oid, size }` on success, `null` otherwise — non-pointer files
 * (binaries, regular text, anything missing the spec lines) are silently
 * rejected so callers can use this as a cheap classifier.
 */
export function parseLfsPointer(buffer: string | Uint8Array): LfsPointer | null {
  let text: string;
  if (typeof buffer === 'string') {
    if (buffer.length > POINTER_MAX_BYTES) return null;
    text = buffer;
  } else {
    if (buffer.byteLength > POINTER_MAX_BYTES) return null;
    // Pointers are pure ASCII; charCode-per-byte avoids depending on a
    // TextDecoder polyfill in the RN runtime.
    let acc = '';
    for (let i = 0; i < buffer.length; i++) {
      const b = buffer[i];
      if (b > 0x7f) return null;
      acc += String.fromCharCode(b);
    }
    text = acc;
  }
  if (!text.startsWith('version ')) return null;
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines.length < 3) return null;
  if (lines[0] !== `version ${POINTER_VERSION}`) return null;

  let oid: string | null = null;
  let size: number | null = null;
  for (let i = 1; i < lines.length; i++) {
    const oidMatch = lines[i].match(OID_REGEX);
    if (oidMatch) {
      oid = oidMatch[1];
      continue;
    }
    const sizeMatch = lines[i].match(SIZE_REGEX);
    if (sizeMatch) {
      size = Number(sizeMatch[1]);
      continue;
    }
  }
  if (!oid || size === null || !Number.isFinite(size) || size < 0) return null;
  return { oid, size };
}

interface ScanOpts {
  /** Working-tree URI from `GitFsService.workingTreeUri` (no trailing slash). */
  workingTreeUri: string;
  /** Maximum bytes to read while sniffing a candidate file. Defaults to 2 KiB. */
  maxFileBytes?: number;
}

/**
 * Walk the working tree and collect every file that parses as an LFS
 * pointer. Skips `.git`. Sized cap on what we read keeps the scan cheap on
 * repos with large working trees.
 */
async function scanForPointers(opts: ScanOpts): Promise<Map<string, LfsPointer>> {
  const root = opts.workingTreeUri.endsWith('/')
    ? opts.workingTreeUri
    : `${opts.workingTreeUri}/`;
  const max = opts.maxFileBytes ?? POINTER_MAX_BYTES;
  const out = new Map<string, LfsPointer>();

  async function walk(dirUri: string, relPath: string): Promise<void> {
    let entries: string[];
    try {
      entries = await FileSystem.readDirectoryAsync(dirUri);
    } catch {
      return;
    }
    for (const name of entries) {
      if (name === '.git') continue;
      const childUri = `${dirUri}${name}`;
      const childRel = relPath ? `${relPath}/${name}` : name;
      let info;
      try {
        info = await FileSystem.getInfoAsync(childUri);
      } catch {
        continue;
      }
      if (!info.exists) continue;
      if (info.isDirectory) {
        await walk(`${childUri}/`, childRel);
        continue;
      }
      if ((info.size ?? 0) > max) continue;
      let text: string;
      try {
        text = await FileSystem.readAsStringAsync(childUri);
      } catch {
        continue;
      }
      const pointer = parseLfsPointer(text);
      if (pointer) out.set(childRel, pointer);
    }
  }

  await walk(root, '');
  return out;
}

interface DownloadOpts {
  owner: string;
  repo: string;
  oid: string;
  size: number;
  accessToken: string;
}

interface BatchObject {
  oid: string;
  size: number;
  actions?: {
    download?: {
      href: string;
      header?: Record<string, string>;
    };
  };
  error?: { code: number; message: string };
}

interface BatchResponse {
  objects: BatchObject[];
}

/**
 * GitHub LFS batch endpoint — request a signed download URL for a single
 * object. The endpoint requires the application/vnd.git-lfs+json content
 * type and accepts PAT auth via Authorization: token <pat>.
 */
async function requestBatchDownload(opts: DownloadOpts): Promise<BatchObject> {
  const url = `https://github.com/${opts.owner}/${opts.repo}.git/info/lfs/objects/batch`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.git-lfs+json',
      Accept: 'application/vnd.git-lfs+json',
      Authorization: `token ${opts.accessToken}`,
    },
    body: JSON.stringify({
      operation: 'download',
      transfers: ['basic'],
      objects: [{ oid: opts.oid, size: opts.size }],
    }),
  });
  if (res.status === 403) {
    throw new Error('LFS access denied — check your PAT permissions.');
  }
  if (!res.ok) {
    throw new Error(`LFS batch request failed (${res.status}).`);
  }
  const data = (await res.json()) as BatchResponse;
  const obj = data.objects?.[0];
  if (!obj) throw new Error('LFS batch response missing object.');
  if (obj.error) {
    if (obj.error.code === 403) throw new Error('LFS access denied — check your PAT permissions.');
    throw new Error(`LFS object error: ${obj.error.message}`);
  }
  return obj;
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  // Chunk the conversion so a multi-MB binary doesn't blow the JS string
  // arg-list limit on String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return globalThis.btoa(bin);
}

/**
 * Service for tracking + resolving LFS pointer files left on disk by
 * isomorphic-git (which has no smudge-filter pipeline). State persists
 * across launches via AsyncStorage so a relaunch still knows which files
 * are placeholders.
 */
export class LfsService {
  private static cache = new Map<string, Map<string, LfsPointer>>();

  private static repoKey(owner: string, repo: string): string {
    return `${owner}/${repo}`;
  }

  private static async load(repoKey: string): Promise<Map<string, LfsPointer>> {
    const cached = LfsService.cache.get(repoKey);
    if (cached) return cached;
    try {
      const raw = await AsyncStorage.getItem(storageKey(repoKey));
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, LfsPointer>;
        const map = new Map(Object.entries(parsed));
        LfsService.cache.set(repoKey, map);
        return map;
      }
    } catch {
      // fall through to empty
    }
    const empty = new Map<string, LfsPointer>();
    LfsService.cache.set(repoKey, empty);
    return empty;
  }

  private static async persist(repoKey: string): Promise<void> {
    const map = LfsService.cache.get(repoKey);
    if (!map || map.size === 0) {
      await AsyncStorage.removeItem(storageKey(repoKey)).catch(() => undefined);
      return;
    }
    const obj: Record<string, LfsPointer> = {};
    for (const [path, ptr] of map) obj[path] = ptr;
    await AsyncStorage.setItem(storageKey(repoKey), JSON.stringify(obj));
  }

  /**
   * Walk the working tree, parse every small file, and remember any LFS
   * pointers we find. Call after `git.checkout` completes (or whenever the
   * working tree may have been rewritten with placeholders).
   */
  static async scanRepo(
    repoPath: string,
    workingTreeUri: string,
  ): Promise<Map<string, LfsPointer>> {
    const info = parseRepoPath(repoPath);
    if (!info) return new Map();
    const repoKey = LfsService.repoKey(info.owner, info.repo);
    const found = await scanForPointers({ workingTreeUri });
    LfsService.cache.set(repoKey, found);
    await LfsService.persist(repoKey);
    return found;
  }

  /** Whether this file path is currently a known LFS placeholder. */
  static async isPending(repoPath: string, filePath: string): Promise<boolean> {
    const info = parseRepoPath(repoPath);
    if (!info) return false;
    const map = await LfsService.load(LfsService.repoKey(info.owner, info.repo));
    return map.has(filePath);
  }

  /** Get pointer metadata (oid + size) for a known placeholder. */
  static async getPointer(repoPath: string, filePath: string): Promise<LfsPointer | null> {
    const info = parseRepoPath(repoPath);
    if (!info) return null;
    const map = await LfsService.load(LfsService.repoKey(info.owner, info.repo));
    return map.get(filePath) ?? null;
  }

  /** Snapshot of all pending pointer paths for a repo. */
  static async listPending(repoPath: string): Promise<{ path: string; pointer: LfsPointer }[]> {
    const info = parseRepoPath(repoPath);
    if (!info) return [];
    const map = await LfsService.load(LfsService.repoKey(info.owner, info.repo));
    return Array.from(map, ([path, pointer]) => ({ path, pointer }));
  }

  /** Drop all tracked pointers for a repo (e.g. after `removeRepo`). */
  static async clearRepo(repoPath: string): Promise<void> {
    const info = parseRepoPath(repoPath);
    if (!info) return;
    const repoKey = LfsService.repoKey(info.owner, info.repo);
    LfsService.cache.delete(repoKey);
    await AsyncStorage.removeItem(storageKey(repoKey)).catch(() => undefined);
  }

  /**
   * Resolve a single LFS object: hit the batch endpoint, fetch the signed
   * URL, write the binary back to disk over the pointer, and remove the
   * path from the pending map. Caller passes the absolute on-disk URI of
   * the working-tree file (use `GitFsService.workingTreeUri` + path).
   */
  static async downloadObject(opts: {
    repoPath: string;
    filePath: string;
    fileUri: string;
    accessToken: string;
  }): Promise<void> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) throw new Error(`Invalid repo path: ${opts.repoPath}`);
    const repoKey = LfsService.repoKey(info.owner, info.repo);
    const map = await LfsService.load(repoKey);
    const pointer = map.get(opts.filePath);
    if (!pointer) {
      // Already resolved on a prior tap — nothing to do.
      return;
    }

    let batchObj: BatchObject;
    try {
      batchObj = await requestBatchDownload({
        owner: info.owner,
        repo: info.repo,
        oid: pointer.oid,
        size: pointer.size,
        accessToken: opts.accessToken,
      });
    } catch (e) {
      if (e instanceof Error) throw e;
      throw new Error("Couldn't download LFS file — try again.");
    }

    const action = batchObj.actions?.download;
    if (!action?.href) {
      throw new Error('LFS server did not return a download URL.');
    }

    let res: Response;
    try {
      res = await fetch(action.href, {
        method: 'GET',
        headers: action.header ?? {},
      });
    } catch {
      throw new Error("Couldn't download LFS file — try again.");
    }
    if (!res.ok) {
      throw new Error(`Couldn't download LFS file (${res.status}).`);
    }

    const ab = await res.arrayBuffer();
    const b64 = arrayBufferToBase64(ab);
    await FileSystem.writeAsStringAsync(opts.fileUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    map.delete(opts.filePath);
    await LfsService.persist(repoKey);
  }
}
