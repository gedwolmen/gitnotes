# Filter Persistence

Notes and todos retain list filters across app restarts with AsyncStorage keys in the `@gitnotes:filters:` namespace.

- Notes list: `@gitnotes:filters:notes-list`
- Todo entity filters: `@gitnotes:filters:todo-entity`
- Todo list filters: `@gitnotes:filters:todo-list`
- Todo completed visibility: `@gitnotes:filters:todo-completed`

The filter hooks load persisted values before writing changes, so initial empty state never replaces stored selections during hydration. Invalid stored JSON leaves the configured initial filters in place.

## Filter bar UI

Active filters render as a horizontally scrolling chip row in `FilterBar.tsx` (used by the Todo and Notes screens). Layout rule:

- The `ScrollView` `contentContainerStyle` (`styles.row`) uses `paddingHorizontal: 12` so on load the first chip is inset from the left edge; the row stays scrollable so the user can swipe chips to the screen edges. The outer wrapper keeps `marginHorizontal: 0`.

Tests: `__tests__/filter-bar-edge.test.tsx` asserts the scroller carries symmetric side padding while the outer wrapper stays margin-free.
