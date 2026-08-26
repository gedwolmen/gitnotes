export interface SyncResult {
  ok: boolean;
  error?: string;
}

export async function triggerManualSync(_repoId: string): Promise<SyncResult> {
  // Legacy manual sync — replaced by git2-rs sync
  return { ok: true };
}

export async function syncNow(_repoId?: string): Promise<SyncResult> {
  // Legacy manual sync — replaced by git2-rs sync
  return { ok: true };
}
