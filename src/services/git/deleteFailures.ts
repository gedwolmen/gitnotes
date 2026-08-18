import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Durable record of dropped note-delete mutations.
 *
 * When the sync queue drops a `note.delete` (non-retryable error or
 * retry budget exhausted) the delete never reached the remote, so the
 * upstream file still exists. This map keeps one entry per dropped
 * delete so surfaces can treat the tombstone as permanent (pinned past
 * the 24h TTL) until the user retries — otherwise the tombstone expires
 * and the next pull resurrects the note the user deleted.
 *
 * Contract shared with `gitOperationStore` hydration: key/shape here are
 * canonical — do not change without updating the registry reader.
 */
export const DELETE_FAILURES_STORAGE_KEY = '@gitnotes:delete_failures_v1';

export interface DeleteFailureEntry {
  error: string;
  kind: string;
  at: number;
}

export type DeleteFailureMap = Record<string, DeleteFailureEntry>;

/** Key format mirrors the delete-tombstone key: `repo::resolvedBranch::path`. */
export function deleteFailureKey(
  repo: string,
  branch: string | undefined,
  filePath: string,
): string {
  return `${repo}::${branch || 'main'}::${filePath}`;
}

/** Inverse of `deleteFailureKey` — parse a map key back into its parts. */
export function parseDeleteFailureKey(
  key: string,
): { repo: string; branch: string; path: string } | null {
  const firstSep = key.indexOf('::');
  const secondSep = firstSep >= 0 ? key.indexOf('::', firstSep + 2) : -1;
  if (firstSep <= 0 || secondSep === -1) return null;
  const repo = key.slice(0, firstSep);
  const branch = key.slice(firstSep + 2, secondSep);
  const path = key.slice(secondSep + 2);
  if (!repo || !path) return null;
  return { repo, branch, path };
}

export async function readDeleteFailures(): Promise<DeleteFailureMap> {
  try {
    const raw = await AsyncStorage.getItem(DELETE_FAILURES_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as DeleteFailureMap;
  } catch {
    return {};
  }
}

export async function recordDeleteFailure(
  repo: string,
  branch: string | undefined,
  filePath: string,
  entry: DeleteFailureEntry,
): Promise<void> {
  try {
    const map = await readDeleteFailures();
    map[deleteFailureKey(repo, branch, filePath)] = entry;
    await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort persistence */ }
}

export async function clearDeleteFailure(
  repo: string,
  branch: string | undefined,
  filePath: string,
): Promise<void> {
  try {
    const map = await readDeleteFailures();
    const key = deleteFailureKey(repo, branch, filePath);
    if (!(key in map)) return;
    delete map[key];
    await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort persistence */ }
}

/** Remove every delete-failure entry whose key starts with `${repoPath}::`. */
export async function clearDeleteFailuresForRepo(repoPath: string): Promise<void> {
  try {
    const map = await readDeleteFailures();
    const prefix = `${repoPath}::`;
    let changed = false;
    for (const key of Object.keys(map)) {
      if (key.startsWith(prefix)) {
        delete map[key];
        changed = true;
      }
    }
    if (!changed) return;
    await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, JSON.stringify(map));
  } catch { /* best-effort persistence */ }
}
