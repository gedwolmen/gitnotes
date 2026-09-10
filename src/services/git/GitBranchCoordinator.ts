/**
 * GitBranchCoordinator.ts
 *
 * State machine for checkout safety in Git-tab.
 *
 * States:
 *   - idle: no checkout or mutation in progress
 *   - checkout-running: a branch checkout is in progress
 *   - mutation-running: a git mutation (stage, commit, etc.) is in progress
 *   - failed: a checkout or mutation failed; requires explicit recovery
 *
 * Key invariants:
 *   - Checkout acquires the repo cycle gate BEFORE checking working tree status
 *   - Any staged or modified (non-Unmodified) file blocks checkout
 *   - Mutations are rejected/queued while checkout-running
 *   - Checkout failure leaves branch and working tree unchanged
 *   - Watchdog recovers from leaked state after timeout
 */

import { gitOperationRegistry, type GitOpKind } from '@/stores/gitOperationStore';
import { GitSyncGate } from './GitSyncGate';
import { emitGitContentRefresh } from '@/hooks/useGitRefreshEvent';
import { invalidateCache } from './branchResolver';
import { setActiveBranchAfterCheckout } from './activeBranchStore';
import * as GitEngine from './engine/GitEngine';
import type { FileStatus } from './engine/GitEngine';

export type CoordinatorState = 'idle' | 'checkout-running' | 'mutation-running' | 'failed';

/** Extended with conflicted flag from native module */
interface WorkingTreeFile extends FileStatus {
  conflicted?: boolean;
}

const CHECKOUT_WATCHDOG_MS = 10 * 60 * 1_000;

type StateChangeCallback = (state: CoordinatorState) => void;

class GitBranchCoordinatorClass {
  private state: CoordinatorState = 'idle';

  private stateSubscribers = new Set<StateChangeCallback>();

  private checkoutWatchdog: ReturnType<typeof setTimeout> | null = null;

  private currentRepoPath: string | null = null;

  private currentBranchName: string | null = null;

  private mutationStartedAt: number | null = null;

  private checkoutResolve: (() => void) | null = null;

  private checkoutReject: ((err: string) => void) | null = null;

  private static instance: GitBranchCoordinatorClass | null = null;

  static getInstance(): GitBranchCoordinatorClass {
    if (!GitBranchCoordinatorClass.instance) {
      GitBranchCoordinatorClass.instance = new GitBranchCoordinatorClass();
    }
    return GitBranchCoordinatorClass.instance;
  }

  getInstance(): GitBranchCoordinatorClass {
    return this;
  }

  getState(): CoordinatorState {
    return this.state;
  }

  onStateChange(callback: StateChangeCallback): () => void {
    this.stateSubscribers.add(callback);
    return () => {
      this.stateSubscribers.delete(callback);
    };
  }

  private setState(newState: CoordinatorState): void {
    this.state = newState;
    for (const cb of this.stateSubscribers) {
      try {
        cb(newState);
      } catch {
        // best-effort
      }
    }
  }

  /**
   * Checkout a branch with full safety checks.
   *
   * @param repoId - The repository ID (for cache invalidation)
   * @param localPath - The local repository path
   * @param branchName - The branch to checkout
   * @param remoteName - The remote name (defaults to 'origin')
   */
  checkout(repoId: string, localPath: string, branchName: string, remoteName = 'origin'): Promise<void> {
    const STALE_MUTATION_THRESHOLD_MS = 100;
    if (this.state === 'checkout-running' || this.state === 'failed') {
      this.__resetForTests();
    } else if (this.state === 'mutation-running' && this.mutationStartedAt !== null) {
      if (Date.now() - this.mutationStartedAt > STALE_MUTATION_THRESHOLD_MS) {
        this.__resetForTests();
      }
    }
    if (this.state !== 'idle') {
      throw new Error(`Cannot checkout while ${this.state === 'mutation-running' ? 'a mutation is running' : 'another checkout is running'}`);
    }

    this.setState('checkout-running');
    this.currentRepoPath = localPath;
    this.currentBranchName = branchName;

    const opId = gitOperationRegistry.begin({
      kind: 'checkout' as unknown as GitOpKind,
      repo: localPath,
      branch: branchName,
      entityIds: [],
      attempts: 0,
      status: 'running',
    });

    let releaseCycle: (() => void) | null = null;
    return (async () => {
      try {
        releaseCycle = await GitSyncGate.acquireCycle('manual');

        this.armWatchdog();

        const statuses = await GitEngine.statuses(localPath);
        this.validateWorkingTree(statuses);

        let checkoutError: Error | null = null;
        try {
          await GitEngine.checkoutBranch(localPath, branchName, remoteName);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (/ref.*not(found|exist)|couldn't find|not found/i.test(message)) {
            try {
              await GitEngine.fetch(localPath, remoteName, repoId);
              await GitEngine.checkoutBranch(localPath, branchName, remoteName);
            } catch (retryError) {
              checkoutError = retryError instanceof Error ? retryError : new Error(String(retryError));
            }
          } else {
            checkoutError = error instanceof Error ? error : new Error(message);
          }
        }
        if (checkoutError) {
          throw checkoutError;
        }

        const postflightResult = await GitSyncGate.verifyCheckoutPostflight(localPath, branchName, opId);
        if (!postflightResult.ok) {
          gitOperationRegistry.fail(opId, `Postflight: ${postflightResult.reason}`);
          this.setState('failed');
          throw new Error('Checkout aborted: branch state changed during operation');
        }

        this.clearWatchdog();
        gitOperationRegistry.succeed(opId);
        invalidateCache(repoId);
        await setActiveBranchAfterCheckout(repoId, localPath, branchName);
        emitGitContentRefresh();
        this.setState('idle');
      } catch (error) {
        this.clearWatchdog();
        gitOperationRegistry.fail(opId, error instanceof Error ? error.message : String(error));
        this.setState('failed');
        throw error;
      } finally {
        if (releaseCycle) {
          releaseCycle();
        }
        this.currentRepoPath = null;
        this.currentBranchName = null;
      }
    })();
  }

