# Todo Pull — Parse Resilience & Surface Skipped Files (#1008)

> `pullTodosFromRepo` JSON.parses every `.json` file under `todos/` and previously swallowed failures with a dev-only `console.warn` — a frontmatter/markdown file (from other tools) or a corrupted `.json` vanished silently, leaving the todo absent locally with no signal. Multi-device sync broke silently.

## Root cause

- Todos are written by the app as `todos/<slug>.json` with **pure JSON** (`TodoGitHubSyncService.serializeTodo` → `JSON.stringify`). No frontmatter.
- `pullTodosFromRepo` (`src/services/RepoPullService.ts`) filtered to `.json` files but called `JSON.parse(file.content)` unconditionally. Any `.json` whose content was not valid JSON (frontmatter-prepended, markdown, empty, BOM) threw → caught → skipped with only a dev-mode warn.
- Files in `todos/` that don't end in `.json` (e.g. `.md` from another tool) were silently ignored entirely.
- Result: the todo is missing from the local store, no retry, no user-visible feedback — data appears lost (it isn't; the file is still on the remote).

## Change

`src/services/RepoPullService.ts` — in the todo pull loop:

1. **Content detection** — the content is trimmed (also strips a BOM) and must start with `{` or `[` to be parsed. Non-JSON content is skipped and counted.
2. **Error-level logging with the file path** — a JSON.parse failure on `{`/`[`-starting content logs `Failed to parse todo JSON (<path>):` at `console.error`, not `warn`.
3. **Skip summary** — after the loop, if any files were skipped, a single `Skipped N todo file(s) with invalid JSON content: <paths>` is logged at error level, so a silent data-loss event is at least observable in the logs.

Deliberately **not** added: YAML-frontmatter parsing. The canonical todo format is JSON (`serializeTodo`); the app should never write frontmatter todos, so importing non-JSON content as garbage would be worse than skipping it. The skip is now loud instead of silent.

## Tests

`__tests__/services/RepoPullService.todo-parse.test.ts`:

- Valid JSON todo is imported; a malformed `.json` is skipped without crashing and logs the parse error with its path.
- Non-JSON content (markdown/frontmatter) and empty `.json` files are skipped, and the summary lists both paths.
- `.md` todo files are left untouched (not imported, not counted).

```bash
yarn jest __tests__/services/RepoPullService.todo-parse.test.ts --no-coverage --forceExit
```
