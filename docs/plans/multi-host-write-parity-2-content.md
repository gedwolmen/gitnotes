# Plan 2 — Remaining Sync Services + Dispatch Rewiring

## Goal

Port all remaining sync services (`CanvasGitHubSyncService`,
`TodoGitHubSyncService`, `TemplateGitHubSyncService`, `ChatStorageService`,
`RenderStyleService`) to use host-aware dispatch. Rewire background/foreground
dispatch services. Set the feature flag to `true` by default.

## 1. Port `CanvasGitHubSyncService.ts`

**File:** `src/services/CanvasGitHubSyncService.ts` (175 lines)

### 1a. `resolveAuthor()` — make host-aware

Current (lines 58-62):
```ts
const user = GitHubService.getUser();
const author = {
  name: user?.name || user?.login || 'gitnotes',
  email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.github.com`,
};
```

Replace with async helper using `getGitHostService(provider).getAuthenticatedUser()`:

```ts
import { getGitHostService } from './git/gitHostFactory';

async function resolveAuthor(provider: GitHostProvider): Promise<{ name: string; email: string }> {
  const host = getGitHostService(provider);
  const user = await host.getAuthenticatedUser();
  return {
    name: user?.name || user?.login || 'gitnotes',
    email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.gitnotes`,
  };
}
```

### 1b. `syncCanvasToGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.isAuthenticated()` (32) | `getGitHostService(provider).getAuthenticatedUser().then(u => !!u)` |
| `GitHubService.updateFile(owner, repo, ...)` (80) | `host.updateFile(owner, repo, ...)` |

### 1c. `deleteCanvasFromGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.getFileSha()` (146) | `host.getFileSha()` |
| `GitHubService.deleteFile()` (154) | `host.deleteFile()` |

### 1d. Clone-mode — host-aware author

Both `syncCanvasToGitHub()` (line 58) and `deleteCanvasFromGitHub()` (line 126)
have inline author resolution. Replace with `await resolveAuthor(provider)`.

### 1e. Provider resolution

`parseRepoPath()` returns `{ owner, repo }` only — no `provider` field.
Provider comes from `GitRepository.provider` (set when repo added).
Add `provider` parameter to sync function:

```ts
export async function syncCanvasToGitHub(params: {
  // ... existing params ...
  provider?: GitHostProvider; // NEW
}): Promise<CanvasGitHubSyncResult>
```

Callers already have `GitRepository` object with `provider` field.
Inside sync function, resolve host:

```ts
const host = getGitHostService(provider || 'github');
```

For clone-mode where `resolveAuthor()` needs provider, extract from params:

```ts
const author = await resolveAuthor(params.provider || 'github');
```

## 2. Port `TodoGitHubSyncService.ts`

**File:** `src/services/TodoGitHubSyncService.ts` (221 lines)

Same pattern as CanvasGitHubSyncService:

### 2a. `syncTodoToGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.isAuthenticated()` (47) | `host.getAuthenticatedUser().then(u => !!u)` |
| `GitHubService.getFileShaOrNull()` (89) | `host.getFileShaOrNull()` |
| `GitHubService.updateFile()` (125) | `host.updateFile()` |

### 2b. `deleteTodoFromGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.getFileSha()` (192) | `host.getFileSha()` |
| `GitHubService.deleteFile()` (200) | `host.deleteFile()` |

### 2c. Clone-mode author resolution

Lines 102-106 and 171-175: replace inline `GitHubService.getUser()` with
`await resolveAuthor(provider)`.

## 3. Port `TemplateGitHubSyncService.ts`

**File:** `src/services/TemplateGitHubSyncService.ts` (127 lines)

### 3a. `resolveAuthor()` — host-aware

Current (lines 10-16):
```ts
function resolveAuthor() {
  const user = GitHubService.getUser();
  return { name: ..., email: ... };
}
```

Make async with host-aware dispatch.

### 3b. `syncTemplateToGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.isAuthenticated()` (31) | `host.getAuthenticatedUser().then(u => !!u)` |
| `GitHubService.updateFile()` (63) | `host.updateFile()` |

### 3c. `deleteTemplateFromGitHub()` — host-aware API-mode

| Current (line) | Replacement |
|---|---|
| `GitHubService.isAuthenticated()` (82) | `host.getAuthenticatedUser().then(u => !!u)` |
| `GitHubService.getFileSha()` (105) | `host.getFileSha()` |
| `GitHubService.deleteFile()` (119) | `host.deleteFile()` |

### 3d. Clone-mode author resolution

Lines 54 and 97: `resolveAuthor()` calls. Make async.

## 4. Port `ChatStorageService.ts`

**File:** `src/services/ChatStorageService.ts` (559 lines)

### 4a. Own HTTP layer — not just auth

ChatStorageService has its OWN HTTP layer, not using `GitHubService` for CRUD:

- **Line 8:** `const GITHUB_API = 'https://api.github.com'` — hardcoded
- **Line 49-51:** `contentUrl()` builds `${GITHUB_API}/repos/${owner}/${repo}/contents/...`
- **Lines 101-124:** `githubRequest()` uses `axios.request()` directly with GitHub headers
  (`Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`)
- **Lines 137-175:** `putFile()` with retry using `getFile()` → `githubRequest()`
- **Lines 177-215:** `deleteFile()` with similar retry pattern
- **Lines 89, 351:** `GitHubService.isAuthenticated()` — only two direct GitHubService refs

### 4b. Port strategy

Replace ENTIRE HTTP layer with `GitHostWriteService` calls:

| Current | Replacement |
|---|---|
| `githubRequest<T>({ method, url, data })` | `host.updateFile()` / `host.deleteFile()` / `host.getFileSha()` |
| `contentUrl({ owner, repo, path })` | Remove — `host.updateFile()` builds URL internally |
| `getFile({ owner, repo, path })` | `host.getFileSha()` or `host.getFileShaOrNull()` |
| `putFile({ owner, repo, path, content, message, sha })` | `host.updateFile(owner, repo, path, content, message, branch)` |
| `deleteFile({ owner, repo, path, message, sha })` | `host.deleteFile(owner, repo, path, message, sha, branch)` |
| `isAuthenticated()` (lines 89, 351) | `host.getAuthenticatedUser().then(u => !!u)` |

### 4c. Provider resolution

Add `provider` parameter to public methods (`saveChat`, `deleteChat`, `loadChats`).
Callers pass `provider` from `GitRepository.provider`.

### 4d. Risk: largest change in Plan 2

ChatStorageService port is bigger than all other services combined.
~200 lines of HTTP layer replaced. Test thoroughly. Consider feature-flag gating
separately from other services.

## 5. Port `RenderStyleService.ts`

**File:** `src/services/RenderStyleService.ts` (101 lines)

### 5a. `load()` — host-aware read

Current (line 38): `GitHubService.getFileContent(owner, name, path, branch)`

New: `host.getFileText(owner, name, path, branch)`

### 5b. `save()` — host-aware write

Current (line 57): `GitHubService.updateFile(owner, name, path, json, msg, branch)`

New: `host.updateFile(owner, name, path, json, msg, branch)`

### 5c. `discoverExisting()` — host-aware

Current (lines 74, 79, 83): `GitHubService.getRepositories()`, `site.getFileShaOrNull()`

This scans ALL repos for `settings/render.json`. With multi-host support,
this needs to scan repos across all hosts. This is a broader change — the
current implementation only scans GitHub repos. For Plan 2, we'll keep
this GitHub-only and note it as a limitation. Each host's `getRepositories()`
method (if available) would need to be called separately.

**Decision:** `discoverExisting()` is a UI convenience, not a sync path.
Leave it GitHub-only for now. Add a TODO to make it multi-host later.

### 5d. Interface changes

`RenderStyleRepoBinding` (lines 8-12) needs a `provider` field:

```ts
export interface RenderStyleRepoBinding {
  provider: GitHostProvider;
  owner: string;
  name: string;
  branch: string;
}
```

## 6. Rewire dispatch services

### 6a. `BackgroundSyncService.ts`

**File:** `src/services/BackgroundSyncService.ts` (65 lines)

Line 17: `GitHubService.isAuthenticated()` → replace with host-aware check.
Line 21: repos come from `StorageService.getSavedRepositories()` — each has `provider` field.

```ts
// Before (line 17)
if (!GitHubService.isAuthenticated()) return;

// After
const repos = await StorageService.getSavedRepositories();
for (const repo of repos) {
  const provider = repo.provider || 'github';
  const host = getGitHostService(provider);
  const user = await host.getAuthenticatedUser();
  if (!user) continue;
  // ... sync logic passes provider to sync functions
}
```

### 6b. `ForegroundSyncService.ts`

**File:** `src/services/ForegroundSyncService.ts` (260 lines)

Line 60: `GitHubService.isAuthenticated()` → same pattern as BackgroundSyncService.
Line 49: repo iteration uses `GitRepository` objects — extract `provider` from each.

### 6c. `RepoFileSyncService.ts`

**File:** `src/services/RepoFileSyncService.ts` (133 lines)

| Line | Current | Replacement |
|---|---|---|
| 41-44 | `buildGitHubContentsApiUrl()` hardcodes `https://api.github.com` | `GitHostContent.downloadUrl` from `host.listContents()` |
| 74 | `GitHubService.getRepoContents()` | `host.listContents()` |
| 91 | `GitHubService.getFileContent()` | `host.getFileText()` |

PDF URL fix: `listContents()` returns `GitHostContent[]` with `downloadUrl` field.
Pass that URL directly instead of building GitHub-specific URL.

### 6d. `CloneMigrationService.ts`

**File:** `src/services/git/CloneMigrationService.ts` (191 lines)

Line 23-28: `authorFromUser()` calls `GitHubService.getUser()`:

```ts
// Before
function authorFromUser(): { name: string; email: string } {
  const user = GitHubService.getUser();
  return { name: ..., email: ... };
}

// After
async function authorFromUser(provider: GitHostProvider): Promise<{ name: string; email: string }> {
  const host = getGitHostService(provider);
  const user = await host.getAuthenticatedUser();
  return { name: user?.name || user?.login || 'gitnotes', email: ... };
}
```

Only GitHub-specific call in this service. `LocalGitWriter` operations already host-agnostic.

## 7. Feature flag — set to `true`

**File:** `src/services/featureFlags.ts` (created in Plan 1)

Plan 1 creates this file with `FEATURE_USE_MULTI_HOST_WRITE = false`.
Plan 2 changes the const to `true`:

```ts
// Plan 1 created this file
export const FEATURE_USE_MULTI_HOST_WRITE = false; // Plan 1

// Plan 2 changes to:
export const FEATURE_USE_MULTI_HOST_WRITE = true;  // Plan 2
```

Import pattern used by sync services:
```ts
import { FEATURE_USE_MULTI_HOST_WRITE } from '../featureFlags';

// Guard pattern:
if (FEATURE_USE_MULTI_HOST_WRITE) {
  const host = getGitHostService(provider);
  // host-aware path
} else {
  // GitHubService direct path (preserved for rollback)
}
```

Old GitHub-only code paths preserved behind flag for rollback safety.

## 8. Provider resolution — Option A (parameter)

**Decision:** Add `provider?: GitHostProvider` parameter to every sync function.

**Why not Option B (parseRepoPath):** `parseRepoPath()` returns `{ owner, repo }` only.
It does NOT return `provider`. The `provider` field lives on `GitRepository`, not
in the parsed repo path string. Verified in `src/utils/gitPathParser.ts` (17 lines).

**Callers already have provider:** Every caller passes a `GitRepository` object
or has one in scope. Extracting `provider` from `GitRepository.provider` and
passing it as a parameter is zero-cost and type-safe.

**Pattern for every sync function:**

```ts
export async function syncCanvasToGitHub(params: {
  repo: string;
  branch?: string;
  // ... existing params ...
  provider?: GitHostProvider; // NEW — defaults to 'github' if omitted
}): Promise<CanvasGitHubSyncResult> {
  const host = getGitHostService(params.provider || 'github');
  // ...
}
```

**Pattern for callers:**

```ts
// Caller has GitRepository object
const repo: GitRepository = ...;
await syncCanvasToGitHub({
  repo: `${repo.owner}/${repo.name}`,
  provider: repo.provider, // pass through
  // ...
});
```

**Pattern for RenderStyleRepoBinding:** Add `provider` to interface:

```ts
export interface RenderStyleRepoBinding {
  provider: GitHostProvider; // NEW
  owner: string;
  name: string;
  branch: string;
}
```

## 9. Common helper extraction

The author resolution pattern is repeated in 4 sync services (Note, Canvas,
Todo, Template). Extract a shared helper:

**New file:** `src/services/git/syncAuthorResolver.ts`

```ts
import { GitHostProvider } from './GitHost';
import { getGitHostService } from './gitHostFactory';

export async function resolveSyncAuthor(
  provider: GitHostProvider,
): Promise<{ name: string; email: string }> {
  const host = getGitHostService(provider);
  const user = await host.getAuthenticatedUser();
  return {
    name: user?.name || user?.login || 'gitnotes',
    email: user?.email || `${user?.login ?? 'gitnotes'}@users.noreply.gitnotes`,
  };
}
```

Replace the 4 inline `resolveAuthor()` implementations with imports of this
shared helper.

## 10. Unit tests

### 10a. `CanvasGitHubSyncService` tests

**Existing file:** `__tests__/services/CanvasGitHubSyncService.test.ts`

Add tests:
- `syncCanvasToGitHub()` with `provider: 'gitlab'` uses `GitLabService`
- `deleteCanvasFromGitHub()` with `provider: 'gitea'` uses `GiteaLikeHostService`
- Clone-mode author resolution uses `getAuthenticatedUser()` from correct host
- Feature flag off → old code path still works

### 10b. `TodoGitHubSyncService` tests

**Existing file:** `__tests__/services/TodoGitHubSyncService.test.ts`

Add same pattern as Canvas tests.

### 10c. `TemplateGitHubSyncService` tests

**Existing file:** `__tests__/template-github-sync.test.ts`

Add same pattern.

### 10d. `RenderStyleService` tests

**New file:** `__tests__/services/RenderStyleService.test.ts` (no existing test file)

Add tests:
- `load()` with GitLab provider
- `save()` with Gitea provider
- `discoverExisting()` remains GitHub-only (documented limitation)

### 10e. `RepoFileSyncService` tests

**New file:** `__tests__/services/RepoFileSyncService.test.ts` (no existing test file)

Add tests:
- `syncRepoFiles()` with GitLab repo uses `listContents()` and `getFileText()`
- PDF files use `downloadUrl` from `GitHostContent` instead of hardcoded GitHub URL

## 11. Files modified (summary)

| File | Changes |
|---|---|
| `src/services/CanvasGitHubSyncService.ts` | `resolveAuthor()` → async, `updateFile`/`getFileSha`/`deleteFile` → host-aware |
| `src/services/TodoGitHubSyncService.ts` | Same pattern |
| `src/services/TemplateGitHubSyncService.ts` | Same pattern |
| `src/services/ChatStorageService.ts` | `isAuthenticated()` → host-aware |
| `src/services/RenderStyleService.ts` | `getFileContent`/`updateFile` → host-aware, add `provider` to binding |
| `src/services/BackgroundSyncService.ts` | `isAuthenticated()` → host-aware |
| `src/services/ForegroundSyncService.ts` | `isAuthenticated()` → host-aware |
| `src/services/RepoFileSyncService.ts` | `getRepoContents`/`getFileContent` → host-aware, fix PDF URL |
| `src/services/git/CloneMigrationService.ts` | `getUser()` → host-aware |
| `src/services/git/syncAuthorResolver.ts` | **New file** — shared author resolver |
| `src/services/featureFlags.ts` | Set `FEATURE_USE_MULTI_HOST_WRITE = true` |
| `__tests__/services/CanvasGitHubSyncService.test.ts` | Add host-aware tests |
| `__tests__/services/TodoGitHubSyncService.test.ts` | Add host-aware tests |
| `__tests__/template-github-sync.test.ts` | Add host-aware tests |
| `__tests__/services/RenderStyleService.test.ts` | **New file** — host-aware tests |
| `__tests__/services/RepoFileSyncService.test.ts` | Add host-aware tests |

## 12. Known limitations (Plan 2 scope)

| Limitation | Reason |
|---|---|
| `RenderStyleService.discoverExisting()` stays GitHub-only | Multi-host repo discovery separate feature; `listRepos()` shape varies per host |
| `CloneMigrationService` only resolves author | Full migration (clone → API) across hosts out of scope |
| Background sync only checks auth per-host | Actual sync routed through ported sync services |
| `ChatStorageService` port is full — no deferral | Own HTTP layer replaced with `GitHostWriteService` calls; ~200 lines changed |

## 13. Execution order / dependency map

Work in this order. Each step depends on previous:

| Step | File(s) | Depends on |
|---|---|---|
| 1 | `src/services/git/syncAuthorResolver.ts` | Plan 1 (`GitHostWriteService`, `getGitHostService`) |
| 2 | `src/services/CanvasGitHubSyncService.ts` | Step 1, Plan 1 |
| 3 | `src/services/TodoGitHubSyncService.ts` | Step 1, Plan 1 |
| 4 | `src/services/TemplateGitHubSyncService.ts` | Step 1, Plan 1 |
| 5 | `src/services/RenderStyleService.ts` | Plan 1 |
| 6 | `src/services/ChatStorageService.ts` | Plan 1 (largest change, do after confidence from steps 2-4) |
| 7 | `src/services/BackgroundSyncService.ts` | Steps 2-4 (sync functions must accept `provider` first) |
| 8 | `src/services/ForegroundSyncService.ts` | Steps 2-4 |
| 9 | `src/services/RepoFileSyncService.ts` | Plan 1 |
| 10 | `src/services/git/CloneMigrationService.ts` | Step 1 |
| 11 | `src/services/featureFlags.ts` | Steps 2-10 (all ports done) |
| 12 | `__tests__/` — all test files | Steps 1-11 |

**Parallelizable:** Steps 2-4 can run in parallel (independent services). Steps 7-8 can run in parallel.

## 14. Risk assessment

| Risk | Severity | Mitigation |
|---|---|---|
| ChatStorageService has own HTTP layer — ~200 lines replaced | High | Port after confidence from Canvas/Todo/Template ports. Feature-flag gating per-service. |
| `parseRepoPath()` doesn't return `provider` — must use `GitRepository.provider` | Medium | Use Option A (provider param). Verified in source — no false assumption. |
| `featureFlags.ts` doesn't exist yet (created Plan 1) | Medium | Plan 2 runs after Plan 1. Documented dependency. |
| BackgroundSync runs cold-launch — host-aware auth needs available tokens | Low | `getGitHostService(provider)` uses `AuthService` which already handles per-host tokens. |
| RenderStyleService `discoverExisting()` stays GitHub-only | Low | Documented limitation. UI convenience, not sync path. No data loss risk. |
| `discoverExisting()` scans all repos — won't find non-GitHub styles | Low | User must manually add style for GitLab/Gitea repos. UX acceptable for now. |
| Feature flag set to `true` — rollback requires reverting to `false` | Low | One-line change. Old code paths preserved behind flag. |