# Metro Watch — Exclude Dogfood Output from Rebuild Triggers (#1023)

> During dogfood/QA sessions, tapping UI elements (Sync, Add note) appeared to trigger Metro/native rebuilds (30-60s each), making testing impractical. Root cause: the QA tool writes a screenshot/video/trace into `dogfood-output/` on **every interaction**, and that directory lives **inside the Metro watch root** — so each tap produced a new file the bundler's watcher treated as a project change.

## Root cause

`metro.config.js`:

- `watchFolders: [__dirname]` — Metro watches the whole project root.
- `blockList` excluded `.worktrees/` and `.claude/worktrees/` but **not** `dogfood-output/`.

The agent-device dogfood harness writes `dogfood-output/screenshots/…` (plus `traces/`, `videos/`) during a test session. Every UI interaction creates a new artifact → Metro's file watcher sees a new file in the watched root → re-scans / triggers rebuild churn.

## Change

`metro.config.js` — added `/.*\/dogfood-output\/.*/` to `resolver.blockList` so Metro neither watches nor scans the test-artifact directory (mirrors the existing `.worktrees` exclusion).

`.gitignore` — added `dogfood-output/` (test artifacts should never be committable).

| Risk | Reversible | Verified |
|---|---|---|
| None — Metro's blockList only excludes a volatile artifacts dir; no source/bundling behavior changes | Yes | `node -e "require('./metro.config.js')"` loads; blockList now 3 entries |

## Notes

- If the rebuild is *also* driven by the QA harness re-invoking `expo run:ios` (e.g. after a force-quit), that part is tooling-side; this fix removes the Metro watcher churn from artifact writes.
- `.worktrees/` was already excluded for the same reason (agent worktrees churn the watch root).

## Verification

```bash
node -e "require('./metro.config.js')"
# then start the dev server: files under dogfood-output/ no longer trigger watch events
```
