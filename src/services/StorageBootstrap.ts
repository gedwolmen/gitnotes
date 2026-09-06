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
  '@gitnotes:glossy',
  '@gitnotes:style',
  '@gitnotes:viewMode',
  '@gitnotes:auth_token',
  '@gitnotes:auth_user',
  '@gitnotes:onboarding_completed',
  '@gitnotes:default_note_format',
  '@gitnotes:remember_format',
  '@gitnotes:sync_queue',
  '@gitnotes:backlinks_index',
  '@gitnotes:templates_repo',
  '@gitnotes:pro_grandfathered',
  '@gitnotes:grandfather_checked',
  '@gitnotes:first_seen_build',
  '@gitnotes:restore_granted',
  '@gitnotes:trial_was_active',
  '@gitnotes:trial_expired_at',
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

  const result = await AsyncStorage.multiGet([...STARTUP_KEYS]);
  bootCache = new Map(result);
  return bootCache;
}

/**
 * Get a pre-loaded value from the bootstrap cache.
 *
 * Consumes the entry on read: subsequent calls for the same key return
 * `undefined`, and callers fall through to `AsyncStorage.getItem` which is
 * authoritative. Without this, a write (e.g. adding a repo, saving canvases)
 * would leave the boot cache holding a stale snapshot, and any later read
 * within the same session would still see the pre-write value until app
 * restart re-bootstrapped the cache.
 *
 * The point of bootCache is to amortize the cost of the very first read at
 * app startup — once a key has been read once, the optimization has already
 * paid off and keeping the entry around is purely a foot-gun.
 */
export function getBootValue(key: StartupKey): string | null | undefined {
  if (!bootCache) return undefined;
  if (!bootCache.has(key)) return undefined;
  const value = bootCache.get(key);
  if (value === null) return null;
  bootCache.delete(key);
  return value;
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
