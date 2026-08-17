# Git Core Hardening

Fixes from the git-core test campaign (issues #876–#892) — data-integrity, auth, sync, and pull-layer defects found by the live test harness.

## Data integrity

### #891 — base64 chunked decode dropped bytes over ~49KB (HIGH)

`base64ToBytesAsync` (`src/services/git/gitFs.ts`) advanced the loop cursor twice: the for-loop header stepped by `CHUNK_CHARS` and the body also set `i = alignedEnd - 1`. With a non-4-aligned chunk size that left a ~65534-char undecoded gap between chunks, so binary blobs larger than ~49KB came back truncated/corrupt and the corrupt blob is what got pushed.

Fix: `CHUNK_CHARS` is now 65532 (a multiple of 4, so every chunk boundary is base64-aligned) and the body no longer rewrites the cursor. The decode loop now tiles the input exactly.

### #892 — case-collision paths clobbered on case-insensitive filesystems (MEDIUM)

On APFS/NTFS, two distinct virtual paths that differ only by case (`notes/Foo.md` vs `notes/foo.md`, or repos `Foo/bar` vs `foo/Bar`) map to the same on-disk URI, so the second write silently clobbers the first. Git stores both blobs fine; the working tree was corrupt.

Fix: `makeGitFs` keeps a per-root map of lowercased URI → first-seen canonical spelling. `readFile`/`writeFile` (plus `mkdir`/`readdir`/`stat`) throw `FsError('EEXIST', 'case-collision: …')` when a variant path is touched — the clobber is now loud and diagnosable instead of silent.

## Auth & access

### #876 — false-negative write preflight for fine-grained PATs (MEDIUM)

`preflightGitHubRepoAccess` decided write capability from the `x-accepted-github-permissions` header or `permissions.push`. Fine-grained PATs only ever advertise `metadata=read` on `GET /repos` even when they can write, so a write-capable token was reported `write_unverified`.

Fix: when the header/`permissions.push` check is inconclusive, the preflight performs a real probe — `PUT` a scratch file under `.gitnotes-preflight-<ts>.tmp` and best-effort `DELETE` it. Success ⇒ `ok: writeVerified`; 401/403/404 ⇒ `no_access`; 429/5xx ⇒ `transient`.

### #877 — default-branch resolution 404'd on private repos (HIGH)

`fetchGitHubDefaultBranch` sent no `Authorization` header, so private repos 404'd and fell through to the hardcoded `'main'` fallback — wrong for any private repo whose default branch isn't `main`.

Fix: the GitHub fetch now sends `Authorization: Bearer <token>` (via `AuthService.getToken()`; verified no import cycle), keeping the null-on-error contract.

### #878 — `parseRepoPath` failed trailing-slash `.git` and SSH scp formats (LOW)

Two common GitHub clone-dropdown pastes mis-parsed: `owner/repo.git/` kept the `.git` (no `.git$` match at the `/`), and `git@github.com:owner/repo.git` folded the scp prefix into the owner. Both 404'd downstream.

Fix: normalize by trimming trailing slashes first, strip optional `git@host:` scp prefixes (`git@host:owner/repo` and `ssh://git@host/owner/repo`), then the existing `.git`/URL-prefix cleanup — with segment validation and a variant-table test.

## API-mode sync

### #883 — `getFileContent` returned null for empty files (LOW)

The truthy `data.content` gate treated an empty file (`content === ''`) as missing, giving false-negative existence checks.

Fix: gate on `data.type === 'file' && typeof data.content === 'string'` (empty string is a valid file).

### #884 — `createFile` swallowed 401s → infinite retry loop (MEDIUM)

`createFile` caught all errors, logged and returned null; the queue classifier saw `'GitHub API returned no result'` with no status, classified it retryable-unknown, and retried forever with no terminal failure surfaced.

Fix: `createFile` now rethrows HTTP errors with their status/message so the queue classifier gets a real 401 and drops the mutation durably. `createFolder`/`moveFile` wrap the call to preserve their null/false-on-failure contracts.

### #881 — `updateFile` 409 divergence was silent (MEDIUM)

A stale-sha PUT → 409 → upstream content differs → `updateFile` returned null, which collapsed to the generic `'GitHub API returned no result'` — the conflict never reached the user.

Fix: the divergence branch now throws a typed `status: 409` error (`upstream-content-changed, pull to resolve`) so `syncNoteToGitHub` maps it to `conflict-detected` and the UI can suggest a pull.

### #880 — sync queue dedup keyed by title instead of path (LOW)

Two upserts for the same `(repo, branch, filePath)` with different titles (a rename) both survived in the queue and flushed as 2 writes.

Fix: same-path upserts now collapse regardless of title — latest enqueue wins.

### #888 — API-mode batch writes (HIGH perf)

API mode drained N upserts as N serial GET(sha)+PUT round trips (~16× slower than clone mode's single push). The batch machinery for deletes already existed in `BatchGitOperations`; upserts now use it too.

Fix: `batchUpsertFiles` builds ONE Git-Data commit per (repo, branch) group — parallel blob creation, `createTree` with `base_tree` (parents derived automatically), one commit, one ref update, retried on branch-moved, falling back to per-file writes on terminal failure. The queue wires it for ≥2 eligible upserts (eligible = no `knownSha` guard needed and no local-image URIs that require the per-item upload rewrite).

### #882 — `syncNoteToGitHub` couldn't create a missing remote file with explicit filePath (MEDIUM)

`updateFile` was called with `expectExists: !!filePath`, but the editor sets filePath for new AND updated notes — so a first-write with an explicit path aborted against the resurrection guard.

Fix: the create-vs-update intent computed from the probe (`useUpdateVerb`) is now passed through as `expectExists`.

### #890 — clone-mode existence probe warned on NotFoundError for derived paths (LOW)

AI upserts that omit `filePath` derive the path at sync time; the clone probe (`GitFsService.readFile`) throws `NotFoundError` for a not-yet-pushed path, which logged a warning per upsert and degraded the commit verb to "Create note:".

Fix: the probe catch treats NotFound-style errors (`code === 'NotFoundError'` or message match) as `fileExists = false` silently.

## Clone-mode sync

### #889 — AI `edit_note` never enqueued a sync (MEDIUM)

The `edit_note` tool edited only locally — `updateNote` neither enqueued nor staged, so the edit never reached git in either mode (silent divergence).

Fix: the auto branch now enqueues a `NoteUpsert` for the updated note when a chat-repo context is set, mirroring `grade_questioner_answers`.

### #879 — phantom "(unpushed commits)" row when local is strictly behind (HIGH, false push state)

`listStaged` emitted the synthetic unpushed row whenever `localOid !== remoteOid` — including when origin descended from local (nothing to push).

Fix: the row is gated on `localOid !== mergeBase && localOid !== remoteOid`, mirroring `LocalGitWriter.hasUnpushedLocalCommits`.

### #885 — nested todos/canvases never pulled (MEDIUM)

`fetchDirectoryFiles` listed only direct children, so `todos/nested/foo.json` / `canvases/nested/bar.json` were never pulled in either mode.

Fix: todos/canvases now route through the same mode-aware reader as notes — recursive tree in API mode, local clone in clone mode — filtered by the `dirPath/` prefix, fetched with bounded concurrency.

### #886 — deleted remote canvases persisted locally (MEDIUM)

The canvas reconcile was disabled because local canvases without remote backing could be unsaved edits. Result: deleting a canvas's remote file never removed it locally.

Fix: canvases track `lastPulledScene` at pull time; reconcile drops a remote-origin canvas when its file is gone **and** its scene still matches the last pulled state. A locally-edited canvas (scene drift) or a local-only draft is kept.

### #887 — depth-1 clone made merge-base detection unreachable (LOW)

`findMergeBase` needs ≥2-3 commits of shared ancestry; the default `depth: 1` clone (and the equally shallow fetches) silently disabled divergence-conflict recording.

Fix: `fetch` and `pullWithFastForward` never fetch shallower than 3 commits (`MIN_DIVERGENCE_HISTORY_DEPTH`), so after the first pull cycle merge-base-based conflict detection is reachable. The initial clone stays shallow by design.