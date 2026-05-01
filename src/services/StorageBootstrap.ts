import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * All storage keys used at app startup.
 * Grouped here so we can batch-read them with a single multiGet call.
 */
const STARTUP_KEYS = [
  '@gitnotes:notes',          // legacy blob — used for migration
  '@gitnotes:note_index',     // per-note index (array of IDs)
  '@gitnotes:folders',
  '@gitnotes:repos',
  '@gitnotes:todos',
  '@gitnotes:canvases',
  '@gitnotes:theme',
  '@gitnotes:style',
  '@gitnotes:viewMode',
  '@gitnotes:auth_token',
  '@gitnotes:auth_user',
  '@gitnotes:onboarding_completed',
  '@gitnotes:default_note_format',
  '@gitnotes:remember_format',
  '@gitnotes:sync_queue',
  '@gitnotes:backlinks_index',
] as const;

type StartupKey = (typeof STARTUP_KEYS)[number];

let bootCache: Map<string, string | null> | null = null;

/**
 * Batch-reads all startup storage keys in a single AsyncStorage.multiGet call.
 * Call once at app init (before any provider mounts).
 * Subsequent calls return the cached result.
 */
export async function bootstrapStorage(): Promise<Map<string, string | null>> {
  if (bootCache) return bootCache;

  const pairs = await AsyncStorage.multiGet([...STARTUP_KEYS]);
  bootCache = new Map(pairs);
  return bootCache;
}

/**
 * Get a pre-loaded value from the bootstrap cache.
 * Returns undefined if bootstrap hasn't run or key wasn't requested.
 */
export function getBootValue(key: StartupKey): string | null | undefined {
  return bootCache?.get(key);
}

/**
 * Invalidate the boot cache (e.g. after logout).
 */
export function clearBootCache(): void {
  bootCache = null;
}

/**
 * Keys used for per-note storage.
 * Individual note bodies are stored under `@gitnotes:note:<id>`.
 */
export const NOTE_INDEX_KEY = '@gitnotes:note_index';
export function noteKey(id: string): string {
  return `@gitnotes:note:${id}`;
}
