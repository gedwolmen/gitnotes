# Plan 3 — Integration Tests, Edge Cases, Rollback & Documentation

## Goal

Validate the multi-host write parity implementation end-to-end: live
integration tests across all 4 hosts for every content type, edge-case
hardening (409 conflicts, network failures, token expiry), a safe rollback
procedure, and user-facing documentation updates.

## 1. Integration test infrastructure

### 1a. Test environment

Integration tests use real API credentials and operate against real
repositories. They are gated behind environment variables so they skip
automatically when credentials are absent. This follows the pattern
established in `__tests__/live-gitlab.integration.test.ts`.

**New file:** `__tests__/integration/multi-host-write.integration.test.ts`

```ts
/**
 * Multi-host write parity integration suite.
 *
 * Required env vars per host:
 *   GITHUB_TOKEN=ghp_...        GITHUB_TEST_REPO=owner/repo
 *   GITLAB_PAT=glpat-...        GITLAB_TEST_REPO=owner/repo
 *   GITEA_TOKEN=...             GITEA_TEST_REPO=owner/repo
 *   FORGEJO_TOKEN=...           FORGEJO_TEST_REPO=owner/repo
 *
 * Each host block skips if its token is missing. Run with:
 *   npx jest integration/multi-host-write --runInBand
 */
```

### 1b. Helper: `setupTestRepo()`

Each test block needs a clean test repo. Create a shared helper that:

1. Authenticates with the host.
2. Resolves the default branch.
3. Creates a test branch (`gitnotes-test-<timestamp>`).
4. Returns the branch name, repo info, and authenticated host service.

After each test block, clean up by deleting the test branch (if the host
API supports branch deletion; otherwise note the limitation).

### 1c. `.env.example`

Create `.env.example` for developers who want to run integration tests:

```
# GitHub (required for GitHub integration tests)
GITHUB_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx
GITHUB_TEST_REPO=your-username/gitnotes-test

# GitLab (required for GitLab integration tests)
GITLAB_PAT=glpat-xxxxxxxxxxxxxxxxxxxx
GITLAB_TEST_REPO=your-username/gitnotes-test

# Gitea (required for Gitea integration tests)
GITEA_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GITEA_TEST_REPO=your-username/gitnotes-test

# Forgejo (required for Forgejo integration tests)
FORGEJO_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
FORGEJO_TEST_REPO=your-username/gitnotes-test
```

Add `.env` to `.gitignore` (if not already present).

## 2. Integration tests by content type

### 2a. Note sync (write + update + delete)

**Test: `NoteGitHubSyncService` integration**

```
describe('Note sync — live', () => {
  describe('GitHub', () => {
    it('syncs a new note to GitHub')
    it('updates an existing note (SHA-based update)')
    it('deletes a note from GitHub')
    it('syncs a note with tags (markdown frontmatter)')
    it('syncs a note with color (markdown frontmatter)')
    it('syncs a neorg note')
    it('syncs an org-mode note')
    it('returns error when repo does not exist')
  })

  describe('GitLab', () => {
    // Same suite, but with GitLab credentials
    it('syncs a new note to GitLab')
    it('updates an existing note (SHA-based update)')
    it('deletes a note from GitLab')
    it('syncs a note with tags (markdown frontmatter)')
    it('syncs a note with color (markdown frontmatter)')
  })

  describe('Gitea', () => {
    // Same suite, with Gitea credentials
    it('syncs a new note to Gitea')
    it('updates an existing note (SHA-based update)')
    it('deletes a note from Gitea')
  })

  describe('Forgejo', () => {
    // Same suite, with Forgejo credentials
    it('syncs a new note to Forgejo')
    it('updates an existing note (SHA-based update)')
    it('deletes a note from Forgejo')
  })
})
```

### 2b. Canvas sync

**Test: `CanvasGitHubSyncService` integration**

