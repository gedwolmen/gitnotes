// syncFailure stub - functionality to be implemented

export type SyncFailureKind =
  | 'authentication'
  | 'permission'
  | 'saml'
  | 'conflict'
  | 'not_found'
  | 'network'
  | 'server'
  | 'unknown';

export interface SyncFailureResult {
  kind: SyncFailureKind;
  message?: string;
}

export interface HttpErrorDetails {
  message?: string;
  status?: number;
  headers?: Record<string, string>;
}

export function extractHttpErrorDetails(error: unknown): HttpErrorDetails {
  if (typeof error === 'object' && error !== null) {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === 'string' ? e.message : undefined,
      status: typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : undefined,
      headers: typeof e.headers === 'object' && e.headers !== null ? e.headers as Record<string, string> : undefined,
    };
  }
  return { message: String(error) };
}

export function classifyGitHubSyncError(error: unknown, _syncStatus?: string | number): SyncFailureResult {
  return { kind: 'unknown', message: String(error) };
}

export function isRetryableFailure(failure: SyncFailureResult): boolean {
  return failure.kind === 'network' || failure.kind === 'server';
}

export function syncStatusForError(error: unknown): string | undefined {
  return undefined;
}