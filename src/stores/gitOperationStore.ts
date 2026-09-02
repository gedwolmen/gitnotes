import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { NoteSyncQueueService, type QueuedMutation } from '../services/syncStubs';
import type { CycleSource } from '../services/git/GitSyncGate';

/**
 * Central registry of git operations (saves, deletes, pushes, pulls, ...).
 * Drives the app-wide locked/busy UI. The store never invents persistent
 * truth: queued and failed ops are re-derived from the durable sync queue
 * and the delete-failure map via hydrate(), so locks survive app restarts
 * and the StartupSyncGate refresh cascade that re-reads AsyncStorage.
 *
 * Status semantics: `queued`/`running` ops lock their paths/entities.
 * `staged` ops — queue-backed upserts that have been staged but not yet
 * pushed — stay in the registry (so the stage screen stays in sync) but
 * never lock: cards are editable while the push is in flight. Deletes stay
 * `queued` so their rows remain locked until the push removes them.
 */

export type GitOpKind = 'upsert' | 'delete' | 'rename' | 'move' | 'pull' | 'push';

export type GitOpStatus = 'queued' | 'running' | 'failed' | 'staged';

export interface GitOp {
  id: string;
  kind: GitOpKind;
  repo: string;
  branch?: string;
  path?: string;
  entityIds: string[];
  status: GitOpStatus;
  error?: string;
  attempts: number;
  createdAt: number;
  /** Cycle ops only: why the cycle started (blocking-UI gating, #926). */
  source?: CycleSource;
}

export type GitOpBeginInput = Omit<GitOp, 'id' | 'createdAt'> & { status?: 'queued' | 'running' };

/** Parsed entry from the durable delete-failure map (`@gitnotes:delete_failures_v1`). */
export interface FailedDeleteEntry {
  /** Raw map key `${repo}::${resolvedBranch}::${path}`; doubles as the derived op id. */
  key: string;
  repo: string;
  branch: string;
  path: string;
  error: string;
  kind: string;
  at: number;
}

interface GitOperationState {
  ops: Record<string, GitOp>;
}

interface GitOperationActions {
  begin: (input: GitOpBeginInput) => string;
  setRunning: (id: string) => void;
  succeed: (id: string) => void;
  fail: (id: string, error: string) => void;
  retry: (id: string) => void;
  replaceFromDurable: (queued: QueuedMutation[], failed: FailedDeleteEntry[]) => void;
}

const GIT_OP_KINDS: readonly GitOpKind[] = ['upsert', 'delete', 'rename', 'move', 'pull', 'push'];
const DELETE_FAILURES_KEY = '@gitnotes:delete_failures_v1';

/**
 * Repo sentinel for app-wide ops. The sync gate publishes its cycle op as a
 * pull against every repo; selectors below treat it as matching all repos.
 */
export const GIT_OP_ALL_REPOS = '*';

/** Ids of ops derived from durable sources on the last replaceFromDurable pass. */
let durableOpIds = new Set<string>();
let queueSubscription: (() => void) | null = null;

function normalizeBranch(branch: string | undefined): string {
  return branch || 'main';
}

function isActiveStatus(status: GitOpStatus): boolean {
  return status === 'queued' || status === 'running';
}

