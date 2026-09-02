export type SyncEngineMode = 'clone';

export class SyncEngineService {
  static async getMode(_repoPath: string): Promise<SyncEngineMode> {
    return 'clone';
  }

  static async setMode(_repoPath: string, _mode: SyncEngineMode): Promise<void> {}

  static async clear(_repoPath: string): Promise<void> {}
}
