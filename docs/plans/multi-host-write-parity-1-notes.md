# Plan 1 — GitHostWriteService + NoteGitHubSyncService Port

## Goal

Extend the `GitHostService` interface with write operations, implement them
for all four hosts, port `NoteGitHubSyncService` to use host-aware dispatch,
fix `RepoPullService` read path, and add a feature flag.

## 1. Extend `GitHostService` with write methods

**File:** `src/services/git/GitHost.ts`

Add these methods to the `GitHostService` interface (after line 115):

```ts
/** Result of a SHA lookup. */
export interface GitHostShaResult {
  kind: 'found' | 'not-found' | 'error';
  sha?: string;
  message?: string;
}

/**
 * Write operations supported by every git host.
 *
 * Every implementation of `GitHostService` MUST also implement these
 * methods. The sync stack uses them for create/update/delete of files
 * in API mode.
 */
export interface GitHostWriteService {
  // ── SHA helpers ──────────────────────────────────────────────────

  /** Resolve the SHA of a file at the given ref. */
  getFileSha(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<GitHostShaResult>;

  /** Convenience: `getFileSha` → `string | null`. */
  getFileShaOrNull(
    owner: string,
    repo: string,
    path: string,
    ref?: string,
  ): Promise<string | null>;

  // ── File CRUD ────────────────────────────────────────────────────

  /** Create or update a UTF-8 text file. Returns the new SHA. */
  updateFile(
    owner: string,
    repo: string,
    path: string,
    content: string,
    commitMessage: string,
    branch: string,
    knownSha?: string,
  ): Promise<string>;

  /** Delete a file. */
  deleteFile(
    owner: string,
    repo: string,
    path: string,
    commitMessage: string,
    sha: string,
    branch: string,
  ): Promise<void>;

  // ── Binary upload ────────────────────────────────────────────────

  /** Upload a binary file (base64-encoded). Returns the raw download URL. */
  uploadBinaryFile(
    owner: string,
    repo: string,
    path: string,
    base64Content: string,
    commitMessage: string,
    branch: string,
  ): Promise<string>;

  // ── Repo metadata ────────────────────────────────────────────────

  /** Returns `true` for private repos, `false` for public, `null` if unknown. */
  getRepoPrivacy(
    owner: string,
    repo: string,
  ): Promise<boolean | null>;
}
```

**Decision:** Keep `GitHostWriteService` as a **separate interface** that
implementations declare they satisfy. The `gitHostFactory` will return a
type that is both `GitHostService & GitHostWriteService`. This avoids
breaking the existing interface contract and lets us type-narrow where
needed.

**Alternative considered:** Extending `GitHostService` directly. Rejected
because the read-only interface is used by the repo picker / browser
components which don't need the write surface. Keeping them separate
makes the dependency direction clearer.

### Type narrowing in `gitHostFactory.ts`

```ts
import { GitHostService, GitHostWriteService } from './GitHost';
import { GitHostProvider } from './GitHost';

export type GitHostFullService = GitHostService & GitHostWriteService;

export function getGitHostService(provider: GitHostProvider): GitHostFullService {
  // … existing logic, but cast the return to GitHostFullService
}
```

## 2. Implement write methods in `GitHubHostService.ts`

**File:** `src/services/git/GitHubHostService.ts`

Add `implements GitHostWriteService` to the class declaration. Add these
methods, each delegating to the existing `GitHubService` methods:

| New method | Delegates to |
|---|---|
| `getFileSha(owner, repo, path, ref?)` | `GitHubService.getFileSha(owner, repo, path, ref, opts)` |
| `getFileShaOrNull(owner, repo, path, ref?)` | `GitHubService.getFileShaOrNull(owner, repo, path, ref, opts)` |
| `updateFile(owner, repo, path, content, msg, branch, knownSha?)` | `GitHubService.updateFile(owner, repo, path, content, msg, branch, { sha: knownSha })` |
| `deleteFile(owner, repo, path, msg, sha, branch)` | `GitHubService.deleteFile(owner, repo, path, msg, sha, branch, opts)` |
| `uploadBinaryFile(owner, repo, path, b64, msg, branch)` | `GitHubService.uploadBinaryFile(owner, repo, path, b64, msg, branch)` |
| `getRepoPrivacy(owner, repo)` | `GitHubService.getRepoPrivacy(owner, repo, opts)` |

