/**
 * IOSShortcutAdapters — iOS Shortcuts and App Intents for git2-rs sync.
 *
 * Provides integration with iOS Shortcuts and App Intents framework.
 * Exposes sync operations as callable intents that can be triggered via:
 *   - iOS Shortcuts app
 *   - Siri voice commands
 *   - Automation triggers (time-based, location-based, etc.)
 *   - Action button on iPhone 15 Pro+
 *
 * Routes all operations exclusively to useSyncStore — no old services referenced.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { Linking, Platform } from 'react-native';
import { useSyncStore } from '../sync/syncState';
import { useGit2SettingsStore } from './git2SettingsStore';
import { useRepoStore } from '../repositories/repoStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type IOSShortcutAction =
  | 'sync_all'
  | 'sync_repo'
  | 'check_status'
  | 'toggle_sync';

export interface IOSShortcutResult {
  success: boolean;
  message: string;
  repoCount?: number;
  syncMode?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseIntentUrl(url: string): { hostname: string | null; queryParams: Record<string, string> } {
  try {
    const parsed = new URL(url);
    const queryParams: Record<string, string> = {};
    parsed.searchParams.forEach((value, key) => {
      queryParams[key] = value;
    });
    return { hostname: parsed.hostname || null, queryParams };
  } catch {
    return { hostname: null, queryParams: {} };
  }
}

// ─── Shortcut Actions ────────────────────────────────────────────────────────

/**
 * Sync all eligible repositories.
 * Called from iOS Shortcuts or App Intents.
 */
