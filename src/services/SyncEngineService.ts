import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@gitnotes:sync_engine_modes';

export type SyncEngineMode = 'api' | 'clone';

type ModeMap = Record<string, SyncEngineMode>;

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

/**
 * Per-repo sync-engine selection. Default is 'clone' (full working-tree
 * clone), and only repos the user explicitly opts back into the 'api'
 * (Contents-API) path store an entry.
 */
export class SyncEngineService {
  static readonly DEFAULT_MODE: SyncEngineMode = 'clone';

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
}
