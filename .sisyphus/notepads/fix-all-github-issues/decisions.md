## Decisions
- Shared todo ordering now lives in `src/models/Todo.ts` via `compareTodos`/`reorderTodos` so the screen, store refresh path, and repo pull path all use one stable ordering rule.
- Todo completion now persists the reordered list after toggle and syncs repo-backed todos to GitHub before refreshes, which keeps pull-to-refresh from reintroducing stale completion state.