```
describe('Canvas sync — live', () => {
  describe('GitHub', () => {
    it('syncs a new canvas to GitHub')
    it('updates an existing canvas')
    it('deletes a canvas from GitHub')
    it('handles canvas with drawing data')
  })

  describe('GitLab', () => {
    it('syncs a new canvas to GitLab')
    it('updates an existing canvas')
    it('deletes a canvas from GitLab')
  })

  describe('Gitea', () => {
    it('syncs a new canvas to Gitea')
    it('deletes a canvas from Gitea')
  })

  describe('Forgejo', () => {
    it('syncs a new canvas to Forgejo')
    it('deletes a canvas from Forgejo')
  })
})
```

### 2c. Todo sync

**Test: `TodoGitHubSyncService` integration**

```
describe('Todo sync — live', () => {
  describe('GitHub / GitLab / Gitea / Forgejo', () => {
    it('syncs a new todo list')
    it('updates an existing todo list')
    it('deletes a todo list')
    it('preserves todo completion state')
  })
})
```

### 2d. Template sync

**Test: `TemplateGitHubSyncService` integration**

```
describe('Template sync — live', () => {
  describe('GitHub / GitLab / Gitea / Forgejo', () => {
    it('syncs a new template')
    it('updates an existing template')
    it('deletes a template')
    it('generates correct file path from slug')
  })
})
```

### 2e. Render style sync

**Test: `RenderStyleService` integration**

```
describe('Render style — live', () => {
  describe('GitHub / GitLab / Gitea / Forgejo', () => {
    it('loads render settings from repo')
    it('saves render settings to repo')
    it('returns empty settings when file is missing')
    it('preserves JSON structure across round-trip')
  })
})
```

### 2f. Feature flag integration

**Test: cross-host dispatch**

```
describe('Feature flag behavior', () => {
  it('uses GitHub path when flag is false')
  it('uses host-aware path when flag is true')
  it('GitLab host resolves correct author')
  it('Gitea host resolves correct author')
  it('Forgejo host resolves correct author')
})
```

## 3. Edge cases

### 3a. 409 Conflict (SHA mismatch)

When two clients update the same file concurrently, the second update
will fail with a 409 because the SHA in the request no longer matches
the latest commit.

**Test cases:**

```
describe('SHA conflict handling', () => {
  it('returns conflict error when SHA is stale (GitHub)')
  it('returns conflict error when SHA is stale (GitLab)')
  it('returns conflict error when SHA is stale (Gitea)')
  it('returns conflict error when SHA is stale (Forgejo)')
  it('caller can retry with fresh SHA after conflict')
})
```

**Implementation note:** The `updateFile` method takes an optional
`knownSha` parameter. When the caller passes a stale SHA, the host
API returns 409 (GitHub/Gitea/Forgejo) or 400 (GitLab). Each host's
`updateFile` implementation should normalize this to a typed error
that the sync service can catch and retry.

**Error type to add** (in `GitHost.ts` or a new errors file):

```ts
export class GitHostConflictError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly branch: string,
  ) {
    super(message);
    this.name = 'GitHostConflictError';
  }
}
```

### 3b. Network failures

**Test cases:**

```
describe('Network resilience', () => {
  it('retries on transient 5xx errors (GitHub)')
  it('retries on transient 5xx errors (GitLab)')
  it('retries on transient 5xx errors (Gitea)')
  it('retries on transient 5xx errors (Forgejo)')
  it('fails after max retries exceeded')
  it('handles DNS resolution failure gracefully')
  it('handles connection timeout gracefully')
  it('handles self-hosted URL that is unreachable')
})
```

**Implementation note:** GitHub's `GitHubService` already has retry
logic via `callWithRetry`. GitLab and Gitea/Forgejo implementations
may need retry wrappers. For Plan 3, we document the current state
and add retry where missing. Use exponential backoff: 500ms, 1s, 2s,
with a max of 3 retries.

### 3c. Token expiry / invalid credentials

**Test cases:**

