/**
 * CI guard for the isomorphic-git yield patch.
 *
 * The clone-phase freeze fix patches `node_modules/isomorphic-git` (macrotask
 * yields inside `GitPackIndex.fromPack`) via patch-package. If an isomorphic-git
 * upgrade ever makes that patch stop applying cleanly, this test fails so CI
 * breaks loudly instead of silently losing the fix.
 *
 * Runs the local patch-package binary with `--error-on-fail` (non-interactive;
 * resolves via node_modules/.bin, not `npx`, so no registry round-trip).
 */

import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('patch-package guard (isomorphic-git yield patch)', () => {
  it('re-applies the committed patches without error', () => {
    let output = '';
    expect(() => {
      output = execFileSync(
        path.join(REPO_ROOT, 'node_modules', '.bin', 'patch-package'),
        ['--error-on-fail'],
        { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 },
      );
    }).not.toThrow();

    expect(output).toMatch(/isomorphic-git@1\.40\.0/);
  });
});
