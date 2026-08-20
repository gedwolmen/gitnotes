import { gitOperationRegistry, GIT_OP_ALL_REPOS } from '../../stores/gitOperationStore';

/**
 * App-wide concurrency gate for git sync. Two independent layers:
 *
 * Layer 1 — CYCLE mutex: exactly one drain/pull cycle runs app-wide at a
 * time. Every sync entry (queue drain, foreground pull, startup pull,
 * background task, manual syncNow) acquires it and releases in a finally.
 * A drain+pull pair is ONE acquisition — steps inside a held cycle never
 * re-acquire, so a cycle can never deadlock itself. Callers that drain
 * inside an existing cycle must check `isCycleHeld()` first and skip the
 * acquisition (see NoteSyncQueueService.drain).
 *
 * Layer 2 — PUSH markers per `${repo}@${branch || 'main'}`: set around
 * mutation flights (drain groups, repo-tree writes) so pull steps can wait
 * for in-flight pushes on the repo they are about to read — pulling origin
 * mid-push is the resurrection window for deleted notes. `waitForIdle`
 * polls until the repo's markers clear (or timeout); unrelated repos are
 * never blocked.
 *
 * Every held cycle/marker publishes a running op into the git-operation
 * registry so lock UI and guards observe the gate; the op is removed on
 * release (succeed) or watchdog expiry (fail). Watchdogs: a leaked cycle
 * auto-expires after 10 minutes, and markers older than 10 minutes are
 * swept on the next markPushActive.
 */

/**
 * Why a sync cycle started. Blocking sync UI (issue #926) shows the modal
 * overlay only for 'save' (API write-through, #927) and 'manual' cycles;
 * 'idle' | 'background' | 'startup' cycles keep the non-blocking pill.
 */
export type CycleSource = 'save' | 'manual' | 'idle' | 'background' | 'startup';

const CYCLE_WATCHDOG_MS = 10 * 60 * 1_000;
const MARKER_MAX_AGE_MS = 10 * 60 * 1_000;
const WAIT_FOR_IDLE_POLL_MS = 250;
const WAIT_FOR_IDLE_TIMEOUT_MS = 60_000;
const DEFAULT_MARKER_BRANCH = 'main';

interface PushMarker {
  repo: string;
  branch: string;
  since: number;
  registryOpId: string;
}

class GitSyncGateClass {
  private cycleHeld = false;
  private cycleToken = 0;
  private cycleRegistryOpId: string | null = null;
  private cycleWatchdog: ReturnType<typeof setTimeout> | null = null;
  private cycleWaiters: Array<{ source: CycleSource; grant: () => void }> = [];
  private pushMarkers = new Map<string, PushMarker>();

  /**
   * Acquire the app-wide cycle mutex. Resolves immediately when free,
   * otherwise queues FIFO behind the current holder. The returned release
   * is idempotent and becomes a no-op once the watchdog force-expires the
   * acquisition. Pair every call with a release in a finally. `source`
   * tags the published registry op so UI can tell blocking (save/manual)
   * cycles from non-blocking (idle/background/startup) ones.
   */
  acquireCycle(source: CycleSource): Promise<() => void> {
    if (!this.cycleHeld) {
      this.grantCycle(source);
      return Promise.resolve(this.makeCycleReleaser(this.cycleToken));
    }
    return new Promise<() => void>((resolve) => {
      this.cycleWaiters.push({
        source,
        grant: () => resolve(this.makeCycleReleaser(this.cycleToken)),
      });
    });
  }

  isCycleHeld(): boolean {
    return this.cycleHeld;
  }

  markPushActive(repo: string, branch?: string): void {
    this.sweepStuckMarkers();
    const key = this.markerKey(repo, branch);
    const existing = this.pushMarkers.get(key);
    if (existing) {
      existing.since = Date.now();
      return;
    }
    const normalizedBranch = branch || DEFAULT_MARKER_BRANCH;
    const registryOpId = gitOperationRegistry.begin({
      kind: 'push',
      repo,
      branch: normalizedBranch,
      entityIds: [],
      attempts: 0,
      status: 'running',
    });
    this.pushMarkers.set(key, {
      repo,
      branch: normalizedBranch,
      since: Date.now(),
      registryOpId,
    });
  }

  clearPushActive(repo: string, branch?: string): void {
    const key = this.markerKey(repo, branch);
    const marker = this.pushMarkers.get(key);
    if (!marker) return;
    this.pushMarkers.delete(key);
    gitOperationRegistry.succeed(marker.registryOpId);
  }

