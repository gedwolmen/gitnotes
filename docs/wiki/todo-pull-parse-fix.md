# Todo Pull Parse Errors — Silent Data Loss Fix (#1008)

> `RepoPullService.pullTodosFromRepo` caught todo JSON parse failures with a bare `console.warn` and skipped the file — the only signal was a dev-only Metro log line. Any todo the parser couldn't handle was silently absent from the local store: "the todo I created on my other device doesn't show up here" with no error anywhere.

## Root cause

Every blob under `todos/` with a `.json` extension went straight into `JSON.parse(file.content)` without checking whether the content was actually a JSON todo payload. Files that are markdown/frontmatter (but happen to carry a `.json` extension), partial uploads, or empty content threw `SyntaxError: JSON Parse error: Unexpected character:`. The `catch` logged at `warn` level (dev-only, no file path) and `continue`d — the file was counted as neither parsed nor pulled, and no counter or summary existed.

## Change

`src/services/RepoPullService.ts` → `pullTodosFromRepo`:

1. **Content guard before parsing** — the trimmed content must start with `{` (the canonical payload is JSON serialized by `TodoGitHubSyncService` as `todos/<slug>.json`). Non-JSON content (markdown/frontmatter, arrays, empty/partial uploads) is skipped **silently** — it is not a todo in this app's schema, so it is not an error condition. This kills the repeated WARN spam for every non-JSON file.
2. **Error-level logging with the file path** — a genuine parse failure on a `{`-prefixed file now logs `console.error` with `todos/<file>.json` in the message, so the failing file is identifiable in production Metro/device logs.
3. **Skipped counter + aggregate summary** — failures increment `skipped`; after the loop a `console.warn` reports `Skipped N malformed todo file(s) in todos/` so a pull that silently lost todos is at least visible at a glance.

Reconcile behavior is unchanged: the remote path is added to `remotePaths` before parsing, so a malformed remote file still protects the existing local todo from being dropped (no local data loss).

| Risk | Reversible | Verified |
|---|---|---|
| Low — valid-JSON pull path unchanged; only non-JSON content is now skipped instead of logged, and genuine failures are logged louder | Yes | `__tests__/services/RepoPullService.todo-parse.test.ts` (6/6: valid pull, malformed skip + error log w/ path, silent markdown skip, silent array skip, no-data-loss reconcile, skip summary) |

## Notes

- The canonical todo format is JSON only (`serializeTodo` in `TodoGitHubSyncService`). YAML-frontmatter files under `todos/` are out-of-schema and intentionally skipped, matching the issue's suggested fix ("only parse files that match the JSON schema, skip the rest").
- The "surface to Settings → Sync" indicator from the issue is tracked as a possible follow-up; this pass delivers error-level logging + aggregate counts so the failure is no longer invisible.

## Verification

```bash
yarn jest __tests__/services/RepoPullService.todo-parse.test.ts --no-coverage --forceExit
yarn ts:check
```
