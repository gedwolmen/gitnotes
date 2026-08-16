import { opMatchesContext, type UseEntityLockOptions } from '../../src/hooks/useGitOpLock';
import type { GitOp } from '../../src/stores/gitOperationStore';

function makeOp(overrides: Partial<GitOp> = {}): GitOp {
  return {
    id: 'op-1',
    kind: 'upsert',
    repo: 'owner/repo',
    branch: 'main',
    path: undefined,
    entityIds: [],
    status: 'running',
    attempts: 0,
    createdAt: 1,
    ...overrides,
  };
}

const rowContext: UseEntityLockOptions = { repo: 'owner/repo', branch: 'main', path: 'notes/a.md' };

describe('opMatchesContext', () => {
  it('does not match a row for a repo-wide push op with no path', () => {
    const op = makeOp({ kind: 'push', path: undefined, entityIds: [] });
    expect(opMatchesContext(op, undefined, rowContext)).toBe(false);
    // Even a row that knows its own id must not lock for a path-less push.
    expect(opMatchesContext(op, 'n1', rowContext)).toBe(false);
  });

  it('matches a row for an upsert op with the same repo/branch/path', () => {
    const op = makeOp({ kind: 'upsert', path: 'notes/a.md' });
    expect(opMatchesContext(op, undefined, rowContext)).toBe(true);
  });

  it('does not match a row for an op with a different path', () => {
    const op = makeOp({ kind: 'upsert', path: 'notes/b.md' });
    expect(opMatchesContext(op, undefined, rowContext)).toBe(false);
  });

  it('matches by entityIds even when path is undefined', () => {
    const op = makeOp({ kind: 'delete', path: undefined, entityIds: ['n1'] });
    expect(opMatchesContext(op, 'n1', rowContext)).toBe(true);
    expect(opMatchesContext(op, 'n2', rowContext)).toBe(false);
  });
});
