/**
 * expo-git2-rs — Native Git operations via git2-rs
 *
 * All operations are asynchronous and emit typed progress events.
 *
 * GPL-3.0 derivative of GitSync (https://github.com/ViscousPot/GitSync)
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

// Types
export type {
  GitOperationRequest,
  GitOperationResponse,
  GitProgress,
  GitError,
  CredentialRequest,
  GetVersionResult,
  CloneResult,
  FetchResult,
  PushResult,
  StageResult,
  CommitResult,
  StatusResult,
  StatusEntry,
  LogResult,
  LogEntry,
  DiffFileResult,
  DiffCommitResult,
  DiffFileEntry,
  BranchEntry,
  ListBranchesResult,
  CreateBranchResult,
  ListRemotesResult,
} from './types';

// Zod schemas
export {
  GitOperationRequestSchema,
  GitErrorSchema,
  GitProgressSchema,
} from './types';

// Client
export { Git2Client, type Git2ClientOptions, type ProgressCallback } from './Git2Client';

// Errors
export { NativeProtocolError, NativeInvocationError, GitOperationError } from './errors';
