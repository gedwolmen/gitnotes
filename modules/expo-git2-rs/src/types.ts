/**
 * Typed request/result/protocol types for native git2-rs operations.
 * Zod schemas for runtime validation.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { z } from 'zod';

// ─── Credential schemas (defined first because request schemas reference them) ─

export const CredentialRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('userpass'),
    username: z.string().min(1),
    token: z.string().optional(),
  }),
  z.object({
    kind: z.literal('sshKey'),
    username: z.string().min(1),
    publicKey: z.string().optional(),
  }),
]);
export type CredentialRequest = z.infer<typeof CredentialRequestSchema>;

// ─── Request schemas ─────────────────────────────────────────────────────────

export const GetVersionRequestSchema = z.object({ op: z.literal('getVersion') });
export type GetVersionRequest = z.infer<typeof GetVersionRequestSchema>;

export const CloneRequestSchema = z.object({
  op: z.literal('clone'),
  url: z.string().url(),
  path: z.string().min(1),
  cred: CredentialRequestSchema.optional(),
});
export type CloneRequest = z.infer<typeof CloneRequestSchema>;

export const FetchRequestSchema = z.object({
  op: z.literal('fetch'),
  path: z.string().min(1),
  remote: z.string().min(1),
  cred: CredentialRequestSchema.optional(),
});
export type FetchRequest = z.infer<typeof FetchRequestSchema>;

export const PushRequestSchema = z.object({
  op: z.literal('push'),
  path: z.string().min(1),
  remote: z.string().min(1),
  refspec: z.string().min(1),
  cred: CredentialRequestSchema.optional(),
});
export type PushRequest = z.infer<typeof PushRequestSchema>;

export const StageRequestSchema = z.object({
  op: z.literal('stage'),
  path: z.string().min(1),
  filePath: z.string().min(1),
});
export type StageRequest = z.infer<typeof StageRequestSchema>;

export const CommitRequestSchema = z.object({
  op: z.literal('commit'),
  path: z.string().min(1),
  message: z.string().min(1),
  authorName: z.string().min(1),
  authorEmail: z.string().email(),
});
export type CommitRequest = z.infer<typeof CommitRequestSchema>;

export const StatusRequestSchema = z.object({
  op: z.literal('status'),
  path: z.string().min(1),
});
export type StatusRequest = z.infer<typeof StatusRequestSchema>;

export const LogRequestSchema = z.object({
  op: z.literal('log'),
  path: z.string().min(1),
  maxCount: z.number().int().positive().optional(),
});
export type LogRequest = z.infer<typeof LogRequestSchema>;

export const DiffFileRequestSchema = z.object({
  op: z.literal('diffFile'),
  path: z.string().min(1),
  commitOid: z.string().min(1),
  filePath: z.string().min(1),
});
export type DiffFileRequest = z.infer<typeof DiffFileRequestSchema>;

export const DiffCommitRequestSchema = z.object({
  op: z.literal('diffCommit'),
  path: z.string().min(1),
  commitOid: z.string().min(1),
});
export type DiffCommitRequest = z.infer<typeof DiffCommitRequestSchema>;

export const ListBranchesRequestSchema = z.object({
  op: z.literal('listBranches'),
  path: z.string().min(1),
});
export type ListBranchesRequest = z.infer<typeof ListBranchesRequestSchema>;

export const CreateBranchRequestSchema = z.object({
  op: z.literal('createBranch'),
  path: z.string().min(1),
  branchName: z.string().min(1),
  commitOid: z.string().min(1),
});
export type CreateBranchRequest = z.infer<typeof CreateBranchRequestSchema>;

export const CheckoutBranchRequestSchema = z.object({
  op: z.literal('checkoutBranch'),
  path: z.string().min(1),
  branchName: z.string().min(1),
});
export type CheckoutBranchRequest = z.infer<typeof CheckoutBranchRequestSchema>;

export const DeleteBranchRequestSchema = z.object({
  op: z.literal('deleteBranch'),
  path: z.string().min(1),
  branchName: z.string().min(1),
});
export type DeleteBranchRequest = z.infer<typeof DeleteBranchRequestSchema>;

export const ListRemotesRequestSchema = z.object({
  op: z.literal('listRemotes'),
  path: z.string().min(1),
});
export type ListRemotesRequest = z.infer<typeof ListRemotesRequestSchema>;

export const AddRemoteRequestSchema = z.object({
  op: z.literal('addRemote'),
  path: z.string().min(1),
  name: z.string().min(1),
  url: z.string().url(),
});
export type AddRemoteRequest = z.infer<typeof AddRemoteRequestSchema>;

export const RemoveRemoteRequestSchema = z.object({
  op: z.literal('removeRemote'),
  path: z.string().min(1),
  name: z.string().min(1),
});
export type RemoveRemoteRequest = z.infer<typeof RemoveRemoteRequestSchema>;

// Union of all request types
export const GitOperationRequestSchema = z.discriminatedUnion('op', [
  GetVersionRequestSchema,
  CloneRequestSchema,
  FetchRequestSchema,
  PushRequestSchema,
  StageRequestSchema,
  CommitRequestSchema,
  StatusRequestSchema,
  LogRequestSchema,
  DiffFileRequestSchema,
  DiffCommitRequestSchema,
  ListBranchesRequestSchema,
  CreateBranchRequestSchema,
  CheckoutBranchRequestSchema,
  DeleteBranchRequestSchema,
  ListRemotesRequestSchema,
  AddRemoteRequestSchema,
  RemoveRemoteRequestSchema,
]);
export type GitOperationRequest = z.infer<typeof GitOperationRequestSchema>;

// ─── Error schema ────────────────────────────────────────────────────────────

export const GitErrorSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('repository_not_found'), path: z.string() }),
  z.object({ kind: z.literal('authentication_failed'), reason: z.string() }),
  z.object({ kind: z.literal('network_error'), reason: z.string() }),
  z.object({ kind: z.literal('merge_conflict'), conflicts: z.array(z.string()) }),
  z.object({ kind: z.literal('invalid_operation'), reason: z.string() }),
  z.object({ kind: z.literal('not_a_repository'), path: z.string() }),
  z.object({ kind: z.literal('ref_not_found'), refName: z.string() }),
  z.object({ kind: z.literal('path_not_found'), path: z.string() }),
  z.object({ kind: z.literal('nothing_to_commit') }),
  z.object({ kind: z.literal('cancelled') }),
  z.object({ kind: z.literal('lock_busy'), repoPath: z.string() }),
  z.object({ kind: z.literal('invalid_remote_url'), url: z.string() }),
  z.object({ kind: z.literal('detached_head') }),
  z.object({ kind: z.literal('branch_already_exists'), branchName: z.string() }),
  z.object({ kind: z.literal('remote_rejected'), reason: z.string() }),
  z.object({ kind: z.literal('internal_error'), reason: z.string() }),
]);
export type GitError = z.infer<typeof GitErrorSchema>;

// ─── Result schemas ─────────────────────────────────────────────────────────

export const GetVersionResultSchema = z.object({
  ok: z.literal(true),
  version: z.string(),
  protocol: z.string().optional(),
});
export type GetVersionResult = z.infer<typeof GetVersionResultSchema>;

export const CloneResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    path: z.string(),
    headOid: z.string(),
  }),
});
export type CloneResult = z.infer<typeof CloneResultSchema>;

export const FetchResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    remote: z.string(),
    updatedRefs: z.array(z.string()),
  }),
});
export type FetchResult = z.infer<typeof FetchResultSchema>;

export const PushResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    remote: z.string(),
    updatedRefs: z.array(z.string()),
  }),
});
export type PushResult = z.infer<typeof PushResultSchema>;

export const StageResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    path: z.string(),
    staged: z.boolean(),
  }),
});
export type StageResult = z.infer<typeof StageResultSchema>;

export const CommitResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    oid: z.string(),
    message: z.string(),
  }),
});
export type CommitResult = z.infer<typeof CommitResultSchema>;

export const StatusEntrySchema = z.object({
  path: z.string(),
  isNew: z.boolean(),
  isModified: z.boolean(),
  isDeleted: z.boolean(),
  isRenamed: z.boolean(),
  isIgnored: z.boolean(),
});
export type StatusEntry = z.infer<typeof StatusEntrySchema>;

export const StatusResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    repoPath: z.string(),
    entries: z.array(StatusEntrySchema),
    isClean: z.boolean(),
  }),
});
export type StatusResult = z.infer<typeof StatusResultSchema>;

export const LogEntrySchema = z.object({
  oid: z.string(),
  message: z.string(),
  authorName: z.string(),
  authorEmail: z.string(),
  timeSecs: z.number(),
  timeOffset: z.number(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const LogResultSchema = z.object({
  ok: z.literal(true),
  data: z.array(LogEntrySchema),
});
export type LogResult = z.infer<typeof LogResultSchema>;

export const DiffFileResultSchema = z.object({
  ok: z.literal(true),
  data: z.object({
    content: z.string(),
  }),
});
export type DiffFileResult = z.infer<typeof DiffFileResultSchema>;

export const DiffFileEntrySchema = z.object({
  path: z.string(),
  status: z.string(),
  content: z.string(),
});
export type DiffFileEntry = z.infer<typeof DiffFileEntrySchema>;

export const DiffCommitResultSchema = z.object({
  ok: z.literal(true),
  data: z.array(DiffFileEntrySchema),
});
export type DiffCommitResult = z.infer<typeof DiffCommitResultSchema>;

export const BranchEntrySchema = z.object({
  name: z.string(),
  oid: z.string().nullable(),
  isCurrent: z.boolean(),
  isRemote: z.boolean(),
});
export type BranchEntry = z.infer<typeof BranchEntrySchema>;

export const ListBranchesResultSchema = z.object({
  ok: z.literal(true),
  data: z.array(BranchEntrySchema),
});
export type ListBranchesResult = z.infer<typeof ListBranchesResultSchema>;

export const CreateBranchResultSchema = z.object({
  ok: z.literal(true),
  data: BranchEntrySchema,
});
export type CreateBranchResult = z.infer<typeof CreateBranchResultSchema>;

export const ListRemotesResultSchema = z.object({
  ok: z.literal(true),
  data: z.array(z.string()),
});
export type ListRemotesResult = z.infer<typeof ListRemotesResultSchema>;

// Union of all success result schemas
export const GitOperationResultSchema = z.discriminatedUnion('ok', [
  GetVersionResultSchema,
  CloneResultSchema,
  FetchResultSchema,
  PushResultSchema,
  StageResultSchema,
  CommitResultSchema,
  StatusResultSchema,
  LogResultSchema,
  DiffFileResultSchema,
  DiffCommitResultSchema,
  ListBranchesResultSchema,
  CreateBranchResultSchema,
  ListRemotesResultSchema,
]);
export type GitOperationResult = z.infer<typeof GitOperationResultSchema>;

// ─── Progress schema ─────────────────────────────────────────────────────────

export const GitProgressSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('cloneReceiving'), bytes: z.number(), total: z.number().nullable(), flavor: z.string().nullable().optional() }),
  z.object({ phase: z.literal('cloneResolving'), bytes: z.number(), total: z.number() }),
  z.object({ phase: z.literal('cloneCheckingOut'), current: z.number(), total: z.number() }),
  z.object({ phase: z.literal('cloneComplete'), path: z.string(), head: z.string() }),
  z.object({ phase: z.literal('fetchConnecting'), remote: z.string() }),
  z.object({ phase: z.literal('fetchReceivingRefs'), remote: z.string(), refs: z.array(z.string()) }),
  z.object({ phase: z.literal('fetchReceivingPack'), bytes: z.number(), total: z.number().nullable() }),
  z.object({ phase: z.literal('fetchComplete'), remote: z.string(), updated: z.array(z.string()) }),
  z.object({ phase: z.literal('pushCommunicating'), remote: z.string() }),
  z.object({ phase: z.literal('pushUpdatingRef'), refName: z.string(), src: z.string(), dst: z.string() }),
  z.object({ phase: z.literal('pushComplete'), remote: z.string(), updated: z.array(z.string()) }),
  z.object({ phase: z.literal('checkout'), current: z.number(), total: z.number() }),
  z.object({ phase: z.literal('mergeAnalysis'), branch: z.string(), analysis: z.string() }),
  z.object({ phase: z.literal('mergeConflicts'), files: z.array(z.string()) }),
]);
export type GitProgress = z.infer<typeof GitProgressSchema>;

// ─── Operation response (success or error) ───────────────────────────────────

export const GitOperationResponseSchema = z.discriminatedUnion('ok', [
  GitOperationResultSchema,
  z.object({
    ok: z.literal(false),
    error: GitErrorSchema,
  }),
]);
export type GitOperationResponse = z.infer<typeof GitOperationResponseSchema>;
