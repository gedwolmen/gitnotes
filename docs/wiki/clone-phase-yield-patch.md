# Clone-Phase Freeze — isomorphic-git Yield Patch

The add-repo clone of a large repo (e.g. `vidwadeseram/notes`, ~112MB pack)
still froze the app even after the [render-storm throttle](./add-repo-picker-clone-progress.md)
and [pull-phase yields](./add-repo-progress-live-pull.md) landed: the JS thread
saturated at 75–100% CPU while isomorphic-git indexed the downloaded pack, so
taps and Cancel didn't register for ~90 seconds. Live QA (F3) on the real
`notes` repo reproduced the original user symptom — "scrollable but can't click
anything".

## Root cause

`GitFsService.clone` → isomorphic-git `git.clone` downloads the pack, then
`_indexPack` reads the **whole pack** into memory
(`fs.read(filepath)`) and runs `GitPackIndex.fromPack` — parsing/inflating every
object **CPU-bound on the JS thread with no macrotask yield**. `gitHttp`
(`src/services/git/gitHttp.ts`) streams the download but isomorphic-git collects
the body fully anyway (`Buffer.from(await collect(res.body))`), so chunked
download yields do not help.

`yieldToMain` (the pull-phase fix) only wired the **pull** path
(`fetchInBatches` + upsert loop). The **clone** path had no yield seam at all.

## Fix: patch isomorphic-git to yield during pack parsing

A dependency patch (via `patch-package`) inserts a macrotask yield — the same
`new Promise(resolve => setTimeout(resolve, 0))` primitive as `yieldToMain` —
every 256 objects inside `GitPackIndex.fromPack`'s CRC loop and its delta/object
decode loop. The JS thread yields to RN's render + touch dispatch between pack
chunks, so the UI stays tappable during the clone.

- `patches/isomorphic-git+1.40.0.patch` — the index.js patch (2 yield sites).
- `scripts/patch-isomorphic-git-umd.js` — the same one-liner applied to the
  pre-bundled `index.umd.min.js` build.
- `package.json` `postinstall`: `patch-package && node scripts/patch-isomorphic-git-umd.js`.
- `__tests__/patches/patch-package.test.ts` — CI guard: runs
  `patch-package --error-on-fail` and fails loudly if an isomorphic-git upgrade
  ever stops the patch from applying.

**Zero logic change**: the patch only inserts `await` yields. The same pack
parses to identical object ids — verified by cloning `vidwadeseram/test-notes`
with the patched isomorphic-git and comparing the resulting HEAD oid
(`a3ad6d8d…`) against a reference clone.

## Companion fix: corruption-classifier over-match

During live QA the add-time import pulled **zero contents** for `notes`. Root
cause: the app's corruption classifier matched
`/Could not find|not foundobject|NotFoundError|Packfile trailer mismatch/`, and
isomorphic-git's *config* error `Could not find a fetch refspec for remote
"origin"` contains "Could not find" — so a concurrent interval pull during the
in-flight clone was misclassified as pack corruption and triggered a destructive
`removeRepo` + re-clone that wiped the checkout.

Fix: tightened all 7 classifier sites to require `Could not find object`
(`RepoPullService.ts`, `LocalGitWriter.ts`, `GitFsService.ts`,
`NoteGitHubSyncService.ts`). The config error now propagates as a normal pull
failure; the clone completes and the working tree lands.

## Tests

- `__tests__/patches/patch-package.test.ts`: guard — the isomorphic-git patch
  re-applies cleanly (CI breaks on upgrade drift).
- Existing clone/pull suites (`gitFsService.*`, `RepoPullService.*`,
  `localGitWriter`, `NoteGitHubSyncService`) — 26 tests pass with the patch and
  tightened classifiers.
- Full suite: `yarn ts:check` clean; `yarn eslint` 0 errors; `yarn jest` 303
  suites / 2771 tests pass.

## Live QA (F3 re-run, real `notes` repo)

- Clone stays responsive: progress UI animates ("Cloning notes" →
  "Reading repository…"), Cancel remains tappable, the 90s dead-tap freeze is
  gone.
- Clone completes with the full working tree; local HEAD matches remote
  (`5fe05969…`); remote repo untouched.
- Separate finding (tracked as its own issue): importing a very large repo
  (112MB, thousands of files including images) can exhaust the Hermes JS heap
  during the post-clone import phase (SIGABRT, `GCBase::oom`). The clone-phase
  freeze fix here does not address that import-phase memory bug.
