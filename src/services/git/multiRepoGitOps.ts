import * as GitEngine from '@/services/git/engine/GitEngine';
import { GitFsService } from './GitFsService';
import { GitSyncGate } from './GitSyncGate';
import { gitOperationRegistry } from '@/stores/gitOperationStore';
import type { GitRepository } from '@/services/GitService';
import type { Author } from '@/services/git/engine/GitEngine';
import { classifyPushError, type PushErrorKind } from '@/components/git/pushErrors';
import { RepositoryAccessPolicyService, requireRepoSelected, requireWriteVerified } from '../RepositoryAccessPolicyService';
import { AccountStorage } from '../AccountStorage';
import type { CanonicalRepoId } from './contracts';

export type { PushErrorKind };

async function buildCanonicalRepoId(repo: GitRepository): Promise<CanonicalRepoId | null> {
  const pathParts = repo.path.split('/');
  if (pathParts.length !== 2 || !pathParts[0] || !pathParts[1]) {
    return null;
  }
  const [owner, repoName] = pathParts;

  let instanceBaseUrl: string | null = null;
  if (repo.hostId) {
    const connection = await AccountStorage.getHostConnection(repo.hostId);
    instanceBaseUrl = connection?.instanceBaseUrl ?? null;
  }

  return RepositoryAccessPolicyService.makeCanonicalRepoId(
    repo.provider ?? 'github',
    instanceBaseUrl,
    owner,
    repoName,
  );
}

function resolveHostId(repo: GitRepository): string {
  if (repo.hostId) return repo.hostId;
  return `default:${repo.provider ?? 'github'}:default`;
}

async function enforceSelectionForRepo(repo: GitRepository): Promise<void> {
  const canonicalRepoId = await buildCanonicalRepoId(repo);
  if (!canonicalRepoId) {
    throw new Error(`Cannot build canonical repo ID for ${repo.path}`);
  }
  await requireRepoSelected(resolveHostId(repo), canonicalRepoId);
}

async function enforceWriteVerificationForRepo(repo: GitRepository): Promise<void> {
  const canonicalRepoId = await buildCanonicalRepoId(repo);
  if (!canonicalRepoId) {
    throw new Error(`Cannot build canonical repo ID for ${repo.path}`);
  }
  await requireWriteVerified(resolveHostId(repo), canonicalRepoId);
}

export interface RepoOpOutcome {
  repoId: string;
  repoPath: string;
  repoName: string;
  ok: boolean;
  actedCount: number;
  error?: string;
  /** Push-specific failure kind, present when ok === false and the op was a push. */
  failureKind?: PushErrorKind;
}

export interface AggregateOpOutcome {
  outcomes: RepoOpOutcome[];
  totalActed: number;
  failures: RepoOpOutcome[];
  ok: boolean;
}

