import AsyncStorage from '@react-native-async-storage/async-storage';
import type { GitHostKind } from './git/hostAdapters';

const KEY = '@gitnotes:sync_engine_modes';
const HOST_KEY = '@gitnotes:repo_host_kinds';

export type SyncEngineMode = 'api' | 'clone';

type ModeMap = Record<string, SyncEngineMode>;
type HostMap = Record<string, GitHostKind>;

async function readMap(): Promise<ModeMap> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null ? (parsed as ModeMap) : {};
  } catch (error) {
    console.warn('[SyncEngineService] Failed to load sync mode map:', error);
    return {};
  }
}

async function writeMap(map: ModeMap): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(map));
}

async function readHostMap(): Promise<HostMap> {
  try {
    const raw = await AsyncStorage.getItem(HOST_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    // Defensive: only accept known kinds. Old builds may have
    // written unexpected values; we drop them silently rather
    // than throw on the hot path.
    const out: HostMap = {};
    for (const [repo, kind] of Object.entries(parsed)) {
      if (kind === 'github' || kind === 'gitea' || kind === 'gitlab') {
        out[repo] = kind;
      }
    }
    return out;
  } catch (error) {
    console.warn('[SyncEngineService] Failed to load host kind map:', error);
    return {};
  }
}

async function writeHostMap(map: HostMap): Promise<void> {
  await AsyncStorage.setItem(HOST_KEY, JSON.stringify(map));
}

/**
 * Per-repo sync-engine selection + per-repo host kind.
 *
 * **Sync mode** (`api` | `clone`): default is `api` (Contents API
 * path). Only repos the user explicitly opts into `clone` store an
 * override; the default is implicit.
 *
 * **Host kind** (`github` | `gitea` | `gitlab`): default is
 * `github`. Stored per-repo so api-mode sync (and clone mode in
 * future revisions) can pick the right adapter without threading
 * host info through every sync service call site. The
 * `setHostKind`/`getHostKind` pair is currently unwired from the
 * UI (Phase D1 storage work); `getHostKind` returns the
 * `github` default until the storage layer starts persisting
 * host info per account/repo. The chokepoint helper
 * `getApiContentsAdapter()` in each `*GitHubSyncService` reads
 * from here so the per-repo dispatch is a 1-line change once
 * callers start setting it.
 */
export class SyncEngineService {
  static readonly DEFAULT_MODE: SyncEngineMode = 'api';
  static readonly DEFAULT_HOST_KIND: GitHostKind = 'github';

  static async getMode(repoPath: string): Promise<SyncEngineMode> {
    const map = await readMap();
    return map[repoPath] ?? SyncEngineService.DEFAULT_MODE;
  }

  static async setMode(repoPath: string, mode: SyncEngineMode): Promise<void> {
    const map = await readMap();
    if (mode === SyncEngineService.DEFAULT_MODE) {
      // Avoid persisting redundant defaults — keeps the dump small and makes
      // export/import a clearer "things the user changed" surface.
      delete map[repoPath];
    } else {
      map[repoPath] = mode;
    }
    await writeMap(map);
  }

  static async clear(repoPath: string): Promise<void> {
    await SyncEngineService.setMode(repoPath, SyncEngineService.DEFAULT_MODE);
  }

  /** Snapshot of all repos currently on non-default modes. */
  static async listOverrides(): Promise<ModeMap> {
    return readMap();
  }

  /**
   * Per-repo host kind. Returns the default (`github`) when no
   * override is stored. Safe to call from the sync service hot
   * path — backed by AsyncStorage but cheap on the warm path
   * (one read + one map lookup).
   */
  static async getHostKind(repoPath: string): Promise<GitHostKind> {
    const map = await readHostMap();
    return map[repoPath] ?? SyncEngineService.DEFAULT_HOST_KIND;
  }

  /**
   * Persist a per-repo host kind. The default is implicit; we
   * don't write `github` to storage so the dump stays small and
   * the export/import surface only includes real overrides.
   *
   * Phase 3 callers: the repo-add flow writes the host kind
   * when a user picks a non-default host, and `removeRepo`
   * clears it.
   */
  static async setHostKind(repoPath: string, kind: GitHostKind): Promise<void> {
    const map = await readHostMap();
    if (kind === SyncEngineService.DEFAULT_HOST_KIND) {
      delete map[repoPath];
    } else {
      map[repoPath] = kind;
    }
    await writeHostMap(map);
  }

  /**
   * Snapshot of all repos currently on non-default host kinds.
   * Symmetric with `listOverrides()` for the sync-mode map.
   */
  static async listHostOverrides(): Promise<HostMap> {
    return readHostMap();
  }
}
