# gitFs Write-Path Text Fast Path — #986

> Close the remaining base64 round-trip: the read side already had an extension-based UTF-8 fast path; the write side still base64-encoded **every** `Uint8Array` payload, including plain-text notes/canvases/todos written by `git.checkout`/`git.fastForward`.

## Before

`gitFs.ts` `writeFile(filepath, data)`:

- `string` data → text write (utf8) — already fast
- `Uint8Array` data → `bytesToBase64Async` → `writeAsStringAsync(uri, b64, { encoding: Base64 })` — **always**, regardless of file type

isomorphic-git hands the working-tree blobs to checkout as `Uint8Array`, so every `.md` / `.norg` / `.org` / `.txt` / `.json` file materialised during clone/pull went through the base64 encode → bridge → decode round-trip.

## Change

`src/services/git/gitFs.ts` — `writeFile` gains a `else if (isTextExtension(filepath))` branch between the string path and the binary path:

1. If `TextDecoder` is available, decode the payload with `new TextDecoder('utf-8', { fatal: true })`.
2. Valid UTF-8 → `FileSystem.writeAsStringAsync(uri, text)` (text path, no base64).
3. **Fatal decode guarantees byte-exactness**: non-UTF-8 payloads (e.g. a binary file whose name ends in `.md`) throw, the branch falls through to the existing base64 path, and the on-disk bytes match the input exactly. No silent `U+FFFD` rewriting.

`isTextExtension` (allowlist: `md`, `markdown`, `norg`, `org`, `txt`, `json`) was already defined and used by `readFile` — this reuses it.

| Risk | Reversible | Verified |
|---|---|---|
| Low — byte-exact by construction (`fatal: true` + base64 fallback) | Yes | `__tests__/services/git/gitFs.test.ts` — new: utf8-byte write round-trips as string; non-UTF-8 bytes to `.md` store as base64 and decode to identical bytes |

## Notes

- LFS pointer placeholder files are ASCII text (~130 B) but carry binary-looking extensions (`.png`, `.psd`, …) → not in `TEXT_EXTS` → unchanged base64 path. `LfsService.scanRepo` reads via `expo-file-system` directly, so pointer detection is unaffected.
- `.git/` object files are extensionless → binary path → unchanged.
- `maybeYield()` is preserved on every branch.

## Verification

```bash
yarn jest __tests__/services/git/gitFs.test.ts --no-coverage --forceExit
yarn ts:check
```