export async function stageAllPending(
  repos: readonly GitRepository[],
): Promise<AggregateOpOutcome> {
  await RepositoryAccessPolicyService.initialize();
  const outcomes = await Promise.all(
    repos.map(async (repo): Promise<RepoOpOutcome> => {
      try {
        await enforceSelectionForRepo(repo);
        const localPath = GitFsService.workingTreeUri({ repoPath: repo.path });
        const files = await GitEngine.statuses(localPath);
        const toStage = files
          .filter((file) => !file.staged && file.status !== 'Unmodified')
          .map((file) => file.path);
        if (toStage.length === 0) {
          return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: true, actedCount: 0 };
        }
        await GitEngine.stage(localPath, toStage);
        return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: true, actedCount: toStage.length };
      } catch (err) {
        return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return summarize(outcomes);
}

export async function commitAll(
  repos: readonly GitRepository[],
  message: string,
  author: Author,
): Promise<AggregateOpOutcome> {
  await RepositoryAccessPolicyService.initialize();
  const outcomes = await Promise.all(
    repos.map(async (repo): Promise<RepoOpOutcome> => {
      try {
        await enforceSelectionForRepo(repo);
        const localPath = GitFsService.workingTreeUri({ repoPath: repo.path });
        const files = await GitEngine.statuses(localPath);
        const stagedCount = files.filter((file) => file.staged).length;
        if (stagedCount === 0) {
          return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: true, actedCount: 0 };
        }
        await GitEngine.commit(localPath, message, author);
        return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: true, actedCount: 1 };
      } catch (err) {
        return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return summarize(outcomes);
}

export async function pushAll(
  repos: readonly GitRepository[],
): Promise<AggregateOpOutcome> {
  await RepositoryAccessPolicyService.initialize();
  const outcomes = await Promise.all(
    repos.map(async (repo): Promise<RepoOpOutcome> => {
      try {
        await enforceWriteVerificationForRepo(repo);
        const localPath = GitFsService.workingTreeUri({ repoPath: repo.path });
        const status = await GitEngine.status(repo.id, localPath).catch(() => null);
        if (!status || status.ahead <= 0) {
          return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: true, actedCount: 0 };
        }
        const preflight = await GitSyncGate.capturePreflight(repo.id, localPath);
        const headOid = preflight?.headOid ?? '';
        GitSyncGate.markPushActive(repo.id, status.currentBranch ?? undefined, headOid);
        const registryOpId = gitOperationRegistry.begin({
          kind: 'push',
          repo: repo.id,
          branch: status.currentBranch,
          entityIds: [],
          attempts: 0,
          status: 'running',
        });
        try {
          const result = await GitEngine.pushWithIntegrate(localPath, 'origin', repo.id);
          if (result.kind === 'Conflicts' || (result.conflicts?.length ?? 0) > 0) {
            gitOperationRegistry.fail(registryOpId, `Push conflicts: ${(result.conflicts ?? []).map((c) => c.path).join(', ')}`);
            const conflictError = new Error(`Push conflicts: ${(result.conflicts ?? []).map((c) => c.path).join(', ')}`);
            return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: conflictError.message, failureKind: 'rejected' };
          }
          const postflightResult = await GitSyncGate.verifyPostflight(preflight!, registryOpId);
          if (!postflightResult.ok) {
            const reasonError = new Error(`Branch state changed during push (${postflightResult.reason})`);
            const failure = classifyPushError(reasonError);
            return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: failure.message, failureKind: failure.kind };
          }
          gitOperationRegistry.succeed(registryOpId);
          return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: result.pushed > 0, actedCount: result.pushed, error: result.pushed > 0 ? undefined : result.message };
        } catch (err) {
          gitOperationRegistry.fail(registryOpId, err instanceof Error ? err.message : String(err));
          const failure = classifyPushError(err);
          return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: failure.message, failureKind: failure.kind };
        } finally {
          GitSyncGate.clearPushActive(repo.id, status.currentBranch ?? undefined);
          if (preflight) GitSyncGate.clearPreflight(repo.id);
        }
      } catch (err) {
        GitSyncGate.releasePushMarker(repo.id);
        return { repoId: repo.id, repoPath: repo.path, repoName: repo.name, ok: false, actedCount: 0, error: err instanceof Error ? err.message : String(err) };
      }
    }),
  );
  return summarize(outcomes);
}

/**
 * Convenience: commit + push in one call. Runs commitAll first; if a repo
 * fails to commit, the matching push is skipped. Then pushAll runs across
 * all repos. Returns the combined aggregate (sums of actedCount from each
 * phase; failures from either phase land in `failures`).
 */
export async function commitAndPushAll(
  repos: readonly GitRepository[],
  message: string,
  author: Author,
): Promise<AggregateOpOutcome> {
  await RepositoryAccessPolicyService.initialize();
  const commitResult = await commitAll(repos, message, author);
  const pushResult = await pushAll(repos);
  return {
    outcomes: [...commitResult.outcomes, ...pushResult.outcomes],
    totalActed: commitResult.totalActed + pushResult.totalActed,
    failures: [...commitResult.failures, ...pushResult.failures],
    ok: commitResult.ok && pushResult.ok,
  };
}

function summarize(outcomes: RepoOpOutcome[]): AggregateOpOutcome {
  return {
    outcomes,
    totalActed: outcomes.reduce((sum, o) => sum + o.actedCount, 0),
    failures: outcomes.filter((o) => !o.ok),
    ok: outcomes.every((o) => o.ok),
  };
}