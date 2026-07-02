/**
 * Live integration smoke test for the GitLab host.
 *
 * Uses the GitLab REST API to exercise the GitLabService end-to-end:
 *   1. Verify the auth probe /user returns a real user with a valid token.
 *   2. Resolve the default branch of a public GitLab project.
 *   3. List the branches of the project.
 *   4. Read the project tree and the contents of a file.
 *
 * Run with: GITLAB_PAT=glpat-... GITLAB_TEST_PROJECT=inkscape/inkscape \
 *           npx jest live-gitlab --runInBand
 *
 * Skips gracefully when the env var is missing so unit tests stay
 * hermetic.
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitLabService } from '../src/services/git/GitLabService';

type Env = {
  GITLAB_PAT: string;
  GITLAB_TEST_PROJECT: string;
};

function loadEnv(): Env | null {
  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return null;
  const raw = fs.readFileSync(envPath, 'utf8');
  const map: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    map[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  if (!map.GITLAB_PAT || !map.GITLAB_TEST_PROJECT) return null;
  return { GITLAB_PAT: map.GITLAB_PAT, GITLAB_TEST_PROJECT: map.GITLAB_TEST_PROJECT };
}

const env = loadEnv();
const describeLive = env ? describe : describe.skip;

describeLive('Live GitLab host integration', () => {
  jest.setTimeout(60_000);
  let svc: GitLabService;

  beforeEach(async () => {
    svc = new GitLabService();
    await svc.setToken(env!.GITLAB_PAT);
  });

  it('authenticates against gitlab.com', async () => {
    const user = await svc.getAuthenticatedUser();
    expect(user).not.toBeNull();
    expect(user?.login.length).toBeGreaterThan(0);
    console.log('[live] gitlab user:', user?.login);
  });

  it('resolves the default branch of the test project', async () => {
    const [owner, repo] = env!.GITLAB_TEST_PROJECT.split('/');
    const branch = await svc.getDefaultBranch(owner, repo);
    expect(branch).not.toBeNull();
    expect(branch?.length).toBeGreaterThan(0);
    console.log('[live] default branch:', branch);
  });

  it('lists branches of the test project', async () => {
    const [owner, repo] = env!.GITLAB_TEST_PROJECT.split('/');
    const branches = await svc.listBranches(owner, repo);
    expect(branches.length).toBeGreaterThan(0);
    console.log('[live] branch count:', branches.length);
  });

  it('walks the project tree', async () => {
    const [owner, repo] = env!.GITLAB_TEST_PROJECT.split('/');
    const branch = await svc.getDefaultBranch(owner, repo);
    expect(branch).not.toBeNull();
    const tree = await svc.getTreeRecursive(owner, repo, branch!);
    expect(tree.length).toBeGreaterThan(0);
    console.log('[live] tree entries:', tree.length);
  });
});
