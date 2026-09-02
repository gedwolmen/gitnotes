/**
 * Stub for deleted SyncEngineService.
 * TODO: Migrate callers to use the new sync architecture.
 */

export type SyncEngineMode = 'clone' | 'api';

export class SyncEngineService {
  static async getMode(_repoPath: string): Promise<SyncEngineMode> {
    return 'clone';
  }

  static async setMode(_repoPath: string, _mode: SyncEngineMode): Promise<void> {
    // No-op stub: sync mode is managed by the native GitEngine
  }

  static async clear(_repoPath: string): Promise<void> {}
}
