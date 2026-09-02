/**
 * Stub for deleted NoteSyncQueueService.
 * TODO: Migrate callers to use the new sync architecture.
 */

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

export class NoteSyncQueueService {
  static async enqueueNoteUpsert(
    params: {
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
    noteId?: string,
  ): Promise<void> {}

  static async enqueueNoteDelete(params: NoteDeleteParams): Promise<void> {}

  static async enqueueNoteDeletes(apiParams: NoteDeleteParams[]): Promise<void> {}

  static async drain(): Promise<void> {}

  static async getAll(): Promise<QueuedMutation[]> {
    return [];
  }

  static async isTombstoned(repoPath: string, branch: string, path: string): Promise<boolean> {
    return false;
  }

  static async pendingCount(): Promise<number> {
    return 0;
  }

  static subscribe(_callback: () => void): () => void {
    return () => {};
  }

  static onDroppedMutation(_callback: (event: DroppedMutationEvent) => void): () => void {
    return () => {};
  }

  static onMutationSucceeded(_callback: (event: MutationSucceededEvent) => void): () => void {
    return () => {};
  }

  static async purgeForRepo(_repoPath: string): Promise<void> {}
}