  /** True if any marker is held; with a repo arg, only that repo's markers count. */
  isPushActive(repo?: string): boolean {
    for (const marker of this.pushMarkers.values()) {
      if (repo === undefined || marker.repo === repo) return true;
    }
    return false;
  }

  /**
   * Resolve once no push markers remain for the repo (or app-wide when
   * omitted). Resolves false instead of waiting past timeoutMs.
   */
  async waitForIdle(repo?: string, timeoutMs: number = WAIT_FOR_IDLE_TIMEOUT_MS): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (this.isPushActive(repo)) {
      if (Date.now() >= deadline) return false;
      await new Promise<void>((resolve) => setTimeout(resolve, WAIT_FOR_IDLE_POLL_MS));
    }
    return true;
  }

  __resetForTest(): void {
    if (this.cycleWatchdog !== null) {
      clearTimeout(this.cycleWatchdog);
      this.cycleWatchdog = null;
    }
    for (const marker of this.pushMarkers.values()) {
      gitOperationRegistry.succeed(marker.registryOpId);
    }
    this.pushMarkers.clear();
    this.cycleWaiters = [];
    this.cycleHeld = false;
    this.cycleToken += 1;
    if (this.cycleRegistryOpId) {
      gitOperationRegistry.succeed(this.cycleRegistryOpId);
      this.cycleRegistryOpId = null;
    }
  }

  private markerKey(repo: string, branch?: string): string {
    return `${repo}@${branch || DEFAULT_MARKER_BRANCH}`;
  }

  private grantCycle(source: CycleSource): void {
    this.cycleHeld = true;
    this.cycleToken += 1;
    this.publishCycleOp(source);
    this.armCycleWatchdog();
  }

  private publishCycleOp(source: CycleSource): void {
    this.cycleRegistryOpId = gitOperationRegistry.begin({
      kind: 'pull',
      repo: GIT_OP_ALL_REPOS,
      source,
      entityIds: [],
      attempts: 0,
      status: 'running',
    });
  }

  private armCycleWatchdog(): void {
    if (this.cycleWatchdog !== null) clearTimeout(this.cycleWatchdog);
    this.cycleWatchdog = setTimeout(() => this.expireCycle(), CYCLE_WATCHDOG_MS);
  }

  private expireCycle(): void {
    this.cycleWatchdog = null;
    if (!this.cycleHeld) return;
    console.warn(`[GitSyncGate] cycle held for ${CYCLE_WATCHDOG_MS}ms; force-releasing leaked acquisition`);
    const opId = this.cycleRegistryOpId;
    this.cycleRegistryOpId = null;
    // Invalidate any outstanding release token from the leaked holder.
    this.cycleToken += 1;
    if (opId) gitOperationRegistry.fail(opId, 'Sync cycle watchdog expired');
    this.handOffOrReleaseCycle();
  }

  private handOffOrReleaseCycle(): void {
    const next = this.cycleWaiters.shift();
    if (next) {
      // Still held — the next FIFO waiter becomes the holder with a fresh
      // token, registry op (tagged with the waiter's own source), and
      // watchdog window.
      this.cycleToken += 1;
      this.publishCycleOp(next.source);
      this.armCycleWatchdog();
      next.grant();
      return;
    }
    this.cycleHeld = false;
  }

  private makeCycleReleaser(token: number): () => void {
    let used = false;
    return () => {
      if (used) return;
      used = true;
      if (!this.cycleHeld || token !== this.cycleToken) return;
      if (this.cycleWatchdog !== null) {
        clearTimeout(this.cycleWatchdog);
        this.cycleWatchdog = null;
      }
      const opId = this.cycleRegistryOpId;
      this.cycleRegistryOpId = null;
      if (opId) gitOperationRegistry.succeed(opId);
      this.handOffOrReleaseCycle();
    };
  }

  private sweepStuckMarkers(): void {
    const now = Date.now();
    for (const [key, marker] of this.pushMarkers) {
      if (now - marker.since <= MARKER_MAX_AGE_MS) continue;
      this.pushMarkers.delete(key);
      console.warn(`[GitSyncGate] clearing stuck push marker ${key} after ${MARKER_MAX_AGE_MS}ms`);
      gitOperationRegistry.fail(marker.registryOpId, 'Push marker watchdog expired');
    }
  }
}

export const GitSyncGate = new GitSyncGateClass();