  /**
   * Begin a mutation operation (stage, commit, discard, etc.).
   *
   * @param opName - Name of the operation for debugging
   * @throws Error if checkout is running or already in mutation
   */
  async beginMutation(opName: string): Promise<void> {
    if (this.state === 'checkout-running') {
      throw new Error(`Cannot begin mutation "${opName}" while checkout is running`);
    }
    if (this.state === 'mutation-running') {
      throw new Error(`Mutation "${opName}" already in progress`);
    }
    if (this.state === 'failed') {
      throw new Error('Cannot begin mutation while in failed state - call reset() first');
    }
    this.mutationStartedAt = Date.now();
    this.setState('mutation-running');
  }

  /**
   * End the current mutation operation.
   */
  endMutation(): void {
    if (this.state !== 'mutation-running') {
      console.warn('[GitBranchCoordinator] endMutation called but state is not mutation-running');
      return;
    }
    this.mutationStartedAt = null;
    this.setState('idle');
  }

  /**
   * Reset from failed state back to idle.
   */
  reset(): void {
    if (this.state !== 'failed') {
      console.warn('[GitBranchCoordinator] reset called but state is not failed');
      return;
    }
    this.clearWatchdog();
    this.setState('idle');
  }

  /** Test seam - reset all state to idle for test isolation */
  __resetForTests(): void {
    this.clearWatchdog();
    this.checkoutResolve = null;
    this.checkoutReject = null;
    this.currentRepoPath = null;
    this.currentBranchName = null;
    this.mutationStartedAt = null;
    this.setState('idle');
  }

  private validateWorkingTree(statuses: FileStatus[]): void {
    for (const file of statuses as WorkingTreeFile[]) {
      if (file.staged) {
        throw new Error(`Cannot checkout: file "${file.path}" is staged. Unstage or commit changes first.`);
      }
      if (file.status !== 'Unmodified') {
        throw new Error(`Cannot checkout: file "${file.path}" is ${file.status.toLowerCase()}. Commit or discard changes first.`);
      }
      if (file.conflicted) {
        throw new Error(`Cannot checkout: file "${file.path}" has conflicts. Resolve conflicts first.`);
      }
    }
  }

  private armWatchdog(): void {
    this.clearWatchdog();
    this.checkoutWatchdog = setTimeout(() => {
      this.handleWatchdogTimeout();
    }, CHECKOUT_WATCHDOG_MS);
  }

  private clearWatchdog(): void {
    if (this.checkoutWatchdog !== null) {
      clearTimeout(this.checkoutWatchdog);
      this.checkoutWatchdog = null;
    }
  }

  private handleWatchdogTimeout(): void {
    console.warn('[GitBranchCoordinator] Checkout watchdog expired - recovering to idle state');
    this.checkoutWatchdog = null;

    GitSyncGate.forceReleaseCycle();

    this.checkoutReject?.(`Watchdog expired after ${CHECKOUT_WATCHDOG_MS}ms`);
    this.checkoutResolve = null;
    this.checkoutReject = null;

    this.setState('failed');
  }
}

export const GitBranchCoordinator = GitBranchCoordinatorClass.getInstance();
