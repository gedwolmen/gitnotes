/**
 * GitSync state machine and orchestration for git2-rs.
 *
 * State transitions:
 *   idle → fetching → merge_analysis → staging → committing → pushing → idle
 *                                                      ↓
 *                                               conflict_detected
 *                                                      ↓
 *                                                conflict_staged
 *                                                      ↓
 *                                                  resolving
 *                                                      ↓
 *                                                    idle
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as NetInfo from '@react-native-community/netinfo';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { Git2Client } from '../../../../modules/expo-git2-rs/src/Git2Client';
import type {
  GitProgress,
  CredentialRequest,
  FetchResult,
  StageResult,
  StatusEntry,
} from '../../../../modules/expo-git2-rs/src/types';
import { GitOperationError } from '../../../../modules/expo-git2-rs/src/errors';
import { useAuthStore } from '../auth/authStore';
import type { GitRepository } from '../repositories/repoStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SyncPhase =
  | 'idle'
  | 'fetching'
  | 'merge_analysis'
  | 'staging'
  | 'committing'
  | 'pushing'
  | 'conflict_detected'
  | 'conflict_staged'
  | 'resolving';

export type SyncMode = 'manual' | 'quick' | 'scheduled';

export type MergeDecision = 'keep_local' | 'keep_remote' | 'merged';

export interface ConflictEntry {
  path: string;
  localOid: string;
  remoteOid: string;
  baseOid: string;
  localContent: string;
  remoteContent: string;
  baseContent: string;
  decision: MergeDecision | null;
}

export interface RepoSyncState {
  phase: SyncPhase;
  progress: GitProgress | null;
  error: string | null;
  conflictQueue: ConflictEntry[];
  pendingRetryAt: number | null; // epoch ms
  lastSyncedAt: number | null;
}

export interface SyncSettings {
  mode: SyncMode;
  scheduledIntervalMinutes: number;
  quickSyncOnNetworkChange: boolean;
  quickSyncOnAppFocus: boolean;
}

export interface SyncState {
  // Per-repo sync state keyed by repoId
  repos: Record<string, RepoSyncState>;

  // Global settings
  settings: SyncSettings;

  // Active operation cancellation
  abortController: AbortController | null;

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Trigger a full sync cycle for a repo (fetch → merge analysis → stage → commit → push) */
  syncRepo(repo: GitRepository): Promise<void>;

  /** Abort the in-flight sync operation for a repo */
  abortSync(repoId: string): void;

  /** Record a user's merge decision for a conflict file */
  resolveConflict(repoId: string, path: string, decision: MergeDecision): Promise<void>;

  /** Commit staged conflict resolutions and continue pushing */
  commitResolutions(repo: GitRepository): Promise<void>;

  /** Update sync settings */
  updateSettings(partial: Partial<SyncSettings>): Promise<void>;

  /** Register background fetch task with the OS */
  registerBackgroundTask(): Promise<void>;

  /** Unregister background task (e.g., when disabled) */
  unregisterBackgroundTask(): Promise<void>;

  /** Called by the OS background task entry point */
  runBackgroundSync(): Promise<{ repos: number; changed: boolean }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKGROUND_TASK_NAME = 'Git2BackgroundSync';
const SYNC_SETTINGS_KEY = '@git2:sync_settings:v1';
const PENDING_RETRY_KEY = '@git2:sync_pending_retry:v1';

const RETRY_BACKOFF_MS = 30_000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createAbortController(): AbortController {
  return new AbortController();
}

async function getCredentialsForRepo(
  remoteUrl: string,
): Promise<CredentialRequest | undefined> {
  try {
    const url = new URL(remoteUrl);
    const host = url.hostname;
    const creds = useAuthStore.getState().getCredentials(host);
    if (!creds) return undefined;

    if (creds.type === 'https_token') {
      return { kind: 'userpass', username: creds.username, token: creds.token };
    }
    if (creds.type === 'ssh_key') {
      return { kind: 'sshKey', username: creds.username };
    }
    if (creds.type === 'github_oauth' || creds.type === 'gitlab_oauth' || creds.type === 'gitea_oauth') {
      return { kind: 'userpass', username: 'oauth', token: creds.accessToken };
    }
    return undefined;
  } catch {
    return undefined;
  }
}

async function checkOnline(): Promise<boolean> {
  const state = await NetInfo.fetch();
  return state.isConnected === true && state.isInternetReachable === true;
}

function isRetryableError(error: unknown): boolean {
  if (error instanceof GitOperationError) {
    return error.code === 'NETWORK_ERROR' || error.code === 'LOCK_BUSY';
  }
  return false;
}

// ─── Store ───────────────────────────────────────────────────────────────────