```
describe('Auth edge cases', () => {
  it('returns null getAuthenticatedUser when token is revoked')
  it('write operations fail with clear error on invalid token')
  it('write operations fail with clear error on expired token')
  it('token refresh works when supported by host')
  it('self-hosted GitLab with custom token works')
  it('self-hosted Gitea with custom token works')
})
```

**Implementation note:** Each host service should validate the token
on `setToken()` and expose a `isTokenValid()` check. Write operations
should fail fast if the token is invalid rather than making a network
call that will 401.

### 3d. Path encoding edge cases

**Test cases:**

```
describe('Path encoding', () => {
  it('handles file paths with spaces')
  it('handles file paths with unicode characters')
  it('handles file paths with special characters (#, ?, &)')
  it('handles deeply nested paths (> 10 levels)')
  it('handles paths with leading/trailing whitespace')
  it('handles empty file contents')
  it('handles very large files (> 1MB) with binary upload')
})
```

**Implementation note:** GitLab uses `encodeURIComponent` for file
paths in the URL. GitHub and Gitea/Forgejo use the raw path in the
URL. Each host must correctly encode the path for its API.

### 3e. Rate limiting

**Test cases:**

```
describe('Rate limit handling', () => {
  it('GitHub: respects Retry-After header on 429')
  it('GitLab: respects Retry-After header on 429')
  it('Gitea: respects Retry-After header on 429')
  it('Forgejo: respects Retry-After header on 429')
  it('queue-based sync does not exceed rate limits')
})
```

**Implementation note:** The existing `GitHubService` has rate limit
handling that reads `X-RateLimit-Remaining` and `Retry-After` headers.
Extract this logic into a shared `rateLimitHandler.ts` utility that
all host services can use.

### 3f. Branch edge cases

**Test cases:**

```
describe('Branch edge cases', () => {
  it('creates file on a new branch if branch does not exist')
  it('writes to non-default branch')
  it('handles branch name with slashes (feature/foo)')
  it('handles branch name with special characters')
  it('resolves default branch when ref is omitted')
})
```

### 3g. Repository visibility

**Test cases:**

```
describe('Repo visibility', () => {
  it('detects private repo (GitHub)')
  it('detects private repo (GitLab)')
  it('detects private repo (Gitea)')
  it('detects public repo (all hosts)')
  it('handles repo visibility change mid-session')
})
```

## 4. Unit test coverage for edge cases

### 4a. Mock-based unit tests for conflict handling

**New file:** `__tests__/services/git/GitHostWriteConflict.test.ts`

```
describe('GitHostWriteService conflict handling', () => {
  describe('GitHub', () => {
    it('updateFile throws GitHostConflictError on 409')
    it('deleteFile throws GitHostConflictError on 409 (stale SHA)')
  })

  describe('GitLab', () => {
    it('updateFile throws GitHostConflictError on 400 with stale SHA')
    it('getFileSha returns not-found kind on 404')
    it('getFileSha returns error kind on 500')
  })

  describe('Gitea/Forgejo', () => {
    it('updateFile throws GitHostConflictError on 409')
    it('deleteFile throws GitHostConflictError on 409 (stale SHA)')
  })
})
```

### 4b. Mock-based unit tests for network resilience

**New file:** `__tests__/services/git/GitHostWriteNetwork.test.ts`

```
describe('GitHostWriteService network resilience', () => {
  describe('GitLab', () => {
    it('retries on 500')
    it('retries on 502')
    it('retries on 503')
    it('gives up after 3 retries')
    it('does not retry on 401')
    it('does not retry on 404')
    it('does not retry on 409 (conflict)')
  })

  describe('Gitea/Forgejo', () => {
    // Same pattern
  })
})
```

### 4c. Mock-based unit tests for token handling

**New file:** `__tests__/services/git/GitHostWriteAuth.test.ts`

```
describe('GitHostWriteService auth', () => {
  it('GitLab: setToken probes /user and caches result')
  it('GitLab: setToken with invalid token returns null user')
  it('Gitea: setToken probes /user and caches result')
  it('Gitea: setToken with invalid token returns null user')
  it('GitHub: delegates to GitHubService auth')
  it('write operations fail fast when token is invalid')
  it('token can be cleared and re-set')
})
```

