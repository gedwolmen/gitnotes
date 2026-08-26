/**
 * LegacyGitPurgeService — git2-rs migration husk
 *
 * This service permanently destroys all legacy isomorphic-git device data
 * at first launch of the git-free husk. It runs exactly once and exposes
 * no recovery, export, or undo UI.
 *
 * Per plan decision: owner explicitly selected permanent purge with no
 * compatibility escape hatch.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

const documentDirectory = FileSystem.documentDirectory ?? '';

// Storage keys to purge (from legacy removal manifest)
const LEGACY_STORAGE_KEYS = [
  '@gitnotes:sync_engine_modes',
  '@gitnotes:sync_queue_v1',
  '@gitnotes:delete_tombstones_v1',
  '@gitnotes:git_operation_registry',
  '@gitnotes:background_sync_enabled',
  '@gitnotes:sync_frequently_enabled',
  '@gitnotes:sync_interval_seconds',
  '@gitnotes:foreground_sync_paused',
  '@gitnotes:clone_migration_version',
  '@gitnotes:unpushed_commits_v1',
  '@gitnotes:delete_failures_v1',
] as const;

// Sentinel written after successful purge
const PURGE_SENTINEL = '@gitnotes:git2-rs-husk-purged:v1';

// Filesystem roots to purge (matches GitFsService.clonesRoot())
const docDir = documentDirectory;
const LEGACY_FS_ROOT = docDir
  ? docDir.endsWith('/')
    ? `${docDir}GitNotes/`
    : `${docDir}/GitNotes/`
  : null;

export interface PurgeResult {
  success: boolean;
  purgedKeys: string[];
  purgedPaths: string[];
  errors: string[];
  sentinelWritten: boolean;
}

class LegacyGitPurgeService {
  private running = false;

  /**
   * Execute the one-time legacy Git data purge.
   * Safe to call multiple times — returns immediately if already run.
   */
  async purgeIfNeeded(): Promise<PurgeResult> {
    // Fast path: already purged
    const existing = await AsyncStorage.getItem(PURGE_SENTINEL);
    if (existing === 'true') {
      return { success: true, purgedKeys: [], purgedPaths: [], errors: [], sentinelWritten: true };
    }

    if (this.running) {
      return { success: false, purgedKeys: [], purgedPaths: [], errors: ['Purge already in progress'], sentinelWritten: false };
    }

    this.running = true;
    const result: PurgeResult = {
      success: false,
      purgedKeys: [],
      purgedPaths: [],
      errors: [],
      sentinelWritten: false,
    };

    try {
      // 1. Purge AsyncStorage keys
      for (const key of LEGACY_STORAGE_KEYS) {
        try {
          await AsyncStorage.removeItem(key);
          result.purgedKeys.push(key);
        } catch (e) {
          result.errors.push(`AsyncStorage(${key}): ${e}`);
        }
      }

      // 2. Purge filesystem roots
      if (LEGACY_FS_ROOT) {
        try {
          const exists = await FileSystem.getInfoAsync(LEGACY_FS_ROOT);
          if (exists.exists) {
            await FileSystem.deleteAsync(LEGACY_FS_ROOT, { idempotent: true });
            result.purgedPaths.push(LEGACY_FS_ROOT);
          }
        } catch (e) {
          result.errors.push(`FS(${LEGACY_FS_ROOT}): ${e}`);
        }
      }

      // 3. Write sentinel — only this proves purge completed
      await AsyncStorage.setItem(PURGE_SENTINEL, 'true');
      result.sentinelWritten = true;

      result.success = result.errors.length === 0;
    } finally {
      this.running = false;
    }

    return result;
  }

  /**
   * Returns true if the purge has already completed successfully.
   */
  async isPurged(): Promise<boolean> {
    const v = await AsyncStorage.getItem(PURGE_SENTINEL);
    return v === 'true';
  }
}

export const legacyGitPurgeService = new LegacyGitPurgeService();
