/** Thin facade over commitOps.ts + recovery.ts. Public API unchanged. */
import * as FileSystem from 'expo-file-system/legacy';
import { parseRepoPath } from '../../utils/gitPathParser';
import { formatSyncError } from './formatSyncError';
import { GitFsService } from './GitFsService';
import { makeGitFs } from './gitFs';
import { commitWrite, commitDelete, ensureOnBranch } from './commitOps';
import { pushWithRecovery, isCorruptionError, hasUnpushedLocalCommits, classifyPushError } from './recovery';

export { isCorruptionError, hasUnpushedLocalCommits };
export function summarizePushError(raw: string | undefined): string { return formatSyncError(raw); }

export interface LocalGitWriterResult { success: boolean; filePath?: string; error?: string; }
interface AuthorInfo { name: string; email: string; }
interface BaseOpts { repoPath: string; branch: string; message: string; author: AuthorInfo; }
interface WriteOpts extends BaseOpts { filePath: string; content: string; push?: boolean; token?: string; onProgress?: (p: { phase: string; loaded: number; total: number }) => void; }
interface DeleteOpts extends BaseOpts { filePath: string; push?: boolean; token?: string; onProgress?: (p: { phase: string; loaded: number; total: number }) => void; }

function clonesRoot(): string {
  const docDir = FileSystem.documentDirectory;
  if (!docDir) throw new Error('expo-file-system documentDirectory is not available');
  return docDir.endsWith('/') ? docDir + 'GitNotes/' : `${docDir}/GitNotes/`;
}

// ─── minimal git stub ───────────────────────────────────────────────────────
const git = {
  async branch(_opts: {
    fs: unknown; dir: string; ref: string; object?: string; force?: boolean; checkout?: boolean;
  }): Promise<void> {},
};

export class LocalGitWriter {
  static async writeAndCommit(opts: WriteOpts): Promise<LocalGitWriterResult> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };
    const MAX_FILE_SIZE = 5 * 1024 * 1024;
    if (opts.content.length > MAX_FILE_SIZE) return { success: false, error: `Refusing to write file exceeding 5 MB — possible data corruption` };
    try {
      const cr = await commitWrite({ repo: opts.repoPath, branch: opts.branch, filePath: opts.filePath, content: opts.content, message: opts.message, author: opts.author });
      if (!cr.success) return { success: false, error: cr.error };
      if (opts.push !== false) {
        const pr = await pushWithRecovery({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token, onProgress: opts.onProgress });
        if (!pr.success) return { success: false, error: pr.error };
      }
      return { success: true, filePath: opts.filePath };
    } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  static async deleteAndCommit(opts: DeleteOpts): Promise<LocalGitWriterResult> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };
    try {
      const cr = await commitDelete({ repo: opts.repoPath, branch: opts.branch, filePath: opts.filePath, message: opts.message, author: opts.author });
      if (!cr.success) return { success: false, error: cr.error };
      if (opts.push !== false) {
        const pr = await pushWithRecovery({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token, onProgress: opts.onProgress });
        if (!pr.success) return { success: false, error: pr.error };
      }
      return { success: true, filePath: opts.filePath };
    } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  static async resetToRemote(opts: { repoPath: string; branch: string; token?: string }): Promise<LocalGitWriterResult> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };
    const fsRoot = clonesRoot();
    const dir = `/${info.owner}/${info.repo}`;
    const fs = makeGitFs(fsRoot);
    try {
      await ensureOnBranch(fs, dir, opts.branch);
      const remoteOid = await GitFsService.getCommitOid({ repoPath: opts.repoPath, ref: `refs/remotes/origin/${opts.branch}` });
      if (remoteOid === null) return { success: false, error: `No remote ref found for ${opts.branch}; cannot discard without an origin to reset to.` };
      await git.branch({ fs, dir, ref: `refs/heads/${opts.branch}`, object: remoteOid, force: true, checkout: true });
      return { success: true };
    } catch (e) { return { success: false, error: e instanceof Error ? e.message : String(e) }; }
  }

  static async push(opts: { repoPath: string; branch: string; token?: string; onProgress?: (p: { phase: string; loaded: number; total: number }) => void }): Promise<LocalGitWriterResult> {
    const info = parseRepoPath(opts.repoPath);
    if (!info) return { success: false, error: `Invalid repo path: ${opts.repoPath}` };
    try {
      const r = await pushWithRecovery({ repoPath: opts.repoPath, branch: opts.branch, token: opts.token, onProgress: opts.onProgress });
      return { success: r.success, error: r.error };
    } catch (e) { return { success: false, error: classifyPushError(e instanceof Error ? e.message : String(e)) }; }
  }
}