## 5. Rollback plan

### 5a. Feature flag rollback

The `FEATURE_USE_MULTI_HOST_WRITE` flag is the single point of control.
Rollback is a one-line change:

```ts
// src/services/featureFlags.ts
export const FEATURE_USE_MULTI_HOST_WRITE = false;
```

This restores all sync services to their original GitHub-only code paths.
The `GitHostWriteService` interface and implementations remain in the
codebase but are not called.

### 5b. Rollback procedure

1. **Immediate rollback** (production issue):
   - Set `FEATURE_USE_MULTI_HOST_WRITE = false`
   - Run `npx tsc --noEmit` to verify no compile errors
   - Run `npx jest` to verify all tests pass
   - Deploy

2. **Full rollback** (remove feature):
   - Revert the feature flag change
   - Optionally revert the interface additions in `GitHost.ts`
   - Optionally revert the write method implementations in host services
   - Note: the read-only `GitHostService` interface is unaffected and
     should NOT be reverted (it's already in use by the repo picker).

### 5c. Rollback verification checklist

| Check | How |
|---|---|
| Note sync works with GitHub | Run `npx jest NoteGitHubSyncService` |
| Canvas sync works with GitHub | Run `npx jest CanvasGitHubSyncService` |
| Todo sync works with GitHub | Run `npx jest TodoGitHubSyncService` |
| Template sync works with GitHub | Run `npx jest template-github-sync` |
| Render style works with GitHub | Run `npx jest RenderStyle` |
| Repo pull works with GitHub | Run `npx jest RepoPullService` |
| All existing tests pass | Run `npx jest` |
| TypeScript compiles | Run `npx tsc --noEmit` |

### 5d. Gradual rollout strategy

If desired, the feature flag can be made dynamic (runtime) instead of
compile-time:

```ts
// Alternative: runtime flag via AsyncStorage
export async function isMultiHostWriteEnabled(): Promise<boolean> {
  const val = await AsyncStorage.getItem('@gitnotes:multi_host_write');
  return val === 'true';
}
```

This allows enabling the feature per-user or per-device without a
redeploy. The compile-time constant is simpler and sufficient for the
initial rollout; the runtime flag can be added later if needed.

## 6. Documentation updates

### 6a. AGENTS.md updates

Add to the "Feature Checklist" section:

```markdown
11. `GitHostWriteService` interface implemented in `GitHostService` impl
12. `parseRepoPath()` returns `provider` for host dispatch
13. `FEATURE_USE_MULTI_HOST_WRITE` flag guards new code paths
14. Integration tests in `__tests__/integration/`
```

Add to the "Stack" section:

```markdown
- Git: isomorphic-git (clone mode), GitHub/GitLab/Gitea/Forgejo REST API (api mode)
```

Add a new section on multi-host write:

```markdown
### Multi-Host Write Support

- `GitHostWriteService` interface in `src/services/git/GitHost.ts` defines write
  operations (getFileSha, updateFile, deleteFile, uploadBinaryFile, getRepoPrivacy)
- All 4 host services (GitHub, GitLab, Gitea, Forgejo) implement the interface
- Sync services use `getGitHostService(provider)` for host-aware dispatch
- Feature flag: `FEATURE_USE_MULTI_HOST_WRITE` in `src/services/featureFlags.ts`
- Author resolution: `resolveSyncAuthor()` in `src/services/git/syncAuthorResolver.ts`
- Integration tests: `__tests__/integration/multi-host-write.integration.test.ts`
```

### 6b. README updates

Add to the feature list:

```markdown
- ✅ Multi-host Git support: GitHub, GitLab, Gitea, and Forgejo
- ✅ Read and write operations across all supported hosts
- ✅ Automatic host detection from repo URL
```

### 6c. `.env.example`

Create `.env.example` (see Section 1c).

### 6d. Inline documentation

Add JSDoc to the `GitHostWriteService` interface:

```ts
/**
 * Write operations supported by every git host.
 *
 * Every implementation of `GitHostService` MUST also implement these
 * methods. The sync stack uses them for create/update/delete of files
 * in API mode.
 *
 * ## Error handling
 * - 409 Conflict → `GitHostConflictError` (caller should retry with fresh SHA)
 * - 401/403    → Auth error (caller should re-authenticate)
 * - 5xx        → Retried automatically (up to 3 attempts with backoff)
 * - 404        → File not found (returned as `null` from `getFileShaOrNull`)
 */
```

## 7. Test coverage targets

| Component | Unit tests | Integration tests |
|---|---|---|
| `GitHubHostService` (write) | 8 tests | 10 tests |
| `GitLabService` (write) | 10 tests | 8 tests |
| `GiteaLikeHostService` (write) | 8 tests | 6 tests |
| `NoteGitHubSyncService` (multi-host) | 6 tests | 12 tests |
| `CanvasGitHubSyncService` (multi-host) | 4 tests | 8 tests |
| `TodoGitHubSyncService` (multi-host) | 4 tests | 8 tests |
| `TemplateGitHubSyncService` (multi-host) | 4 tests | 8 tests |
| `RenderStyleService` (multi-host) | 4 tests | 8 tests |
| `RepoFileSyncService` (multi-host) | 4 tests | 4 tests |
| Conflict handling | 6 tests | 4 tests |
| Network resilience | 8 tests | 2 tests |
| Auth edge cases | 6 tests | 4 tests |
| **Total** | **~72 tests** | **~82 tests** |

## 8. Files created / modified (summary)

| File | Action | Description |
|---|---|---|
| `__tests__/integration/multi-host-write.integration.test.ts` | **New** | Live integration suite across all 4 hosts |
| `__tests__/services/git/GitHostWriteConflict.test.ts` | **New** | Mock-based conflict/error tests |
| `__tests__/services/git/GitHostWriteNetwork.test.ts` | **New** | Mock-based retry/network tests |
| `__tests__/services/git/GitHostWriteAuth.test.ts` | **New** | Mock-based auth edge case tests |
| `.env.example` | **New** | Template for integration test credentials |
| `src/services/git/rateLimitHandler.ts` | **New** | Shared rate-limit handling (extracted from GitHub) |
| `AGENTS.md` | Update | Multi-host write section + checklist |
| `README.md` | Update | Feature list |
| `.gitignore` | Update | Add `.env` (if missing) |

## 9. Execution order

1. Create `.env.example` and update `.gitignore`
2. Create helper utilities (`rateLimitHandler.ts`, `GitHostConflictError`)
3. Write mock-based unit tests (conflict, network, auth)
4. Write integration test suite skeleton with env-var gating
5. Implement integration tests for Note sync (all 4 hosts)
6. Implement integration tests for Canvas sync (all 4 hosts)
7. Implement integration tests for Todo sync (all 4 hosts)
8. Implement integration tests for Template sync (all 4 hosts)
9. Implement integration tests for Render style (all 4 hosts)
10. Implement feature flag integration tests
11. Update AGENTS.md and README.md
12. Run full test suite: `npx jest && npx tsc --noEmit`

## 10. Known risks

| Risk | Mitigation |
|---|---|
| Integration tests modify real repos | Use dedicated test repos with test branches, clean up after each run |
| Token leakage in CI | Never commit tokens; integration tests only run when env vars are set |
| Rate limiting during integration tests | Run tests sequentially (`--runInBand`), add delays between host blocks |
| Gitea/Forgejo test repos unavailable | Tests skip gracefully when credentials are missing |
| Self-hosted instance APIs differ | Tests use default `gitlab.com` / `gitea.com` / `codeberg.org`; self-hosted is a separate config concern |
| Integration test run time | Target < 5 minutes for full suite; use `--runInBand` to avoid rate limits |