The `GitHubService` methods already handle retry, SHA caching, and error
normalization. The thin adapter just passes through. The `opts` parameter
should use `getAuthHeaders()` internally (already handled by `GitHubService`).

**No new logic needed.** This is purely a delegation layer.

## 3. Implement write methods in `GitLabService.ts`

**File:** `src/services/git/GitLabService.ts`

Add `implements GitHostWriteService` to the class.

### 3a. `getFileSha(owner, repo, path, ref?)`

```ts
async getFileSha(owner, repo, path, ref?: string): Promise<GitHostShaResult> {
  const projId = this.encodedProjectId(owner, repo);
  const branch = ref || (await this.getDefaultBranch(owner, repo)) || 'main';
  const encodedPath = encodeURIComponent(path);
  const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}?ref=${branch}`;
  const result = await this.authedFetch<{
    blob_id: string; file_name: string; file_path: string;
  }>(url);
  if (!result) return { kind: 'error', message: 'Failed to fetch file' };
  return { kind: 'found', sha: result.blob_id };
}
```

GitLab does not 404 on missing files — it returns 404 HTTP status. `authedFetch`
returns `null` on non-2xx, so we need to distinguish 404 from other errors.
Add a helper:

```ts
private async getFileShaOr404(
  owner: string, repo: string, path: string, ref?: string
): Promise<GitHostShaResult> {
  try {
    return await this.getFileSha(owner, repo, path, ref);
  } catch {
    // If getFileSha returns { kind: 'error' }, check if it's a 404
    // We'll add a raw HTTP call here to distinguish
  }
}
```

**Better approach:** Modify `authedFetch` to return response status alongside
the body, or add a variant that returns `{ status, body }`. That way
`getFileSha` can return `{ kind: 'not-found' }` on 404.

### 3b. `getFileShaOrNull(owner, repo, path, ref?)`

```ts
async getFileShaOrNull(owner, repo, path, ref?): Promise<string | null> {
  const result = await this.getFileSha(owner, repo, path, ref);
  return result.kind === 'found' ? result.sha! : null;
}
```

### 3c. `updateFile(owner, repo, path, content, msg, branch, knownSha?)`

GitLab API:
- Create: `POST /projects/:id/repository/files/:file_path`
- Update: `PUT /projects/:id/repository/files/:file_path`

Both accept: `{ branch, content, commit_message, encoding: 'base64' }`

```ts
async updateFile(
  owner: string, repo: string, path: string,
  content: string, commitMessage: string, branch: string,
  knownSha?: string,
): Promise<string> {
  const projId = this.encodedProjectId(owner, repo);
  const encodedPath = encodeURIComponent(path);
  const method = knownSha ? 'PUT' : 'POST';
  const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
  const body = {
    branch,
    content: btoa(unescape(encodeURIComponent(content))), // base64
    commit_message: commitMessage,
    encoding: 'base64',
  };
  const result = await this.authedFetch<{ file_path: string; blob_id?: string }>(
    url, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
  );
  if (!result) throw new Error(`GitLab: failed to update file ${path}`);
  // Re-fetch SHA since GitLab doesn't return it in the response
  const shaResult = await this.getFileSha(owner, repo, path, branch);
  return shaResult.sha || '';
}
```

**Retry on conflict (409):** GitLab returns 409 when the file has changed.
Add a 3-retry loop with SHA re-fetch, matching the `GitHubService.updateFile`
pattern.

### 3d. `deleteFile(owner, repo, path, msg, sha, branch)`

```ts
async deleteFile(
  owner: string, repo: string, path: string,
  commitMessage: string, sha: string, branch: string,
): Promise<void> {
  const projId = this.encodedProjectId(owner, repo);
  const encodedPath = encodeURIComponent(path);
  const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
  const body = { branch, commit_message: commitMessage };
  await this.authedFetch(url, {
    method: 'DELETE',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 3e. `uploadBinaryFile(owner, repo, path, b64, msg, branch)`

GitLab uses the same `POST /projects/:id/repository/files/:file_path` endpoint
with `encoding: 'base64'` and the `content` field set to the base64 data.

Returns the raw URL: `https://gitlab.com/<owner>/<repo>/-/raw/<branch>/<path>`

```ts
async uploadBinaryFile(
  owner: string, repo: string, path: string,
  base64Content: string, commitMessage: string, branch: string,
): Promise<string> {
  const projId = this.encodedProjectId(owner, repo);
  const encodedPath = encodeURIComponent(path);
  const url = `${this.baseUrl}/projects/${projId}/repository/files/${encodedPath}`;
  const body = {
    branch,
    content: base64Content,
    commit_message: commitMessage,
    encoding: 'base64',
  };
  await this.authedFetch(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
  return `https://gitlab.com/${owner}/${repo}/-/raw/${branch}/${path}`;
}
```

### 3f. `getRepoPrivacy(owner, repo)`

```ts
async getRepoPrivacy(owner: string, repo: string): Promise<boolean | null> {
  const projId = this.encodedProjectId(owner, repo);
  const url = `${this.baseUrl}/projects/${projId}`;
  const result = await this.authedFetch<{ visibility: string }>(url);
  if (!result) return null;
  return result.visibility === 'private';
}
```

### 3g. `authedFetch` enhancement

Modify `authedFetch` to return response status. Currently:

```ts
private async authedFetch<T>(url: string, init?: RequestInit): Promise<T | null>
```

Add an overload or new method:

```ts
private async authedFetchRaw(
  url: string, init?: RequestInit
): Promise<{ status: number; body: any } | null>
```

This lets `getFileSha` distinguish 404 (not found) from other errors.

## 4. Implement write methods in `GiteaLikeHostService.ts`

**File:** `src/services/git/GiteaLikeHostService.ts`

Add `implements GitHostWriteService` to the class.

Gitea/Forgejo API is GitHub-compatible for file CRUD:

### 4a. `getFileSha(owner, repo, path, ref?)`

```ts
async getFileSha(owner, repo, path, ref?): Promise<GitHostShaResult> {
  const branch = ref || (await this.getDefaultBranch(owner, repo)) || 'main';
  const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`;
  const result = await this.authedFetch<{ sha: string }>(url);
  if (!result) return { kind: 'error', message: 'Failed to fetch file' };
  return { kind: 'found', sha: result.sha };
}
```

Need to distinguish 404 → `{ kind: 'not-found' }`. Same `authedFetchRaw`
approach as GitLab.

### 4b. `getFileShaOrNull` — same pattern as GitLab

### 4c. `updateFile(owner, repo, path, content, msg, branch, knownSha?)`

```ts
async updateFile(
  owner: string, repo: string, path: string,
  content: string, commitMessage: string, branch: string,
  knownSha?: string,
): Promise<string> {
  const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  const body: any = {
    content: btoa(unescape(encodeURIComponent(content))),
    message: commitMessage,
    branch,
  };
  if (knownSha) body.sha = knownSha;
  const result = await this.authedFetch<{ content: { sha: string } }>(
    url, {
      method: 'PUT',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    }
  );
  if (!result) throw new Error(`Gitea/Forgejo: failed to update file ${path}`);
  return result.content.sha;
}
```

Add 3-retry conflict loop (409 handling) matching GitHub pattern.

### 4d. `deleteFile(owner, repo, path, msg, sha, branch)`

```ts
async deleteFile(
  owner: string, repo: string, path: string,
  commitMessage: string, sha: string, branch: string,
): Promise<void> {
  const url = `${this.baseUrl}/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`;
  await this.authedFetch(url, {
    method: 'DELETE',
    body: JSON.stringify({ message: commitMessage, sha, branch }),
    headers: { 'Content-Type': 'application/json' },
  });
}
```

### 4e. `uploadBinaryFile(owner, repo, path, b64, msg, branch)`

Same as `updateFile` but with base64 content directly. Returns raw URL
matching the host's raw content pattern:

- Gitea: `https://gitea.com/<owner>/<repo>/raw/branch/<branch>/<path>`
- Forgejo: `https://codeberg.org/<owner>/<repo>/raw/branch/<branch>/<path>`

### 4f. `getRepoPrivacy(owner, repo)`

```ts
async getRepoPrivacy(owner: string, repo: string): Promise<boolean | null> {
  const url = `${this.baseUrl}/repos/${owner}/${repo}`;
  const result = await this.authedFetch<{ private: boolean }>(url);
  if (!result) return null;
  return result.private;
}
```

## 5. Port `NoteGitHubSyncService.ts`

**File:** `src/services/NoteGitHubSyncService.ts`

### 5a. Make `resolveAuthor()` host-aware

Current (lines 12-18):
```ts
function resolveAuthor(): { name: string; email: string } {
  const user = GitHubService.getUser();
  const name = user?.login || 'gitnotes';
  const email = user?.email || (user?.id
    ? `${user.id}+${user.login}@users.noreply.github.com`
    : 'gitnotes@users.noreply.github.com');
  return { name, email };
}
```

New:
```ts
async function resolveAuthor(
  provider: GitHostProvider
): Promise<{ name: string; email: string }> {
  const host = getGitHostService(provider);
  const user = await host.getAuthenticatedUser();
  const name = user?.login || 'gitnotes';
  let email = user?.email || `${name}@users.noreply.gitnotes`;
  return { name, email };
}
```

The `email` field is only used for git commit metadata in clone-mode.
For API-mode, the token identifies the author. For clone-mode commits,
the email is embedded in the commit object. We use a generic fallback
since the actual email is rarely critical — the commit is attributed
to the token holder on the remote side.

### 5b. Make `syncNoteToGitHub()` host-aware

The function needs a `provider` parameter. Currently it extracts
`provider` from the note's `GitRepository`:

```ts
// Add provider resolution at the top of syncNoteToGitHub()
const repoInfo = parseRepoPath(note.repo);
const provider = repoInfo?.provider || 'github';
const host = getGitHostService(provider);
```

Replace direct `GitHubService` calls:

| Current (line) | Replacement |
|---|---|
| `GitHubService.isAuthenticated()` (426) | `host.getAuthenticatedUser().then(u => !!u)` |
| `GitHubService.getFileShaOrNull()` (477) | `host.getFileShaOrNull()` |
| `GitHubService.getFileShaOrNull()` (511) | `host.getFileShaOrNull()` |
| `GitHubService.updateFile()` (519) | `host.updateFile()` |

### 5c. Make `deleteNoteFromGitHub()` host-aware

| Current (line) | Replacement |
|---|---|
| `GitHubService.getFileShaCached()` (358) | `host.getFileShaOrNull()` |
| `GitHubService.deleteFile()` (375) | `host.deleteFile()` |

### 5d. Make `uploadLocalImages()` host-aware

| Current (line) | Replacement |
|---|---|
| `GitHubService.getRepoPrivacy()` (261) | `host.getRepoPrivacy()` |
| `GitHubService.uploadBinaryFile()` (281) | `host.uploadBinaryFile()` |

The raw URL returned by `uploadBinaryFile` is host-specific. The
`gitnotes://repo-image/` fallback scheme for private repos remains
unchanged.

### 5e. Clone-mode path — no changes needed

`LocalGitWriter.writeAndCommit()` and `LocalGitWriter.deleteAndCommit()`
work against the local clone regardless of the remote host. The git
push uses the token from `AuthService`, which already supports per-host
tokens.

## 6. Port `RepoPullService.ts`

**File:** `src/services/RepoPullService.ts`

### 6a. `getRepoReader()` — use host-aware read

Current pattern: `getRepoReader()` returns `{ mode, listTree, readFile }`
where the API path hardcodes `GitHubService.getTreeRecursiveOrThrow()`
and `GitHubService.getFileContent()`.

New: The API path should use `getGitHostService(provider)` for read ops.

```ts
// In the API-mode branch of getRepoReader():
const host = getGitHostService(provider);
return {
  mode: 'api',
  listTree: async (ref) => {
    const entries = await host.getTreeRecursive(owner, repo, ref);
    return entries.map(e => ({ path: e.path, type: e.type }));
  },
  readFile: async (path, ref) => {
    return host.getFileText(owner, repo, path, ref);
  },
};
```

### 6b. `fetchDirectoryFiles()` — use host-aware read

Replace `GitHubService.getRepoContents()` and `GitHubService.getFileContent()`
with `host.listContents()` and `host.getFileText()`.

## 7. Feature flag

**New file:** `src/services/featureFlags.ts`

```ts
/**
 * Feature flags for incremental rollout.
 *
 * Set to `false` to disable a feature and fall back to the old code path.
 * Plans 1-2: USE_MULTI_HOST_WRITE = false
 * Plan 3:    USE_MULTI_HOST_WRITE = true
 */

export const FEATURE_USE_MULTI_HOST_WRITE = false;
```

In `NoteGitHubSyncService.ts`, guard the new code path:

```ts
import { FEATURE_USE_MULTI_HOST_WRITE } from './featureFlags';

// In syncNoteToGitHub():
if (FEATURE_USE_MULTI_HOST_WRITE) {
  // New host-aware path
} else {
  // Old GitHub-only path (kept intact for rollback)
}
```

This preserves the exact old code path as a fallback. The feature flag
is a compile-time constant, not a runtime toggle, so it tree-shakes
cleanly in production builds.

## 8. Unit tests

### 8a. `GitHostWriteService` interface tests

**New file:** `__tests__/services/git/GitHostWriteService.test.ts`

Test each host implementation satisfies the interface contract:

- `getFileSha` returns `{ kind: 'found', sha }` for existing files
- `getFileSha` returns `{ kind: 'not-found' }` for missing files
- `getFileShaOrNull` returns string or null
- `updateFile` creates a new file (no knownSha)
- `updateFile` updates an existing file (with knownSha)
- `updateFile` retries on 409 conflict
- `deleteFile` removes a file
- `uploadBinaryFile` returns a raw URL
- `getRepoPrivacy` returns boolean for known repos, null for unknown

### 8b. `GitLabService` write tests

**New file:** `__tests__/services/git/GitLabService.write.test.ts`

Mock `authedFetch` to return GitLab-shaped responses. Test:

- File CRUD with GitLab API shapes
- Base64 encoding/decoding
- `encodedProjectId` URL encoding
- 409 conflict retry loop
- 404 → not-found distinction

### 8c. `GiteaLikeHostService` write tests

**New file:** `__tests__/services/git/GiteaLikeHostService.write.test.ts`

Mock `authedFetch` to return Gitea-shaped responses. Test:

- File CRUD with Gitea API shapes
- Both `gitea` and `forgejo` provider labels
- 409 conflict retry loop
- Raw URL construction for each host

### 8d. `NoteGitHubSyncService` host-aware tests

**Existing file:** `__tests__/services/NoteGitHubSyncService.test.ts`

Add tests:

- `syncNoteToGitHub()` with `provider: 'gitlab'` calls `GitLabService` not `GitHubService`
- `syncNoteToGitHub()` with `provider: 'gitea'` calls `GiteaLikeHostService`
- `deleteNoteFromGitHub()` with non-GitHub provider
- `resolveAuthor()` returns correct email for each host
- Feature flag off → old code path still works

### 8e. `RepoPullService` tests

**Existing file:** `__tests__/services/RepoPullService.test.ts`

Add tests:

- `getRepoReader()` with non-GitHub provider returns host-aware reader
- `fetchDirectoryFiles()` with GitLab provider
- `fetchDirectoryFiles()` with Gitea provider

## 9. Integration test

**New file:** `__tests__/integration/multiHostWrite.test.ts`

**Precondition:** A test GitLab repo with a valid token in `GITLAB_TEST_TOKEN`
env var.

Test flow:
1. Create a note in the app
2. Call `NoteGitHubSyncService.syncNoteToGitHub()` with `provider: 'gitlab'`
3. Verify the file exists on GitLab via `host.getFileText()`
4. Verify the content matches
5. Update the note
6. Call `syncNoteToGitHub()` again
7. Verify the file was updated
8. Delete the note
9. Verify the file was deleted

## 10. Files modified (summary)

| File | Changes |
|---|---|
| `src/services/git/GitHost.ts` | Add `GitHostWriteService` interface, `GitHostShaResult`, `GitHostFullService` type |
| `src/services/git/GitHubHostService.ts` | Add 6 write methods delegating to `GitHubService` |
| `src/services/git/GitLabService.ts` | Add 6 write methods, `authedFetchRaw` helper, 409 retry loop |
| `src/services/git/GiteaLikeHostService.ts` | Add 6 write methods, `authedFetchRaw` helper, 409 retry loop |
| `src/services/git/gitHostFactory.ts` | Export `GitHostFullService` type, narrow return type |
| `src/services/NoteGitHubSyncService.ts` | `resolveAuthor()` → async + host-aware, 3 API-mode methods → host-aware |
| `src/services/RepoPullService.ts` | `getRepoReader()` + `fetchDirectoryFiles()` → host-aware |
| `src/services/featureFlags.ts` | **New file** — `FEATURE_USE_MULTI_HOST_WRITE` flag |
| `__tests__/services/git/GitHostWriteService.test.ts` | **New file** — interface contract tests |
| `__tests__/services/git/GitLabService.write.test.ts` | **New file** — GitLab write tests |
| `__tests__/services/git/GiteaLikeHostService.write.test.ts` | **New file** — Gitea/Forgejo write tests |
| `__tests__/services/NoteGitHubSyncService.test.ts` | Add host-aware sync tests |
| `__tests__/services/RepoPullService.test.ts` | Add host-aware read tests |
| `__tests__/integration/multiHostWrite.test.ts` | **New file** — end-to-end sync test |

## 11. Rollback plan

If the feature flag is off (`FEATURE_USE_MULTI_HOST_WRITE = false`), the
old code path is completely preserved. The new code is never executed.

If the feature flag is on and something breaks:
1. Set `FEATURE_USE_MULTI_HOST_WRITE = false`
2. Redeploy
3. The old GitHub-only code path is exactly as it was before

## 12. Risk assessment

| Risk | Mitigation |
|---|---|
| GitLab API shape mismatch | Integration test with real GitLab token |
| Gitea/Forgejo API version differences | Both use v1 API, tested against gitea.com and codeberg.org |
| 409 conflict handling differences | Per-host retry loops with host-specific error handling |
| Binary upload encoding | GitLab uses same base64 encoding as GitHub; Gitea/Forgejo too |
| Author email for non-GitHub hosts | Generic fallback; git commit author is cosmetic for API-mode syncs |
| `RepoPullService` regression | Feature flag guards the new code path |