const defaultRepoState = (): RepoSyncState => ({
  phase: 'idle',
  progress: null,
  error: null,
  conflictQueue: [],
  pendingRetryAt: null,
  lastSyncedAt: null,
});

const defaultSettings = (): SyncSettings => ({
  mode: 'manual',
  scheduledIntervalMinutes: 15,
  quickSyncOnNetworkChange: true,
  quickSyncOnAppFocus: true,
});

export const useSyncStore = create<SyncState>((set, get) => ({
  repos: {},
  settings: defaultSettings(),
  abortController: null,

  // ── syncRepo ──────────────────────────────────────────────────────────────

  async syncRepo(repo) {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    const controller = createAbortController();
    set({ abortController: controller });

    const cred = await getCredentialsForRepo(repo.remoteUrl);
    // TODO: Wire Git2Client.onProgress when git2-rs exposes progress callbacks
    const _progress = (_p: GitProgress) => {
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), progress: _p },
        },
      }));
    };

    try {
      // ── Fetch ──────────────────────────────────────────────────────────────
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'fetching', error: null },
        },
      }));

      let fetchResult: FetchResult;
      try {
        fetchResult = await Git2Client.fetch(repo.localPath, 'origin', cred);
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
        if (!isRetryableError(err)) throw err;
        // offline — schedule retry and bail
        const retryAt = Date.now() + RETRY_BACKOFF_MS;
        set((state) => ({
          repos: {
            ...state.repos,
            [repo.id]: {
              ...state.repos[repo.id] ?? defaultRepoState(),
              phase: 'idle',
              pendingRetryAt: retryAt,
              error: (err as Error).message,
            },
          },
        }));
        await AsyncStorage.setItem(PENDING_RETRY_KEY, JSON.stringify({ repoId: repo.id, retryAt }));
        return;
      }

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Merge analysis ─────────────────────────────────────────────────────
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'merge_analysis' },
        },
      }));

      const statusResult = await Git2Client.status(repo.localPath);
      const conflictFiles = statusResult.data.entries
        .filter((e: StatusEntry) => e.isModified || e.isNew || e.isDeleted)
        .map((e: StatusEntry) => e.path);

      if (conflictFiles.length > 0) {
        // TODO: Run three-way merge analysis per file to populate conflictQueue
        // For now, collect all modified files as conflict entries
        const conflictQueue: ConflictEntry[] = [];
        for (const filePath of conflictFiles) {
          try {
            const diffResult = await Git2Client.diffCommit(repo.localPath, fetchResult.data.updatedRefs[0] ?? 'HEAD');
            const entry = diffResult.data.find((d) => d.path === filePath);
            if (entry) {
              conflictQueue.push({
                path: filePath,
                localOid: '',
                remoteOid: '',
                baseOid: '',
                localContent: '',
                remoteContent: entry.content,
                baseContent: '',
                decision: null,
              });
            }
          } catch {
            conflictQueue.push({
              path: filePath,
              localOid: '',
              remoteOid: '',
              baseOid: '',
              localContent: '',
              remoteContent: '',
              baseContent: '',
              decision: null,
            });
          }
        }

        set((state) => ({
          repos: {
            ...state.repos,
            [repo.id]: {
              ...state.repos[repo.id] ?? defaultRepoState(),
              phase: 'conflict_detected',
              conflictQueue,
            },
          },
        }));
        return; // User must resolve conflicts before continuing
      }

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Stage ──────────────────────────────────────────────────────────────
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'staging' },
        },
      }));

      const modifiedFiles = statusResult.data.entries
        .filter((e: StatusEntry) => e.isModified || e.isNew)
        .map((e: StatusEntry) => e.path);

      const stagedPaths: string[] = [];
      for (const filePath of modifiedFiles) {
        const stageResult: StageResult = await Git2Client.stage(repo.localPath, filePath);
        if (stageResult.data.staged) {
          stagedPaths.push(filePath);
        }
      }

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Commit ─────────────────────────────────────────────────────────────
      if (stagedPaths.length > 0) {
        set((state) => ({
          repos: {
            ...state.repos,
            [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'committing' },
          },
        }));

        await Git2Client.commit(
          repo.localPath,
          `Sync: ${stagedPaths.length} file(s) changed`,
          'GitNotēs',
          'app@gitnotes.dev',
        );
      }

      if (controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      // ── Push ──────────────────────────────────────────────────────────────
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'pushing' },
        },
      }));

      await Git2Client.push(repo.localPath, 'origin', `refs/heads/${repo.currentBranch}`, cred);

      // ── Done ───────────────────────────────────────────────────────────────
      const now = Date.now();
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: {
            ...state.repos[repo.id] ?? defaultRepoState(),
            phase: 'idle',
            progress: null,
            error: null,
            lastSyncedAt: now,
          },
        },
      }));
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        set((state) => ({
          repos: {
            ...state.repos,
            [repo.id]: { ...state.repos[repo.id] ?? defaultRepoState(), phase: 'idle', error: null },
          },
        }));
        return;
      }

      const msg = err instanceof Error ? err.message : String(err);
      set((state) => ({
        repos: {
          ...state.repos,
          [repo.id]: {
            ...state.repos[repo.id] ?? defaultRepoState(),
            phase: 'idle',
            error: msg,
          },
        },
      }));
      throw err;
    }
  },

  // ── abortSync ─────────────────────────────────────────────────────────────

  abortSync(repoId) {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set((state) => ({
      repos: {
        ...state.repos,
        [repoId]: { ...state.repos[repoId] ?? defaultRepoState(), phase: 'idle', error: null },
      },
    }));
  },

  // ── resolveConflict ────────────────────────────────────────────────────────

  async resolveConflict(repoId, path, decision) {
    set((state) => {
      const repoState = state.repos[repoId] ?? defaultRepoState();
      const conflictQueue = repoState.conflictQueue.map((entry) =>
        entry.path === path ? { ...entry, decision } : entry,
      );
      const allResolved = conflictQueue.every((e) => e.decision !== null);
      return {
        repos: {
          ...state.repos,
          [repoId]: {
            ...repoState,
            phase: allResolved ? 'conflict_staged' : 'conflict_detected',
            conflictQueue,
          },
        },
      };
    });
  },

  // ── commitResolutions ──────────────────────────────────────────────────────

  async commitResolutions(repo) {
    const repoState = get().repos[repo.id] ?? defaultRepoState();
    const cred = await getCredentialsForRepo(repo.remoteUrl);

    // Stage resolved files
    for (const entry of repoState.conflictQueue) {
      if (entry.decision === null) continue;
      if (entry.decision === 'keep_remote') {
        // Write remote content to file (simplified — actual impl would write to FS)
        await Git2Client.stage(repo.localPath, entry.path);
      } else if (entry.decision === 'keep_local') {
        await Git2Client.stage(repo.localPath, entry.path);
      } else {
        // merged — write merged content and stage
        await Git2Client.stage(repo.localPath, entry.path);
      }
    }

    // Commit
    await Git2Client.commit(
      repo.localPath,
      `Resolve conflicts in ${repoState.conflictQueue.length} file(s)`,
      'GitNotēs',
      'app@gitnotes.dev',
    );

    // Push
    await Git2Client.push(repo.localPath, 'origin', `refs/heads/${repo.currentBranch}`, cred);

    // Clear conflicts and return to idle
    set((state) => ({
      repos: {
        ...state.repos,
        [repo.id]: {
          ...state.repos[repo.id] ?? defaultRepoState(),
          phase: 'idle',
          conflictQueue: [],
          lastSyncedAt: Date.now(),
        },
      },
    }));
  },

  // ── updateSettings ─────────────────────────────────────────────────────────

  async updateSettings(partial) {
    const next = { ...get().settings, ...partial };
    await AsyncStorage.setItem(SYNC_SETTINGS_KEY, JSON.stringify(next));
    set({ settings: next });

    // Re-register background task if interval changed
    if (partial.scheduledIntervalMinutes !== undefined) {
      await get().unregisterBackgroundTask();
      if (next.mode === 'scheduled') {
        await get().registerBackgroundTask();
      }
    }
  },

  // ── registerBackgroundTask ────────────────────────────────────────────────

  async registerBackgroundTask() {
    const { settings } = get();
    if (settings.mode !== 'scheduled') return;

    TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
      try {
        const result = await get().runBackgroundSync();
        if (result.changed) {
          // TODO: Schedule local notification via NotificationService
        }
        return BackgroundTask.BackgroundTaskResult.Success;
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    });

    await BackgroundTask.registerTaskAsync(BACKGROUND_TASK_NAME, {
      minimumInterval: settings.scheduledIntervalMinutes * 60,
    });
  },

  // ── unregisterBackgroundTask ───────────────────────────────────────────────

  async unregisterBackgroundTask() {
    try {
      await TaskManager.unregisterTaskAsync(BACKGROUND_TASK_NAME);
    } catch {
      // Task may not have been registered — ignore
    }
  },

  // ── runBackgroundSync ─────────────────────────────────────────────────────

  async runBackgroundSync() {
    const online = await checkOnline();
    if (!online) return { repos: 0, changed: false };

    // TODO: Import and use repoStore to iterate all repos
    // For now, return placeholder — actual impl would pull all managed repos
    return { repos: 0, changed: false };
  },
}));