function generateOpId(): string {
  return `gitop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function toGitOpKind(value: string): GitOpKind {
  return GIT_OP_KINDS.includes(value as GitOpKind) ? (value as GitOpKind) : 'delete';
}

function opFromQueuedMutation(mutation: QueuedMutation): GitOp | null {
  if (!mutation || typeof mutation.id !== 'string' || !mutation.params || typeof mutation.params.repo !== 'string') {
    return null;
  }
  const base = {
    id: mutation.id,
    repo: mutation.params.repo,
    branch: mutation.params.branch,
    path: mutation.params.filePath,
    entityIds: [] as string[],
    status: 'queued' as const,
    error: mutation.lastError,
    attempts: typeof mutation.attempts === 'number' ? mutation.attempts : 0,
    createdAt: typeof mutation.createdAt === 'number' ? mutation.createdAt : 0,
  };
  if (mutation.type === 'note.upsert') {
    return { ...base, kind: 'upsert', status: 'staged', entityIds: mutation.localNoteId ? [mutation.localNoteId] : [] };
  }
  if (mutation.type === 'note.delete') {
    const localNoteId = mutation.params.localNoteId;
    return { ...base, kind: 'delete', entityIds: localNoteId ? [localNoteId] : [] };
  }
  return null;
}

function parseDeleteFailureKey(key: string): { repo: string; branch: string; path: string } | null {
  const firstSep = key.indexOf('::');
  const secondSep = firstSep >= 0 ? key.indexOf('::', firstSep + 2) : -1;
  if (firstSep <= 0 || secondSep === -1) return null;
  const repo = key.slice(0, firstSep);
  const branch = key.slice(firstSep + 2, secondSep);
  const path = key.slice(secondSep + 2);
  if (!repo || !path) return null;
  return { repo, branch, path };
}

function opFromFailedEntry(entry: FailedDeleteEntry): GitOp | null {
  if (!entry || !entry.key || !entry.repo || !entry.path) return null;
  return {
    id: entry.key,
    kind: toGitOpKind(entry.kind),
    repo: entry.repo,
    branch: entry.branch,
    path: entry.path,
    entityIds: [],
    status: 'failed',
    error: entry.error || 'Delete failed',
    attempts: 0,
    createdAt: entry.at || 0,
  };
}

function buildDurableOps(queued: QueuedMutation[], failed: FailedDeleteEntry[]): Record<string, GitOp> {
  const ops: Record<string, GitOp> = {};
  for (const entry of Array.isArray(failed) ? failed : []) {
    const op = opFromFailedEntry(entry);
    if (op) ops[op.id] = op;
  }
  for (const mutation of Array.isArray(queued) ? queued : []) {
    const op = opFromQueuedMutation(mutation);
    if (op) ops[op.id] = op;
  }
  return ops;
}

async function readDeleteFailures(): Promise<FailedDeleteEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(DELETE_FAILURES_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    const entries: FailedDeleteEntry[] = [];
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      const parts = parseDeleteFailureKey(key);
      if (!parts || !value || typeof value !== 'object') continue;
      const record = value as { error?: unknown; kind?: unknown; at?: unknown };
      entries.push({
        key,
        repo: parts.repo,
        branch: parts.branch,
        path: parts.path,
        error: typeof record.error === 'string' && record.error.trim() ? record.error : 'Delete failed',
        kind: typeof record.kind === 'string' ? record.kind : 'delete',
        at: typeof record.at === 'number' ? record.at : 0,
      });
    }
    return entries;
  } catch {
    return [];
  }
}

function ensureQueueSubscription(): void {
  if (queueSubscription) return;
  queueSubscription = NoteSyncQueueService.subscribe(() => {
    void hydrate();
  });
}

export const useGitOperationStore = create<GitOperationState & GitOperationActions>()((set) => ({
  ops: {},

  begin: (input) => {
    const id = generateOpId();
    const op: GitOp = {
      id,
      kind: input.kind,
      repo: input.repo,
      branch: input.branch,
      path: input.path,
      entityIds: input.entityIds,
      status: input.status ?? 'queued',
      error: input.error,
      attempts: input.attempts,
      createdAt: Date.now(),
      source: input.source,
    };
    set((state) => ({ ops: { ...state.ops, [id]: op } }));
    return id;
  },

  setRunning: (id) =>
    set((state) => {
      const op = state.ops[id];
      if (!op) return state;
      return { ops: { ...state.ops, [id]: { ...op, status: 'running', error: undefined } } };
    }),

  succeed: (id) =>
    set((state) => {
      if (!state.ops[id]) return state;
      const ops = { ...state.ops };
      delete ops[id];
      return { ops };
    }),

  fail: (id, error) =>
    set((state) => {
      const op = state.ops[id];
      if (!op) return state;
      return { ops: { ...state.ops, [id]: { ...op, status: 'failed', error } } };
    }),

  retry: (id) =>
    set((state) => {
      const op = state.ops[id];
      if (!op) return state;
      return { ops: { ...state.ops, [id]: { ...op, status: 'queued', error: undefined } } };
    }),

  replaceFromDurable: (queued, failed) =>
    set((state) => {
      const durable = buildDurableOps(queued, failed);
      const ops: Record<string, GitOp> = {};
      // Non-durable ops (running push/pull markers, in-flight repo mutations)
      // are caller-owned and not re-derivable from storage — preserve them.
      for (const [id, op] of Object.entries(state.ops)) {
        if (!durableOpIds.has(id)) ops[id] = op;
      }
      Object.assign(ops, durable);
      durableOpIds = new Set(Object.keys(durable));
      return { ops };
    }),
}));

/**
 * Re-derive the registry from durable sources: the persisted sync queue
 * plus the delete-failure map. Called from App bootstrap right after
 * bootstrapStorage(), and re-runs live on queue churn via the guarded
 * subscription below.
 */
export async function hydrate(): Promise<void> {
  try {
    const [queued, failed] = await Promise.all([NoteSyncQueueService.getAll(), readDeleteFailures()]);
    useGitOperationStore.getState().replaceFromDurable(queued, failed);
  } catch (error) {
    console.warn('[gitOperationStore] hydrate failed:', error);
  }
  ensureQueueSubscription();
}

export const isPathLocked = (
  ops: Record<string, GitOp>,
  repo: string,
  branch: string | undefined,
  path: string | undefined,
): boolean =>
  Object.values(ops).some(
    (op) =>
      isActiveStatus(op.status) &&
      op.repo === repo &&
      normalizeBranch(op.branch) === normalizeBranch(branch) &&
      op.path !== undefined &&
      op.path === path,
  );

export const isEntityLocked = (ops: Record<string, GitOp>, entityId: string): boolean =>
  Object.values(ops).some((op) => isActiveStatus(op.status) && op.entityIds.includes(entityId));

export const isRepoBusy = (ops: Record<string, GitOp>, repo: string): boolean =>
  Object.values(ops).some(
    (op) =>
      isActiveStatus(op.status) &&
      (op.repo === repo || (op.repo === GIT_OP_ALL_REPOS && op.kind === 'pull')),
  );

export const hasActivePull = (ops: Record<string, GitOp>, repo: string): boolean =>
  Object.values(ops).some(
    (op) =>
      isActiveStatus(op.status) &&
      op.kind === 'pull' &&
      (op.repo === repo || op.repo === GIT_OP_ALL_REPOS),
  );

export const pendingRunningCount = (ops: Record<string, GitOp>): number =>
  Object.values(ops).filter((op) => isActiveStatus(op.status)).length;

/** Non-hook facade for service-layer callers (sync gate, repo-tree, stores). */
export const gitOperationRegistry = {
  begin: (input: GitOpBeginInput) => useGitOperationStore.getState().begin(input),
  setRunning: (id: string) => useGitOperationStore.getState().setRunning(id),
  succeed: (id: string) => useGitOperationStore.getState().succeed(id),
  fail: (id: string, error: string) => useGitOperationStore.getState().fail(id, error),
  retry: (id: string) => useGitOperationStore.getState().retry(id),
  hydrate: () => hydrate(),
};
