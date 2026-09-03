import * as GitEngine from '@/services/git/engine/GitEngine';
import type { GitRepository } from '@/services/GitService';
import type { Author } from '@/services/git/engine/GitEngine';

export interface RepoOpOutcome {
  repoId: string;
  repoPath: string;
  repoName: string;
  ok: boolean;
  /** Number of files newly staged (stageAll) or commits pushed (commitAndPushAll). */
  actedCount: number;
  error?: string;
}

export interface AggregateOpOutcome {
  outcomes: RepoOpOutcome[];
  totalActed: number;
  failures: RepoOpOutcome[];
  /** True if every repo completed without an error. */
  ok: boolean;
}

/**
 * For every repo in `repos`:
 *   1. Read `statuses()`.
 *   2. Stage any file whose `staged` flag is false AND `status !== 'Unmodified'`.
 *   3. Skip the repo if it has nothing to stage.
 *
 * Repos are processed in parallel. Errors are captured per-repo; a failure on
 * one repo does not abort the others.
 */
export async function stageAllPending(
  repos: readonly GitRepository[],
): Promise<AggregateOpOutcome> {
  const outcomes = await Promise.all(
    repos.map(async (repo): Promise<RepoOpOutcome> => {
      try {
        const files = await GitEngine.statuses(repo.path);
        const toStage = files
          .filter((file) => !file.staged && file.status !== 'Unmodified')
          .map((file) => file.path);
        if (toStage.length === 0) {
          return {
            repoId: repo.id,
            repoPath: repo.path,
            repoName: repo.name,
            ok: true,
            actedCount: 0,
          };
        }
        await GitEngine.stage(repo.path, toStage);
        return {
          repoId: repo.id,
          repoPath: repo.path,
          repoName: repo.name,
          ok: true,
          actedCount: toStage.length,
        };
      } catch (err) {
        return {
          repoId: repo.id,
          repoPath: repo.path,
          repoName: repo.name,
          ok: false,
          actedCount: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return summarize(outcomes);
}

/**
 * For every repo in `repos`:
 *   1. If `staged > 0` → `commit(message, author)`.
 *   2. If the commit succeeded AND `ahead > 0` after commit → `pushWithIntegrate`.
 *
 * Repos are processed in parallel. Errors are captured per-repo; a failure on
 * one repo does not abort the others.
 */
export async function commitAndPushAll(
  repos: readonly GitRepository[],
  message: string,
  author: Author,
): Promise<AggregateOpOutcome> {
  const outcomes = await Promise.all(
    repos.map(async (repo): Promise<RepoOpOutcome> => {
      try {
        const files = await GitEngine.statuses(repo.path);
        const stagedCount = files.filter((file) => file.staged).length;
        if (stagedCount === 0) {
          return {
            repoId: repo.id,
            repoPath: repo.path,
            repoName: repo.name,
            ok: true,
            actedCount: 0,
          };
        }
        await GitEngine.commit(repo.path, message, author);
        const status = await GitEngine.status(repo.id, repo.path).catch(() => null);
        if (status && status.ahead > 0) {
          const result = await GitEngine.pushWithIntegrate(repo.path, 'origin', repo.id);
          if (result.kind === 'Conflicts' || result.conflicts?.length > 0) {
            return {
              repoId: repo.id,
              repoPath: repo.path,
              repoName: repo.name,
              ok: false,
              actedCount: 1,
              error: `Push conflicts: ${result.conflicts.map((c) => c.path).join(', ')}`,
            };
          }
          return {
            repoId: repo.id,
            repoPath: repo.path,
            repoName: repo.name,
            ok: result.pushed > 0,
            actedCount: result.pushed,
            error: result.pushed > 0 ? undefined : result.message,
          };
        }
        return {
          repoId: repo.id,
          repoPath: repo.path,
          repoName: repo.name,
          ok: true,
          actedCount: 1,
        };
      } catch (err) {
        return {
          repoId: repo.id,
          repoPath: repo.path,
          repoName: repo.name,
          ok: false,
          actedCount: 0,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }),
  );
  return summarize(outcomes);
}

function summarize(outcomes: RepoOpOutcome[]): AggregateOpOutcome {
  return {
    outcomes,
    totalActed: outcomes.reduce((sum, o) => sum + o.actedCount, 0),
    failures: outcomes.filter((o) => !o.ok),
    ok: outcomes.every((o) => o.ok),
  };
}