/**
 * Stub for deleted CloneSyncService.
 * TODO: Migrate callers to use the new sync architecture.
 */

export interface SaveResult {
  success: boolean;
  error?: string;
}

export interface CloneSyncServiceSaveParams {
  repoPath: string;
  branch: string;
  filePath: string;
  content?: string | undefined;
  message: string;
  intent: 'upsert' | 'delete';
}

export class CloneSyncService {
  static async save(params: CloneSyncServiceSaveParams): Promise<SaveResult> {
    return { success: true };
  }
}
