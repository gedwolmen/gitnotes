export type ConflictKind =
  | 'local-only'
  | 'remote-only'
  | 'both-changed-same'
  | 'both-changed-different'
  | 'local-deleted-remote-modified'
  | 'local-modified-remote-deleted'
  | 'both-renamed';

export type FileFormat = 'text' | 'json' | 'binary';

export interface FileConflict {
  path: string;
  kind: ConflictKind;
  format: FileFormat;
  localContent: string | null;
  remoteContent: string | null;
  baseContent: string | null;
  mergedContent: string | null;
  localSha: string | null;
  remoteSha: string | null;
  autoResolved: boolean;
}

export interface ConflictSet {
  repoPath: string;
  branch: string;
  localRef: string;
  remoteRef: string;
  mergeBaseRef: string;
  files: FileConflict[];
  detectedAt: number;
}
