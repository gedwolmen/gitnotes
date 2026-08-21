# Push Button Missing After Updating Folder-Backed Notes

> Fix: `LocalGitWriter` now normalizes leading-slash `filePath`s so folder-backed note/canvas/todo updates produce a real local commit and the floating push button appears.

## Symptom

In clone mode, after **updating** a note (or any git-hosted item) that lives in a **folder**, the floating push button does not appear — the change never surfaces as staged. Creating a new note in the repo root (`notes/foo.md`) and deleting notes worked, which made the update path look like the odd one out.

## Root cause

The note/canvas editors build a file path from `folderPath`, which carries a **leading slash**:

- `folderPath` = `'/notes'` (folder model paths start with `/`)
- `syncPath` = `existingFilePath ?? \`${folderPath}/${slug}\`` → `'/notes/foo.md'`

`StagingService.stageUpsert` forwards that path verbatim to `LocalGitWriter.writeAndCommit`. Two things then went wrong:

1. **On-disk write diverges from the git path.**
   - `writeAsStringAsync` wrote to `…/GitNotes/owner/repo//notes/foo.md` (double slash — `dir + '/' + '/notes/foo.md'`).
   - `git.add`/`git.status` read `…/GitNotes/owner/repo/notes/foo.md` (single slash — isomorphic-git joins `dir` + normalized relative path).
   - The new content never landed where git looked, so git saw the *original* HEAD content.

2. **isomorphic-git rejected the absolute path.**
   - `git.add({ filepath: '/notes/foo.md' })` threw `path should be a \`path.relative()\`d string, but got "/notes"`.
   - `writeAndCommit` returned `{ success: false, error: … }` → **no local commit created** → `StagingService.listStaged()` found no unpushed commit for the repo → `pendingCount` stayed `0` → `FloatingStageButton` returned `null`.

Root-level notes (`notes/foo.md`, no leading slash) never hit this, which is why "add works, update doesn't".

## Fix

`src/services/git/LocalGitWriter.ts` — new `toRepoRelativePath()` strips leading slashes from `filePath` at the writer boundary (the single choke point between app paths and isomorphic-git's repo-relative paths). Applied in:

- `writeAndCommit` — path used for `absVirtual`/`absUri`, `ensureParentDirs`, `git.add`, `git.status`, and the corruption-replay branch.
- `deleteAndCommit` — path used for `absUri`, `git.remove`, and the replay branch.

The stored note metadata is unchanged (`/notes/foo.md` remains the display path); only the git boundary normalizes.

## Verification

`__tests__/services/git/localGitWriter.real-repo.test.ts` runs the **real** isomorphic-git pipeline against the project's `gitFs` adapter (in-memory expo-file-system) — no git mocks — and asserts:

- UPDATE of a tracked file produces a commit (HEAD advances past `refs/remotes/origin/main`).
- UPDATE with a leading-slash `filePath` (`/notes/foo.md`) still commits.
- ADD with a leading-slash `filePath` still commits.

`yarn ts:check`, `yarn eslint`, and the git/StagingService/editor/stageStore suites all pass.

## Related

- [#925](https://github.com/gedwolmen/gitnotes/issues/925) — clone staging never surfaced the push button (fixed by emitting `notifyStagedChanged`); this fix covers the folder-backed-update failure mode that slipped past it.
