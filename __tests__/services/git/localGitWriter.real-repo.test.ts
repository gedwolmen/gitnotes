/**
 * Empirical UPDATE-scenario test for LocalGitWriter.
 *
 * The existing localGitWriter.test.ts mocks `isomorphic-git` wholesale, so it
 * can never observe what `git.status` actually returns after `git.add` for an
 * UPDATE (content change to an existing tracked file). This suite runs the REAL
 * isomorphic-git against the project's real `gitFs` adapter backed by an
 * in-memory expo-file-system, so the `hasTreeChange` guard in writeAndCommit is
 * exercised with real git behavior.
 */

// ---- In-memory expo-file-system mock that actually stores content ----
// Stores: uri -> { kind: 'b64' | 'utf8', value: string }
const mockMemory = new Map<string, { kind: 'b64' | 'utf8'; value: string }>();
(globalThis as unknown as { __lgwRealFs: Map<string, { kind: 'b64' | 'utf8'; value: string }> }).__lgwRealFs = mockMemory;

jest.mock('expo-file-system/legacy', () => {
  const EncodingType = { Base64: 'base64', UTF8: 'utf8' };

  function encode64(s: string): string {
    return Buffer.from(s, 'utf8').toString('base64');
  }
  function decode64(s: string): string {
    return Buffer.from(s, 'base64').toString('utf8');
  }

  return {
    __esModule: true,
    documentDirectory: 'file:///doc/',
    EncodingType,
    async getInfoAsync(uri: string) {
      const key = uri.endsWith('/') ? uri : uri + '/';
      const entry = mockMemory.get(uri);
      if (entry) return { exists: true, uri, isDirectory: false, size: entry.value.length, modificationTime: 100 };
      if ([...mockMemory.keys()].some((k) => k.startsWith(key))) return { exists: true, uri, isDirectory: true, size: 0, modificationTime: 100 };
      return { exists: false, uri };
    },
    async writeAsStringAsync(uri: string, content: string, opts?: { encoding?: string }) {
      if (opts?.encoding === EncodingType.Base64) {
        // Keep the RAW base64 string so binary round-trips byte-exact.
        mockMemory.set(uri, { kind: 'b64', value: content });
      } else {
        mockMemory.set(uri, { kind: 'utf8', value: content });
      }
    },
    async readAsStringAsync(uri: string, opts?: { encoding?: string }) {
      const entry = mockMemory.get(uri);
      if (!entry) return '';
      if (opts?.encoding === EncodingType.Base64) {
        return entry.kind === 'b64' ? entry.value : encode64(entry.value);
      }
      return entry.kind === 'b64' ? decode64(entry.value) : entry.value;
    },
    async deleteAsync(_uri: string, _opts?: { idempotent?: boolean }) {
      mockMemory.delete(_uri);
    },
    async makeDirectoryAsync(_uri: string) {
      // dirs are implicit
    },
    async readDirectoryAsync(uri: string) {
      const prefix = uri.endsWith('/') ? uri : uri + '/';
      const entries = new Set<string>();
      for (const k of mockMemory.keys()) {
        if (k.startsWith(prefix)) {
          const rest = k.slice(prefix.length);
          const top = rest.split('/')[0];
          entries.add(top);
        }
      }
      return [...entries];
    },
  };
});

// Real isomorphic-git, NOT mocked.
import { LocalGitWriter } from '../../../src/services/git/LocalGitWriter';

const author = { name: 'Test', email: 'test@example.com' };

// Bootstrap a clone: init + initial commit, then write the remote-tracking ref
// so the state mirrors a freshly-cloned repo whose HEAD == origin.
async function bootstrapRepo(): Promise<{ dir: string; fs: ReturnType<typeof import('../../../src/services/git/gitFs')['makeGitFs']> }> {
  // Directly use the real gitFs adapter the app uses, rooted at the doc dir.
  const { makeGitFs } = require('../../../src/services/git/gitFs');
  const git = require('isomorphic-git');
  const root = 'file:///doc/GitNotes/';
  const fs = makeGitFs(root);
  const dir = '/me/repo';

  mockMemory.clear();
  mockMemory.set(root, { kind: 'utf8', value: '' });

  // init
  await git.init({ fs, dir, defaultBranch: 'main' });
  // seed an initial file so the repo has HEAD content
  mockMemory.set('file:///doc/GitNotes/me/repo/notes/foo.md', { kind: 'utf8', value: '# Original\n' });
  await git.add({ fs, dir, filepath: 'notes/foo.md' });
  const initialOid = await git.commit({
    fs,
    dir,
    message: 'initial',
    author,
  });
  // write remote-tracking ref = HEAD (fresh clone, nothing unpushed)
  await git.writeRef({ fs, dir, ref: 'refs/remotes/origin/main', value: initialOid });

  return { dir, fs };
}

describe('LocalGitWriter UPDATE vs ADD vs DELETE (real git pipeline)', () => {
  test('UPDATE of a tracked file produces a commit (git.status != unmodified)', async () => {
    const { fs, dir } = await bootstrapRepo();
    const git = require('isomorphic-git');

    // Simulate the user editing notes/foo.md and saving via writeAndCommit.
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/foo.md',
      content: '# Updated\nNew body here\n',
      message: 'Update note: foo',
      author,
      push: false,
    });

    expect(result.success).toBe(true);

    // The commit must have been created: HEAD should now differ from origin.
    const head = await git.resolveRef({ fs, dir, ref: 'refs/heads/main' });
    const origin = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/main' });
    expect(head).not.toBe(origin);
  });

  test('ADD of a new file also produces a commit (control)', async () => {
    const { fs, dir } = await bootstrapRepo();
    const git = require('isomorphic-git');

    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: 'notes/bar.md',
      content: '# Brand new\n',
      message: 'Create note: bar',
      author,
      push: false,
    });

    expect(result.success).toBe(true);
    const head = await git.resolveRef({ fs, dir, ref: 'refs/heads/main' });
    const origin = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/main' });
    expect(head).not.toBe(origin);
  });

  test('UPDATE with a LEADING-SLASH filePath (editor style) still commits', async () => {
    const { fs, dir } = await bootstrapRepo();
    const git = require('isomorphic-git');

    // The note editor passes existingFilePath for folder-backed notes as
    // '/notes/foo.md'. LocalGitWriter must normalize it before writing/adding.
    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: '/notes/foo.md',
      content: '# Updated\nNew body here\n',
      message: 'Update note: foo',
      author,
      push: false,
    });

    expect(result.success).toBe(true);
    const head = await git.resolveRef({ fs, dir, ref: 'refs/heads/main' });
    const origin = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/main' });
    expect(head).not.toBe(origin);
  });

  test('ADD with a LEADING-SLASH filePath (editor style) still commits', async () => {
    const { fs, dir } = await bootstrapRepo();
    const git = require('isomorphic-git');

    const result = await LocalGitWriter.writeAndCommit({
      repoPath: 'me/repo',
      branch: 'main',
      filePath: '/notes/bar.md',
      content: '# Brand new\n',
      message: 'Create note: bar',
      author,
      push: false,
    });

    expect(result.success).toBe(true);
    const head = await git.resolveRef({ fs, dir, ref: 'refs/heads/main' });
    const origin = await git.resolveRef({ fs, dir, ref: 'refs/remotes/origin/main' });
    expect(head).not.toBe(origin);
  });
});
