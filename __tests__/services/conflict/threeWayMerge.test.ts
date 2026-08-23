import { threeWayMerge } from '../../../src/services/conflict/threeWayMerge';

describe('threeWayMerge', () => {
  it('preserves both insertions when local and remote insert at different positions (bug-hunt 2026-08)', () => {
    const base = 'a\nb\nc';
    const local = 'a\nX\nb\nc';
    const remote = 'a\nb\nY\nc';
    const result = threeWayMerge(base, local, remote);
    expect(result.merged).toContain('X');
    expect(result.merged).toContain('Y');
    expect(result.merged).toContain('a');
    expect(result.merged).toContain('b');
    expect(result.merged).toContain('c');
  });

  it('preserves an insert at the very start of the file', () => {
    const result = threeWayMerge('a\nb', 'X\na\nb', 'a\nb');
    expect(result).toEqual({ merged: 'X\na\nb', hasConflicts: false });
  });

  it('preserves an insert at the very end of the file', () => {
    const result = threeWayMerge('a\nb', 'a\nb', 'a\nb\nY');
    expect(result).toEqual({ merged: 'a\nb\nY', hasConflicts: false });
  });

  it('detects conflict when both sides modify the same line differently', () => {
    const base = 'a\nb\nc';
    const local = 'a\nB-local\nc';
    const remote = 'a\nB-remote\nc';
    const result = threeWayMerge(base, local, remote);
    expect(result.hasConflicts).toBe(true);
    expect(result.merged).toContain('<<<<<<< LOCAL');
    expect(result.merged).toContain('>>>>>>> REMOTE');
  });

  it('returns local unchanged when base === local', () => {
    const result = threeWayMerge('a\nb', 'a\nb', 'a\nX\nb');
    expect(result).toEqual({ merged: 'a\nX\nb', hasConflicts: false });
  });

  it('returns remote unchanged when base === remote', () => {
    const result = threeWayMerge('a\nb', 'a\nX\nb', 'a\nb');
    expect(result).toEqual({ merged: 'a\nX\nb', hasConflicts: false });
  });
});