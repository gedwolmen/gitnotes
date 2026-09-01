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
    throw new Error('SyncEngineService stub: not implemented');
  }

  static async clear(_repoPath: string): Promise<void> {}
}
