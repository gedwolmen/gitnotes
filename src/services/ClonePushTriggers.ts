/**
 * ClonePushTriggers — foreground-active, online-transition, 3-min idle, and OS
 * background-task push triggers for write-through clone mode.
 *
 * Fires `CloneSyncService.pushPending(repoPath, branch)` for all repos that have
 * pending items when:
 *   (a) App becomes active (AppState → 'active')
 *   (b) Network transitions online (NetInfo.isConnected / isInternetReachable)
 *   (c) 3-minute idle timer fires (reset on every gitActivityStore.commitRevision bump)
 *   (d) App enters background (OS background task — logs intent, actual scheduling is a stub)
 *
 * Does NOT push if the pending queue is empty for a repo.
 */

import { AppState, type AppStateStatus } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { CloneSyncService } from './CloneSyncService';
import { ClonePendingQueue } from './git/ClonePendingQueue';
import { useGitActivityStore } from '../stores/gitActivityStore';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const IDLE_MS_DEFAULT = 180_000; // 3 minutes
const BACKGROUND_CAP_DEFAULT = 50;
const ONLINE_DEBOUNCE_MS = 1_000;

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let appStateSub: { remove: () => void } | null = null;
let netInfoHandle: ReturnType<typeof NetInfo.addEventListener> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

let cfg = {
  idleMs: IDLE_MS_DEFAULT,
  backgroundCap: BACKGROUND_CAP_DEFAULT,
  isPaused: false,
  idleEnabled: true,
  backgroundEnabled: true,
};

let isStarted = false;
let lastOnline = true;

// ---------------------------------------------------------------------------
// Idle timer
// ---------------------------------------------------------------------------

function scheduleIdleTimer(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (cfg.isPaused || !cfg.idleEnabled) return;
  idleTimer = setTimeout(() => {
    void pushAllPending();
  }, cfg.idleMs);
}

function resetIdleTimer(): void {
  scheduleIdleTimer();
}

// ---------------------------------------------------------------------------
// Core push
// ---------------------------------------------------------------------------

async function pushAllPending(): Promise<void> {
  if (cfg.isPaused) return;
  try {
    const allPending = await ClonePendingQueue.listAllPending();
    if (allPending.length === 0) return;

    // Group by repo+branch to avoid duplicate pushes
    const seen = new Set<string>();
    for (const item of allPending) {
      const key = `${item.repoPath}::${item.branch}`;
      if (seen.has(key)) continue;
      seen.add(key);
      try {
        await CloneSyncService.pushPending(item.repoPath, item.branch);
      } catch (err) {
        console.warn('[ClonePushTriggers] pushPending failed:', err);
        // Continue with other repos
      }
    }
  } catch (err) {
    console.warn('[ClonePushTriggers] pushAllPending failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Trigger sources
// ---------------------------------------------------------------------------

function startAppStateTrigger(): void {
  const handler = (nextState: AppStateStatus) => {
    if (nextState === 'active') {
      if (!cfg.isPaused && cfg.idleEnabled) scheduleIdleTimer();
      if (!cfg.isPaused) void pushAllPending();
    }
  };
  appStateSub = AppState.addEventListener('change', handler);
}

function startNetInfoTrigger(): void {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handler = async () => {
    const state = await NetInfo.fetch();
    const isOnline =
      state.isConnected === true || state.isInternetReachable === true;

    if (lastOnline === false && isOnline === true) {
      // Online transition — debounce to avoid flap
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!cfg.isPaused) void pushAllPending();
      }, ONLINE_DEBOUNCE_MS);
    }
    lastOnline = isOnline;
  };

  netInfoHandle = NetInfo.addEventListener(handler);
}

function startIdleTrigger(): void {
  // Reset idle timer on every commitRevision bump
  useGitActivityStore.subscribe(() => {
    resetIdleTimer();
  });
  // Schedule initial timer
  scheduleIdleTimer();
}

function startBackgroundTrigger(): void {
  const handler = async (nextState: AppStateStatus) => {
    if (nextState !== 'background') return;
    if (cfg.isPaused || !cfg.backgroundEnabled) return;
    // Stub — actual OS background task scheduling would use expo-task-manager.
    // Log intent; the next foreground transition will catch pending items.
    const pending = await ClonePendingQueue.listAllPending();
    if (pending.length > 0) {
      console.info(
        `[ClonePushTriggers] background push intent: ${pending.length} items`,
      );
    }
  };
  AppState.addEventListener('change', handler);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function startClonePushTriggers(opts?: {
  idleMs?: number;
  backgroundCap?: number;
  isPaused?: boolean;
  idleEnabled?: boolean;
  backgroundEnabled?: boolean;
}): void {
  if (isStarted) return; // Prevent double-start
  isStarted = true;

  if (opts?.idleMs !== undefined) cfg.idleMs = opts.idleMs;
  if (opts?.backgroundCap !== undefined) cfg.backgroundCap = opts.backgroundCap;
  if (opts?.isPaused !== undefined) cfg.isPaused = opts.isPaused;
  if (opts?.idleEnabled !== undefined) cfg.idleEnabled = opts.idleEnabled;
  if (opts?.backgroundEnabled !== undefined) cfg.backgroundEnabled = opts.backgroundEnabled;

  startAppStateTrigger();
  startNetInfoTrigger();
  startIdleTrigger();
  startBackgroundTrigger();
}

export function updateClonePushTriggersConfig(opts: {
  idleMs?: number;
  backgroundCap?: number;
  isPaused?: boolean;
  idleEnabled?: boolean;
  backgroundEnabled?: boolean;
}): void {
  if (opts.idleMs !== undefined) cfg.idleMs = opts.idleMs;
  if (opts.backgroundCap !== undefined) cfg.backgroundCap = opts.backgroundCap;
  if (opts.idleEnabled !== undefined) cfg.idleEnabled = opts.idleEnabled;
  if (opts.backgroundEnabled !== undefined) cfg.backgroundEnabled = opts.backgroundEnabled;
  if (opts.isPaused !== undefined) {
    cfg.isPaused = opts.isPaused;
  }
  if (cfg.isPaused || !cfg.idleEnabled) {
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  } else {
    scheduleIdleTimer();
  }
}

export function stopClonePushTriggers(): void {
  appStateSub?.remove();
  appStateSub = null;
  // netInfoHandle type uses ReturnType<typeof NetInfo.addEventListener> which is
  // NetInfoSubscription — it has a remove() method but TS types may not expose it.
  // Cast through unknown to satisfy strict mode.
  if (netInfoHandle) {
    const handle = netInfoHandle as unknown as { remove: () => void };
    if (typeof handle.remove === 'function') {
      handle.remove();
    }
  }
  netInfoHandle = null;
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  isStarted = false;
}

export function isClonePushIdleTimerActive(): boolean {
  return idleTimer !== null && !cfg.isPaused && cfg.idleEnabled;
}

export function __resetClonePushTriggersForTest(): void {
  stopClonePushTriggers();
  cfg = { idleMs: IDLE_MS_DEFAULT, backgroundCap: BACKGROUND_CAP_DEFAULT, isPaused: false, idleEnabled: true, backgroundEnabled: true };
  lastOnline = true;
}
