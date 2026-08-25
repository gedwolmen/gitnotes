# GitNotēs — Agent Rules

> Rules for AI coding agents working in this repository.

## Worktrees (ALWAYS)

**All agent work — fixes, features, refactors, even small edits — must happen inside a git worktree. Never edit files in the main worktree's working tree directly.**

This repo regularly runs multiple agent sessions concurrently (different branches, different issues in flight). Editing the main worktree's working tree races every other session because they all serve from / commit against the same `main` working tree. The multiple times this session was blocked by "another session's uncommitted changes in main" made this rule non-negotiable.

### Workflow

```bash
# From the repo root (the main worktree):
git worktree add -b <type>/<scope>-<slug> .worktrees/<scope>-<slug> main
# e.g.  git worktree add -b fix/discard-placeholder .worktrees/fix-discard main

# Always create the worktree under .worktrees/ at the repo root — never in
# /tmp, the home directory, or anywhere outside the repo. .worktrees/ is
# gitignored so the symlink/node_modules and per-worktree state don't pollute git.

ln -sfn "$(pwd)/node_modules" .worktrees/<scope>-<slug>/node_modules
# node_modules is a 2.5 GB tree that is symlinked from main into the worktree
# so Metro (which is rooted at main) and jest (which resolves from the worktree)
# both work without a duplicate install.
```

### Rules

- **One worktree per branch.** Never branch from another worktree's branch — always branch from `main` (or the upstream you're targeting). After `git fetch origin` in the main repo, base new worktrees on the updated `origin/main`.
- **Coordinate before touching shared files.** Before editing `conflictStore.ts`, `StagePushScheduler.ts`, `LocalGitWriter.ts`, or any file another agent's `git status` shows as modified in the main working tree, check `git worktree list` and `git status` in the other worktrees. If another session has uncommitted work on the same files, wait or scope your change to a different file.
- **Metro serves from main.** The Expo dev-client connects to Metro on the main worktree's port (8081). If you need your branch code to be served by Metro (e.g. for sim surface verification), copy the changed files from your worktree into main's working tree temporarily and revert after verification — Metro cannot serve from a worktree (`.worktrees/` is in `metro.config.js`'s `resolver.blockList`).
- **Do not commit secrets / tokens / Metro debug output** — review `git diff` before committing. This applies whether you are in a worktree or not.
- **Clean up** with `git worktree remove <path>` when a branch is merged and the worktree is no longer needed. Branches are cheap to recreate.

## Testing

All tests must pass before pushing:

```bash
yarn ts:check       # TypeScript compilation
yarn jest           # Run all Jest tests
yarn eslint . --ext .ts,.tsx  # Linting
```

- **Never push failing tests.** CI runs the same suite.
- New service/hook/feature needs a test file in `__tests__/` mirroring the `src/` structure.
- Use `@testing-library/react-native` for component tests.
- Use `jest.mock()` for service dependencies, `Date.now()` mocking for cache tests.
- Run `yarn jest __tests__/specific-file.test.ts --no-coverage --forceExit` for targeted testing.

## Self-Documenting Code

- Clear names, no comments explaining obvious behavior.
- Use TypeScript strict mode — no `any` without justification.
- Keep functions short and focused (single responsibility).
- Use the existing patterns in `src/services/` as reference.

## Git Discipline

- Atomic commits with descriptive messages (imperative mood).
- No `node_modules/`, `.DS_Store`, `.env`, or build artifacts.
- Branch per feature, rebase before merging.
- Worktrees are required — see the "Worktrees (ALWAYS)" section above. The old note that said "create git worktrees inside `.worktrees/`" was too soft; the requirement is unconditional.
- `lint-staged` runs on pre-commit (ESLint + Prettier).

## Sync Architecture (Git Services) — source of truth

Every repo has a sync mode (`SyncEngineService.getMode`, `src/services/SyncEngineService.ts`, default `'clone'`, per-repo override map `@gitnotes:sync_engine_modes`). The two modes behave differently ON PURPOSE; do not "fix" one into the other:

- **Clone mode — stage-then-push (write-behind):**
  - User changes are **staged locally** (local git commit with `push:false` via `StagingService` / `LocalGitWriter`). Nothing reaches GitHub at save time.
  - Pushed only when ONE of these fires: **press-and-hold the floating push button**, a **Push / Push-all** button on the Staged Changes (Stage) screen, the **3-minute foreground idle auto-push** (`StagePushScheduler`), or the **OS background task** (small sets ≤ 10 files).
  - Until a push trigger runs, the change must be visible as staged (Stage screen + floating button count).

- **API mode — everything live (write-through):**
  - Changes **push to GitHub immediately on save/complete** — no stage-and-wait, no idle-timer dependency.
  - After a successful push, **pull** to keep local state consistent.
  - While a push or pull is in flight, **the user must not be able to make changes** (spinner / blocked UI) — no concurrent edits racing the sync operation.

Open issues tracking current gaps against this truth: #925 (clone staging never surfaces push), #927 (API mode is not write-through yet), #926 (no blocking sync UI), #938 (contents not imported on add).

## Wiki documentation

There are two documentation surfaces, and they serve different purposes:

- **`CHANGELOG.md`** (repo root) — **single-PR fixes and narrow bug-fix entries**. Grouped by date descending, one section per entry: title, area (conventional-commit prefix), 2-4 line summary, PR reference. Default location for any new fix.
- **GitHub Wiki** ([gedwolmen/gitnotes/wiki](https://github.com/gedwolmen/gitnotes/wiki)) — **the public-facing main wiki**. Architecture, services, contributor guides, feature deep-dives, post-mortems, and multi-PR campaigns. A new wiki page is appropriate only when the change crosses architectural boundaries (new service, new major feature, cross-cutting refactor) or teaches something contributors need to understand the system.

Editing the wiki: write the page in `docs/wiki/<name>.md` (this repo, source-controlled), add it to `docs/wiki/index.md`, and open a PR. The CI sync workflow (`.github/workflows/sync-wiki.yml`) mirrors `docs/wiki/` → GitHub Wiki on every merge to `main`. Manual edits on `github.com/gedwolmen/gitnotes/wiki` will be overwritten on the next sync.

Wiki documentation is part of the definition of done for **architecture-level changes only**.

## Quote Content Policy

All quotes in `src/data/philosopher_quotes.json` (the Daily Quote dataset) MUST:

- Be **accurately attributed** to the correct author, with the **correct wording** — verify against a reliable source before adding or editing. Remove or correct any misattributed quote.
- Carry a **`source`** field naming the book/essay/letter/work the quote was told or written in (e.g. `"source": "Meditations"`). Quotes with unidentifiable origin must be removed.
- Be **free of religious/sectarian content** — no references to deities, scripture, prayer, afterlife dogma, or sectarian doctrine. The dataset stays secular. A quote by a religious-figure author (Buddha, Rumi, Lao Tzu, etc.) is allowed ONLY if the quote text itself is secular, and each such retention is a conscious, documented decision.
- Come from the **curated pool**: philosophers, essayists, scientists, and writers (classical + modern). Target dataset size ≈ 500 quotes.

Every new quote added to the dataset must pass the same checks: religious-keyword scan (case-insensitive over `text` + `author`: god, jesus, christ, allah, bible, quran, lord, pray, holy, divine, sin, faith, soul, heaven, religio, spirit) + manual author review + attribution/source verification.

## Data Safety

- **Never push secrets, API keys, or auth tokens.**
- `.env` is in `.gitignore` — use `.env.example` for templates.
- Check `git diff` before committing to ensure no sensitive data.
