import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import NetInfo, { type NetInfoSubscription } from '@react-native-community/netinfo';
import { GitHubService } from './GitHubService';
import { StorageService } from './StorageService';
import { pullAllFromRepos } from './RepoPullService';

/**
 * Foreground auto-pull driver: pulls every tracked repo when the app becomes
 * active, when network transitions offline → online, and on a configurable
 * interval while the app is in the foreground. This complements
 * `BackgroundSyncService` (which runs at OS-scheduled intervals) and is the
 * mitigation for issue #563 — multi-device users no longer have to pull-to-
 * refresh every time they switch phones.
 *
 * All triggers funnel through `runPull()`, which:
 *   - skips if no GitHub token / no repos
 *   - skips if offline (`NetInfo.fetch()`)
 *   - coalesces overlapping triggers via `inFlight` and a 2-second debounce
 *     so that AppState→active and online→online firing together don't queue
 *     two pulls back-to-back
 */

const COALESCE_WINDOW_MS = 2000;

type Listener = () => void;

let appStateSub: NativeEventSubscription | null = null;
let netInfoUnsub: NetInfoSubscription | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;

let inFlight = false;
let lastRunAt = 0;

let currentIntervalSeconds = 0;
let currentSyncFrequentlyEnabled = true;

let lastNetReachable: boolean | null = null;
let lastAppState: AppStateStatus = AppState.currentState;

const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (error) {
      console.warn('[ForegroundSync] listener failed:', error);
    }
  }
}

async function shouldPull(): Promise<boolean> {
  if (!GitHubService.isAuthenticated()) return false;
  const repos = await StorageService.getSavedRepositories();
  if (repos.length === 0) return false;
  const net = await NetInfo.fetch();
  const reachable = net.isInternetReachable ?? net.isConnected ?? false;
  return reachable;
}

async function runPull(reason: string): Promise<void> {
  if (inFlight) return;
  if (Date.now() - lastRunAt < COALESCE_WINDOW_MS) return;
  if (!(await shouldPull())) return;

  inFlight = true;
  lastRunAt = Date.now();
  notify();
  try {
    await pullAllFromRepos();
  } catch (error) {
    console.warn(`[ForegroundSync] pull (${reason}) failed:`, error);
  } finally {
    inFlight = false;
    lastRunAt = Date.now();
    notify();
  }
}

function restartInterval(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  if (!currentSyncFrequentlyEnabled) return;
  if (currentIntervalSeconds <= 0) return;
  if (lastAppState !== 'active') return;

  intervalHandle = setInterval(() => {
    void runPull('interval');
  }, currentIntervalSeconds * 1000);
}

function handleAppStateChange(state: AppStateStatus): void {
  const wasInactive = lastAppState !== 'active';
  lastAppState = state;
  if (state === 'active') {
    if (wasInactive) void runPull('appstate-active');
    restartInterval();
  } else if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function handleNetInfo(reachable: boolean): void {
  const cameOnline = lastNetReachable === false && reachable === true;
  lastNetReachable = reachable;
  if (cameOnline) void runPull('online');
}

export interface ForegroundSyncConfig {
  syncFrequentlyEnabled: boolean;
  syncIntervalSeconds: number;
}

export function startForegroundWatcher(config: ForegroundSyncConfig): void {
  currentSyncFrequentlyEnabled = config.syncFrequentlyEnabled;
  currentIntervalSeconds = config.syncIntervalSeconds;

  if (!appStateSub) {
    appStateSub = AppState.addEventListener('change', handleAppStateChange);
  }
  if (!netInfoUnsub) {
    netInfoUnsub = NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable ?? state.isConnected ?? false;
      handleNetInfo(reachable);
    });
    // Seed the last-known reachability so the very first event isn't
    // misread as "came online" (otherwise the watcher would pull every
    // mount on a connected device).
    NetInfo.fetch()
      .then((state) => {
        lastNetReachable = state.isInternetReachable ?? state.isConnected ?? false;
      })
      .catch(() => undefined);
  }

  restartInterval();
}

export function updateForegroundWatcherConfig(config: ForegroundSyncConfig): void {
  currentSyncFrequentlyEnabled = config.syncFrequentlyEnabled;
  currentIntervalSeconds = config.syncIntervalSeconds;
  restartInterval();
}

export function stopForegroundWatcher(): void {
  if (appStateSub) {
    appStateSub.remove();
    appStateSub = null;
  }
  if (netInfoUnsub) {
    netInfoUnsub();
    netInfoUnsub = null;
  }
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
  lastNetReachable = null;
  lastAppState = AppState.currentState;
}

export function isForegroundSyncInFlight(): boolean {
  return inFlight;
}

export function subscribeForegroundSync(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Test-only: manual trigger so unit tests don't have to fake AppState/NetInfo.
export async function __runPullForTest(reason = 'test'): Promise<void> {
  await runPull(reason);
}

// Test-only: reset internal state so each test starts fresh.
export function __resetForegroundSyncForTest(): void {
  stopForegroundWatcher();
  inFlight = false;
  lastRunAt = 0;
  currentIntervalSeconds = 0;
  currentSyncFrequentlyEnabled = true;
  listeners.clear();
}
