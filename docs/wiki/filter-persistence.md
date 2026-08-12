# Filter Persistence

Notes and todos retain list filters across app restarts with AsyncStorage keys in the `@gitnotes:filters:` namespace.

- Notes list: `@gitnotes:filters:notes-list`
- Todo entity filters: `@gitnotes:filters:todo-entity`
- Todo list filters: `@gitnotes:filters:todo-list`
- Todo completed visibility: `@gitnotes:filters:todo-completed`

The filter hooks load persisted values before writing changes, so initial empty state never replaces stored selections during hydration. Invalid stored JSON leaves the configured initial filters in place.
