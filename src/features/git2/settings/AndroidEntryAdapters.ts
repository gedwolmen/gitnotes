/**
 * AndroidEntryAdapters — Android platform entry points for git2-rs sync.
 *
 * Handles routing of Android-specific triggers to the native serial sync store:
 *   - App open/close (AppState change)
 *   - Quick Settings tile (custom BroadcastReceiver)
 *   - Home screen widget (AppWidgetProvider)
 *   - Custom intent receiver (deep links / broadcast)
 *
 * All triggers route exclusively to useSyncStore — no old foreground/background
 * sync services are referenced.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { AppState, AppStateStatus, Linking, Platform } from 'react-native';
import { useSyncStore, type SyncMode } from '../sync/syncState';
import { useGit2SettingsStore } from './git2SettingsStore';
import { useRepoStore } from '../repositories/repoStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AndroidTrigger =
  | 'app_open'
  | 'app_close'
  | 'quick_tile'
  | 'widget_sync'
  | 'custom_intent';

export interface AndroidTriggerResult {
  triggered: boolean;
  repos: number;
  error?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const CUSTOM_INTENT_SCHEME = 'gitnotes';
const CUSTOM_INTENT_HOST = 'sync';

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

// ─── App Open/Close Adapter ──────────────────────────────────────────────────

let appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

/**
 * Register AppState listener that triggers sync on app foreground transition.
 * Respects the "quick sync on app focus" setting and the sync mode being
 * 'quick' or 'scheduled'.
 */
export function registerAppOpenCloseAdapter(): void {
  if (appStateSubscription) return;

  appStateSubscription = AppState.addEventListener(
    'change',
    handleAppStateChange,
  );
}

export function unregisterAppOpenCloseAdapter(): void {
  appStateSubscription?.remove();
  appStateSubscription = null;
}

async function handleAppStateChange(state: AppStateStatus): Promise<void> {
  if (state !== 'active') return;

  const { settings, repos } = useSyncStore.getState();
  const syncOverwrites = useGit2SettingsStore.getState().syncOverwrites;

  if (settings.mode !== 'quick' && settings.mode !== 'scheduled') return;
  if (!settings.quickSyncOnAppFocus) return;

  const allRepos = useRepoStore.getState().repositories;
  const eligibleRepos = allRepos
    .filter((r) => {
      const behavior = useGit2SettingsStore.getState().perRepoBehavior[r.id];
      return !behavior?.excludeFromBackgroundSync;
    })
    .slice(0, syncOverwrites.maxReposPerCycle);

  for (const repo of eligibleRepos) {
    const repoState = repos[repo.id];
    if (repoState && repoState.phase !== 'idle') continue;

    try {
      await useSyncStore.getState().syncRepo(repo);
    } catch {
      // Sync failure is logged inside syncRepo; don't crash the adapter
    }
  }
}

// ─── Quick Settings Tile Adapter ─────────────────────────────────────────────

/**
 * Handle a tap on the Android Quick Settings tile for Git2 sync.
 *
 * This function is designed to be called from a native BroadcastReceiver
 * via Expo Module API or a deep link handler. On Android, the tile sends
 * an intent that can be intercepted via Linking or a custom Expo module.
 *
 * Routes to: useSyncStore.syncRepo for all repos.
 */
export async function handleQuickTileTrigger(): Promise<AndroidTriggerResult> {
  const syncOverwrites = useGit2SettingsStore.getState().syncOverwrites;
  const allRepos = useRepoStore.getState().repositories;
  const eligibleRepos = allRepos
    .filter((r) => {
      const behavior = useGit2SettingsStore.getState().perRepoBehavior[r.id];
      return !behavior?.excludeFromBackgroundSync;
    })
    .slice(0, syncOverwrites.maxReposPerCycle);

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
    triggered: syncedCount > 0,
    repos: syncedCount,
    error: lastError,
  };
}

// ─── Widget Adapter ──────────────────────────────────────────────────────────

/**
 * Handle a sync request from the home screen widget.
 *
 * The widget sends a broadcast intent that can be intercepted via
 * Expo Linking or a native module. This adapter routes the request
 * to the sync store for all eligible repos.
 */
export async function handleWidgetSyncTrigger(): Promise<AndroidTriggerResult> {
  return handleQuickTileTrigger();
}

// ─── Custom Intent Adapter ───────────────────────────────────────────────────

let linkingSubscription: ReturnType<typeof Linking.addEventListener> | null = null;

/**
 * Register a deep link listener for custom sync intents.
 *
 * Supported URL format:
 *   gitnotes://sync          — trigger sync for all repos
 *   gitnotes://sync?repo=ID  — trigger sync for a specific repo
 *   gitnotes://sync?mode=quick — temporarily override sync mode
 */
export function registerCustomIntentAdapter(): void {
  if (linkingSubscription) return;

  linkingSubscription = Linking.addEventListener('url', handleCustomIntent);
}

export function unregisterCustomIntentAdapter(): void {
  linkingSubscription?.remove();
  linkingSubscription = null;
}

async function handleCustomIntent(event: { url: string }): Promise<void> {
  try {
    const { hostname, queryParams } = parseIntentUrl(event.url);

    if (hostname !== CUSTOM_INTENT_HOST) return;

    const targetRepoId = typeof queryParams.repo === 'string' ? queryParams.repo : undefined;
    const modeOverride = typeof queryParams.mode === 'string' ? queryParams.mode : undefined;

    const syncOverwrites = useGit2SettingsStore.getState().syncOverwrites;
    const allRepos = useRepoStore.getState().repositories;

    let reposToSync = allRepos;

    if (targetRepoId) {
      reposToSync = allRepos.filter((r) => r.id === targetRepoId);
    } else {
      reposToSync = allRepos
        .filter((r) => {
          const behavior = useGit2SettingsStore.getState().perRepoBehavior[r.id];
          return !behavior?.excludeFromBackgroundSync;
        })
        .slice(0, syncOverwrites.maxReposPerCycle);
    }

    if (modeOverride === 'quick' || modeOverride === 'scheduled' || modeOverride === 'manual') {
      const originalSettings = useSyncStore.getState().settings;
      await useSyncStore.getState().updateSettings({ mode: modeOverride as SyncMode });

      for (const repo of reposToSync) {
        try {
          await useSyncStore.getState().syncRepo(repo);
        } catch {
          // Logged in syncRepo
        }
      }

      await useSyncStore.getState().updateSettings({ mode: originalSettings.mode });
    } else {
      for (const repo of reposToSync) {
        try {
          await useSyncStore.getState().syncRepo(repo);
        } catch {
          // Logged in syncRepo
        }
      }
    }
  } catch (err) {
    console.warn('[AndroidEntryAdapters] custom intent failed:', err);
  }
}

// ─── Registration Helper ─────────────────────────────────────────────────────

/**
 * Register all Android entry adapters. Called once on app startup.
 * No-ops on iOS.
 */
export function registerAndroidAdapters(): void {
  if (Platform.OS !== 'android') return;

  registerAppOpenCloseAdapter();
  registerCustomIntentAdapter();
}

/**
 * Unregister all Android entry adapters. Called on app shutdown.
 */
export function unregisterAndroidAdapters(): void {
  unregisterAppOpenCloseAdapter();
  unregisterCustomIntentAdapter();
}
