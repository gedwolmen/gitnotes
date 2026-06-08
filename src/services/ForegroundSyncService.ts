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
 *   - backs off after failures to prevent continuous UI blocking
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

let consecutiveFailures = 0;
let lastFailedAt = 0;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 300_000;

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

const PULL_WATCHDOG_MS = 60_000;

async function runPull(reason: string): Promise<void> {
  if (inFlight) {
    if (__DEV__) console.log(`[ForegroundSync] skip (${reason}): already in flight`);
    return;
  }
  if (Date.now() - lastRunAt < COALESCE_WINDOW_MS) {
    if (__DEV__) console.log(`[ForegroundSync] skip (${reason}): coalesce window`);
    return;
  }
  if (!(await shouldPull())) {
    if (__DEV__) console.log(`[ForegroundSync] skip (${reason}): shouldPull=false`);
    return;
  }

  if (consecutiveFailures > 0) {
    const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, consecutiveFailures - 1), MAX_BACKOFF_MS);
    if (Date.now() - lastFailedAt < backoffMs) {
      if (__DEV__) console.log(`[ForegroundSync] skip (${reason}): backoff ${Math.round(backoffMs / 1000)}s`);
      return;
    }
  }

  inFlight = true;
  lastRunAt = Date.now();
  notify();

  let watchdog: ReturnType<typeof setTimeout> | null = null;
  const watchdogPromise = new Promise<void>((_, reject) => {
    watchdog = setTimeout(
      () => reject(new Error(`pull tick exceeded ${PULL_WATCHDOG_MS}ms`)),
      PULL_WATCHDOG_MS,
    );
  });

  const startedAt = Date.now();
  let success = false;
  try {
    await Promise.race([pullAllFromRepos(), watchdogPromise]);
    success = true;
    if (__DEV__) {
      console.log(`[ForegroundSync] pull (${reason}) ok in ${Date.now() - startedAt}ms`);
    }
  } catch (error) {
    console.warn(`[ForegroundSync] pull (${reason}) failed after ${Date.now() - startedAt}ms:`, error);
  } finally {
    if (watchdog !== null) clearTimeout(watchdog);
    inFlight = false;
    lastRunAt = Date.now();
    if (success) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      lastFailedAt = Date.now();
    }
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

export async function __runPullForTest(reason = 'test'): Promise<void> {
  await runPull(reason);
}

export function __resetForegroundSyncForTest(): void {
  stopForegroundWatcher();
  inFlight = false;
  lastRunAt = 0;
  currentIntervalSeconds = 0;
  currentSyncFrequentlyEnabled = true;
  consecutiveFailures = 0;
  lastFailedAt = 0;
  listeners.clear();
}
