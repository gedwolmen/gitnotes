# gitHttp Packfile Buffering — Remove Redundant Copy (#982)

> `gitHttp.request` read a large clone/fetch response in streaming chunks but then merged them all into **one contiguous `Uint8Array`** before handing the body to isomorphic-git — a second full-size copy of the packfile held in the JS heap on top of the chunks already collected. On memory-constrained devices (iOS simulator, older phones) a multi-hundred-MB initial clone could exhaust the heap.

## Root cause

`src/services/git/gitHttp.ts` (the isomorphic-git `HttpClient`):

1. `response.body.getReader()` streams the network body in chunks (the #790 fix) — good.
2. **But** the chunks were then merged via `new Uint8Array(total)` + `set()` into one buffer, and the body was wrapped in `yieldOnce(bytes)` — a single yield of the merged buffer.
3. Peak memory therefore held **two** full packfile copies (the chunk array + the merged buffer), plus whatever isomorphic-git itself needs.

## Why not stream to a temp file (the issue's suggested fix)?

Verified against **isomorphic-git 1.40.0** (installed): the library itself collects the entire packfile into memory on the fetch path —

```js
// isomorphic-git index.cjs:10172 (parseUploadPackResponse)
const packfile = Buffer.from(await collect(response.packfile));
```

— with its own `TODO: ... a) NOT concatenate the entire packfile into memory ...` right above the `fs.write`. True file-backed streaming therefore requires patching isomorphic-git (its `GitPackIndex.fromPack` also reads via synchronous `pack.slice()`/`pack.byteLength`), which is a separate high-risk change against a third-party dependency. Out of scope for this fix.

## Change

`src/services/git/gitHttp.ts`:

1. New `yieldChunks(chunks)` — yields the raw read chunks in order instead of merging them.
2. The streaming branch now returns `body: yieldChunks(chunks)`; the `arrayBuffer()` fallback keeps `yieldOnce`.
3. The redundant merge (`new Uint8Array(total)` + copies) is deleted.

Net effect: peak memory for a large clone/fetch drops from ~2× the packfile size to ~1× (isomorphic-git still buffers on its side — unavoidable without patching it). Byte-for-byte identical stream content, so the #790 "Packfile trailer mismatch" fix is preserved.

| Risk | Reversible | Verified |
|---|---|---|
| Low — same bytes, same order; only chunk granularity changes (isomorphic-git's demuxers buffer partial pkt-lines across chunk boundaries) | Yes | `__tests__/services/git/gitHttp.test.ts` (5/5: streaming merge, **chunk-granularity preservation (#982)**, arrayBuffer fallback, read-error cancel, abort timeout) + all `__tests__/services/git` (136/136) |

## Follow-up

True disk-backed streaming (write chunks to `FileSystem.cacheDirectory` and index from disk) is blocked by isomorphic-git's internal `collect()` — tracked as a follow-up that would require a `patch-package` on isomorphic-git (`parseUploadPackResponse` + a file-backed `GitPackIndex.fromPack` reader). The repo already patches isomorphic-git in `scripts/patch-isomorphic-git-umd.js` postinstall, so that path is viable but deliberately out of scope here.

## Verification

```bash
yarn jest __tests__/services/git/gitHttp.test.ts --no-coverage --forceExit
yarn jest __tests__/services/git --no-coverage --forceExit
yarn ts:check
```