export async function syncAllReposShortcut(): Promise<IOSShortcutResult> {
  const syncOverwrites = useGit2SettingsStore.getState().syncOverwrites;
  const allRepos = useRepoStore.getState().repositories;
  const eligibleRepos = allRepos
    .filter((r) => {
      const behavior = useGit2SettingsStore.getState().perRepoBehavior[r.id];
      return !behavior?.excludeFromBackgroundSync;
    })
    .slice(0, syncOverwrites.maxReposPerCycle);

  if (eligibleRepos.length === 0) {
    return {
      success: true,
      message: 'No repositories to sync.',
      repoCount: 0,
    };
  }

  let syncedCount = 0;
  let lastError: string | undefined;

  for (const repo of eligibleRepos) {
    try {
      await useSyncStore.getState().syncRepo(repo);
      syncedCount++;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    success: syncedCount > 0,
    message: lastError
      ? `Synced ${syncedCount}/${eligibleRepos.length} repos. Error: ${lastError}`
      : `Synced ${syncedCount} repo(s) successfully.`,
    repoCount: syncedCount,
  };
}

/**
 * Sync a specific repository by ID.
 * Called from iOS Shortcuts with a repo ID parameter.
 */
export async function syncRepoShortcut(repoId: string): Promise<IOSShortcutResult> {
  const allRepos = useRepoStore.getState().repositories;
  const repo = allRepos.find((r) => r.id === repoId);

  if (!repo) {
    return {
      success: false,
      message: `Repository with ID "${repoId}" not found.`,
    };
  }

  try {
    await useSyncStore.getState().syncRepo(repo);
    return {
      success: true,
      message: `Synced "${repo.name}" successfully.`,
      repoCount: 1,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed to sync "${repo.name}": ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Check sync status of all repos.
 * Returns a summary suitable for Shortcuts output.
 */
export async function checkSyncStatusShortcut(): Promise<IOSShortcutResult> {
  const { repos } = useSyncStore.getState();
  const allRepos = useRepoStore.getState().repositories;

  const syncing = allRepos.filter((r) => {
    const state = repos[r.id];
    return state && state.phase !== 'idle';
  });

  const lastSynced = allRepos
    .map((r) => {
      const state = repos[r.id];
      return state?.lastSyncedAt ?? 0;
    })
    .filter((t) => t > 0)
    .sort((a, b) => b - a)[0];

  const lastSyncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleString()
    : 'Never';

  return {
    success: true,
    message: `${allRepos.length} repos configured. ${syncing.length} currently syncing. Last sync: ${lastSyncedLabel}`,
    repoCount: allRepos.length,
  };
}

/**
 * Toggle sync mode.
 * Cycles through: manual → quick → scheduled → manual
 */
export async function toggleSyncModeShortcut(
  targetMode?: 'manual' | 'quick' | 'scheduled',
): Promise<IOSShortcutResult> {
  const { settings } = useSyncStore.getState();
  const { updateSettings, registerBackgroundTask } = useSyncStore.getState();

  const modes: Array<'manual' | 'quick' | 'scheduled'> = ['manual', 'quick', 'scheduled'];
  let nextMode: 'manual' | 'quick' | 'scheduled';

  if (targetMode) {
    nextMode = targetMode;
  } else {
    const currentIndex = modes.indexOf(settings.mode);
    nextMode = modes[(currentIndex + 1) % modes.length];
  }

  await updateSettings({ mode: nextMode });

  if (nextMode === 'scheduled') {
    await registerBackgroundTask();
  }

  return {
    success: true,
    message: `Sync mode set to "${nextMode}".`,
    syncMode: nextMode,
  };
}

// ─── URL Scheme Handler ──────────────────────────────────────────────────────

let linkingSubscription: ReturnType<typeof Linking.addEventListener> | null = null;

const INTENT_HOST_SHORTCUT = 'shortcut';

/**
 * Register a deep link listener for iOS Shortcut intents.
 * Routes incoming URLs to the appropriate shortcut action.
 */
export function registerIOSShortcutAdapter(): void {
  if (Platform.OS !== 'ios') return;
  if (linkingSubscription) return;

  linkingSubscription = Linking.addEventListener('url', handleShortcutIntent);
}

export function unregisterIOSShortcutAdapter(): void {
  linkingSubscription?.remove();
  linkingSubscription = null;
}

async function handleShortcutIntent(event: { url: string }): Promise<void> {
  try {
    const { hostname, queryParams } = parseIntentUrl(event.url);

    if (hostname !== INTENT_HOST_SHORTCUT) return;

    const action = typeof queryParams.action === 'string' ? queryParams.action : 'sync_all';

    switch (action) {
      case 'sync_all':
        await syncAllReposShortcut();
        break;
      case 'sync_repo': {
        const repoId = typeof queryParams.repoId === 'string' ? queryParams.repoId : '';
        if (repoId) await syncRepoShortcut(repoId);
        break;
      }
      case 'check_status':
        await checkSyncStatusShortcut();
        break;
      case 'toggle_sync': {
        const mode = typeof queryParams.mode === 'string' ? queryParams.mode : undefined;
        await toggleSyncModeShortcut(
          mode as 'manual' | 'quick' | 'scheduled' | undefined,
        );
        break;
      }
      default:
        console.warn(`[IOSShortcutAdapters] Unknown action: ${action}`);
    }
  } catch (err) {
    console.warn('[IOSShortcutAdapters] shortcut intent failed:', err);
  }
}

// ─── Shortcut Phrases (for App Shortcuts integration) ────────────────────────

/**
 * Shortcut phrases that can be registered with the iOS Shortcuts app.
 * These are the Siri phrases that users can speak to trigger sync operations.
 *
 * To fully integrate with Siri App Shortcuts, these phrases need to be
 * registered in the native iOS module via AppIntents framework. This
 * TypeScript layer provides the phrase definitions for reference and
 * the URL scheme handler for actual execution.
 */
export const SHORTCUT_PHRASES = {
  syncAll: [
    'Sync all repos in GitNotēs',
    'Sync my notes',
    'GitNotēs sync',
  ],
  checkStatus: [
    'Check sync status in GitNotēs',
    'How are my repos syncing',
    'GitNotēs status',
  ],
  toggleMode: [
    'Toggle sync mode in GitNotēs',
    'Switch GitNotēs sync mode',
    'Change GitNotēs sync',
  ],
} as const;

// ─── Registration Helper ─────────────────────────────────────────────────────

/**
 * Register all iOS shortcut adapters. Called once on app startup.
 * No-ops on Android.
 */
export function registerIOSShortcuts(): void {
  if (Platform.OS !== 'ios') return;

  registerIOSShortcutAdapter();
}

/**
 * Unregister all iOS shortcut adapters. Called on app shutdown.
 */
export function unregisterIOSShortcuts(): void {
  unregisterIOSShortcutAdapter();
}
