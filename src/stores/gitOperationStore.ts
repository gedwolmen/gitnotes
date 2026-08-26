// Stub for deleted gitOperationStore module

export interface GitOp {
  id: string;
  kind: 'rename' | 'move' | 'delete' | 'pull' | 'push';
  repo: string;
  branch?: string;
  path: string;
  status: 'queued' | 'running' | 'failed';
  error?: string;
  attempts: number;
  entityIds: string[];
}

export interface GitOpStore {
  ops: Record<string, GitOp>;
  succeed: (id: string) => void;
  getState: () => GitOpStore;
}

const store: GitOpStore = {
  ops: {},
  succeed: (_id: string) => {},
  getState: () => store,
};

// Create a typed function with getState property (Zustand-like pattern)
interface UseGitOperationStoreType {
  <T>(selector: (state: GitOpStore) => T): T;
  (): GitOpStore;
  getState: () => GitOpStore;
}

const useGitOperationStoreImpl: UseGitOperationStoreType = function <T>(selector?: (state: GitOpStore) => T): T | GitOpStore {
  if (selector) {
    return selector(store);
  }
  return store;
} as UseGitOperationStoreType;

useGitOperationStoreImpl.getState = () => store;

export const useGitOperationStore = useGitOperationStoreImpl;

export const gitOperationRegistry = {
  begin: (_params: { kind: string; repo: string; branch?: string; path: string; entityIds: string[]; status: string; attempts: number }) => 'op-' + Date.now(),
  succeed: (_id: string) => {},
  fail: (_id: string, _message: string) => {},
  retry: (_id: string) => {},
};

export const isPathLocked = (_ops: Record<string, GitOp>, _repoPath: string, _branch: string | undefined, _path: string) => false;
export const hasActivePull = (_ops: Record<string, GitOp>, _repoPath: string) => false;
