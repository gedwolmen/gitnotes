/**
 * Stub implementations for deleted sync services.
 * These services are no-ops as the sync architecture has evolved.
 */

// SyncEngineService stubs
export type SyncEngineMode = 'clone';

export const SyncEngineService = {
  async getMode(_repoPath: string): Promise<SyncEngineMode> {
    return 'clone';
  },
  async setMode(_repoPath: string, _mode: SyncEngineMode): Promise<void> {},
  async clear(_repoPath: string): Promise<void> {},
};

// NoteSyncQueueService stubs
export interface NoteDeleteParams {
  repo: string;
  branch?: string;
  filePath: string;
  title?: string;
  accountId?: string;
  localNoteId?: string;
}

export interface QueuedMutation {
  id: string;
  type: string;
  params: {
    repo: string;
    branch?: string;
    filePath?: string;
    localNoteId?: string;
    [key: string]: unknown;
  };
  createdAt: number;
  lastError?: string;
  attempts?: number;
  localNoteId?: string;
}

export interface MutationSucceededEvent {
  mutation: QueuedMutation;
  result: unknown;
}

export interface DroppedMutationEvent {
  mutation: QueuedMutation;
  error?: string;
  reason?: string;
}

export const NoteSyncQueueService = {
  async enqueueNoteUpsert(
    _params: {
      repo: string;
      branch?: string;
      filePath?: string;
      title?: string;
      content?: string;
      format?: string;
      tags?: string[];
      accountId?: string | undefined;
      color?: string | null | undefined;
    },
    _noteId?: string,
  ): Promise<void> {},

  async enqueueNoteDelete(_params: NoteDeleteParams): Promise<void> {},
  async enqueueNoteDeletes(_params: NoteDeleteParams[]): Promise<void> {},
  async drain(): Promise<void> {},
  async getAll(): Promise<QueuedMutation[]> {
    return [];
  },
  async isTombstoned(
    _repoPath: string,
    _branch: string,
    _path: string,
  ): Promise<boolean> {
    return false;
  },
  async pendingCount(): Promise<number> {
    return 0;
  },
  subscribe(_callback: () => void): () => void {
    return () => {};
  },
  onDroppedMutation(
    _callback: (event: DroppedMutationEvent) => void,
  ): () => void {
    return () => {};
  },
  onMutationSucceeded(
    _callback: (event: MutationSucceededEvent) => void,
  ): () => void {
    return () => {};
  },
  async purgeForRepo(_repoPath: string): Promise<void> {},
};

// CloneSyncService stubs
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

export const CloneSyncService = {
  async save(_params: CloneSyncServiceSaveParams): Promise<SaveResult> {
    return { success: true };
  },
};
