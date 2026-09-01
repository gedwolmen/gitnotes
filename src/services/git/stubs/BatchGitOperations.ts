// Stub for missing BatchGitOperations module
export interface BatchGitOperations {
  begin(op: { kind: string; repo: string; branch: string; path: string; entityIds: string[]; status: string; attempts: number }): string;
  succeed(opId: string): void;
  fail(opId: string, error: Error): void;
  retry(opId: string): void;
  end(opId: string): void;
}

export const stubBatchGitOperations: BatchGitOperations = {
  begin: () => '',
  succeed: () => {},
  fail: () => {},
  retry: () => {},
  end: () => {},
};
