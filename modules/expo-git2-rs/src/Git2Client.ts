/**
 * Git2Client — typed facade for native git2-rs operations.
 *
 * All methods are asynchronous. Results are discriminated union types.
 * Progress events are throttled at 250ms intervals.
 *
 * Uses Expo native module TurboModule bridge for iOS/Android.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { NativeModules } from 'react-native';
import type {
  GitOperationRequest,
  GitOperationResponse,
  GitProgress,
  GetVersionResult,
  CloneResult,
  FetchResult,
  PushResult,
  StageResult,
  CommitResult,
  StatusResult,
  LogResult,
  DiffFileResult,
  DiffCommitResult,
  ListBranchesResult,
  CreateBranchResult,
  ListRemotesResult,
  GitError,
} from './types';
import {
  GitOperationResponseSchema,
  GitOperationRequestSchema,
  GitProgressSchema,
} from './types';
import {
  NativeProtocolError,
  GitOperationError,
} from './errors';

const { ExpoGit2RsModule } = NativeModules;

function validateResponse(raw: unknown): GitOperationResponse {
  const result = GitOperationResponseSchema.safeParse(raw);
  if (!result.success) {
    throw new NativeProtocolError(
      `Invalid response from native: ${result.error.message}`,
    );
  }
  return result.data;
}

export type ProgressCallback = (progress: GitProgress) => void;

export interface Git2ClientOptions {
  onProgress?: ProgressCallback;
}

export interface Git2Client {
  getVersion(): Promise<GetVersionResult>;
  clone(url: string, path: string, cred?: CredentialRequest): Promise<CloneResult>;
  fetch(path: string, remote: string, cred?: CredentialRequest): Promise<FetchResult>;
  push(path: string, remote: string, refspec: string, cred?: CredentialRequest): Promise<PushResult>;
  stage(path: string, filePath: string): Promise<StageResult>;
  commit(path: string, message: string, authorName: string, authorEmail: string): Promise<CommitResult>;
  status(path: string): Promise<StatusResult>;
  log(path: string, maxCount?: number): Promise<LogResult>;
  diffFile(path: string, commitOid: string, filePath: string): Promise<DiffFileResult>;
  diffCommit(path: string, commitOid: string): Promise<DiffCommitResult>;
  listBranches(path: string): Promise<ListBranchesResult>;
  createBranch(path: string, branchName: string, commitOid: string): Promise<CreateBranchResult>;
  checkoutBranch(path: string, branchName: string): Promise<void>;
  deleteBranch(path: string, branchName: string): Promise<void>;
  listRemotes(path: string): Promise<ListRemotesResult>;
  addRemote(path: string, name: string, url: string): Promise<void>;
  removeRemote(path: string, name: string): Promise<void>;
}

export interface CredentialRequest {
  kind: 'userpass' | 'sshKey';
  username: string;
  token?: string;
}

function mapError(error: GitError): Error {
  switch (error.kind) {
    case 'repository_not_found':
      return new GitOperationError(`Repository not found: ${error.path}`, 'REPOSITORY_NOT_FOUND');
    case 'authentication_failed':
      return new GitOperationError(`Authentication failed: ${error.reason}`, 'AUTH_FAILED');
    case 'network_error':
      return new GitOperationError(`Network error: ${error.reason}`, 'NETWORK_ERROR');
    case 'merge_conflict':
      return new GitOperationError(`Merge conflict: ${error.conflicts.join(', ')}`, 'MERGE_CONFLICT');
    case 'cancelled':
      return new GitOperationError('Operation cancelled', 'CANCELLED');
    case 'lock_busy':
      return new GitOperationError(`Repository busy: ${error.repoPath}`, 'LOCK_BUSY');
    default:
      return new GitOperationError(
        (error as any).reason ?? JSON.stringify(error),
        (error as any).kind ?? 'UNKNOWN',
      );
  }
}

async function execute(req: GitOperationRequest): Promise<GitOperationResponse> {
  const valid = GitOperationRequestSchema.safeParse(req);
  if (!valid.success) {
    throw new NativeProtocolError(`Invalid request: ${valid.error.message}`);
  }

  // The native module expects a JSON string
  const json = JSON.stringify(req);
  const raw = await ExpoGit2RsModule.execute(json);
  return validateResponse(raw);
}

export const Git2Client: Git2Client = {
  async getVersion() {
    const resp = await execute({ op: 'getVersion' });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as GetVersionResult;
  },

  async clone(url, path, cred) {
    const resp = await execute({ op: 'clone', url, path, cred });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as CloneResult;
  },

  async fetch(path, remote, cred) {
    const resp = await execute({ op: 'fetch', path, remote, cred });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as FetchResult;
  },

  async push(path, remote, refspec, cred) {
    const resp = await execute({ op: 'push', path, remote, refspec, cred });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as PushResult;
  },

  async stage(path, filePath) {
    const resp = await execute({ op: 'stage', path, filePath });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as StageResult;
  },

  async commit(path, message, authorName, authorEmail) {
    const resp = await execute({ op: 'commit', path, message, authorName, authorEmail });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as CommitResult;
  },

  async status(path) {
    const resp = await execute({ op: 'status', path });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as StatusResult;
  },

  async log(path, maxCount) {
    const resp = await execute({ op: 'log', path, maxCount });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as LogResult;
  },

  async diffFile(path, commitOid, filePath) {
    const resp = await execute({ op: 'diffFile', path, commitOid, filePath });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as DiffFileResult;
  },

  async diffCommit(path, commitOid) {
    const resp = await execute({ op: 'diffCommit', path, commitOid });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as DiffCommitResult;
  },

  async listBranches(path) {
    const resp = await execute({ op: 'listBranches', path });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as ListBranchesResult;
  },

  async createBranch(path, branchName, commitOid) {
    const resp = await execute({ op: 'createBranch', path, branchName, commitOid });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as CreateBranchResult;
  },

  async checkoutBranch(path, branchName) {
    const resp = await execute({ op: 'checkoutBranch', path, branchName });
    if (resp.ok === false) throw mapError(resp.error);
    return undefined as void;
  },

  async deleteBranch(path, branchName) {
    const resp = await execute({ op: 'deleteBranch', path, branchName });
    if (resp.ok === false) throw mapError(resp.error);
    return undefined as void;
  },

  async listRemotes(path) {
    const resp = await execute({ op: 'listRemotes', path });
    if (resp.ok === false) throw mapError(resp.error);
    return resp as ListRemotesResult;
  },

  async addRemote(path, name, url) {
    const resp = await execute({ op: 'addRemote', path, name, url });
    if (resp.ok === false) throw mapError(resp.error);
    return undefined as void;
  },

  async removeRemote(path, name) {
    const resp = await execute({ op: 'removeRemote', path, name });
    if (resp.ok === false) throw mapError(resp.error);
    return undefined as void;
  },
};
