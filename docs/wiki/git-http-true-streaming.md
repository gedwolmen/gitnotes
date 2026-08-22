# gitHttp True Streaming — Lazy Chunk Yield (#1021)

> Large clones were slow on simulator/iPhone (10min+ vs 20s on Mac) and could appear stuck. The `gitHttp` client read the entire response body eagerly — collecting every chunk into memory before yielding anything — so the consumer (isomorphic-git) received its first byte only after the whole packfile had arrived, and the client held a second full-size copy on top of the network buffers.

## Root cause

`src/services/git/gitHttp.ts` `request()`:

1. Fetched the response.
2. **Eagerly read the entire body** via `reader.read()` in a loop, pushing every chunk into a `chunks` array.
3. Only then returned `body: yieldChunks(chunks)` — the async iterator that isomorphic-git consumes.

The whole packfile was therefore buffered in the JS heap *before* the consumer got a single byte, and the clone's perceived latency = network time + our buffering time, on top of isomorphic-git's own internal `collect()`.

## Change

`src/services/git/gitHttp.ts`:

1. New `streamResponseBody(reader, controller, timeoutId, timeoutMs, url)` — a **lazy async generator** that reads from the reader one chunk at a time, yielding each chunk as the consumer pulls (`for await`). Nothing is accumulated in `request()`.
2. The streaming branch returns `body: streamResponseBody(...)` and **resolves immediately after the fetch headers arrive**; the first byte flows to the consumer as soon as the network delivers it.
3. Timeout/cancel semantics preserved: the same `AbortController` + timeout drive the fetch *and* the lazy read; the generator's `finally` clears the timeout and releases the inflight-controller handle (so `cancelInflightGitHttp()` from #1013 keeps working mid-stream — a stuck body read aborts and throws `cancelled by user`).

The non-streaming `arrayBuffer()` fallback is unchanged (`yieldOnce`).

| Risk | Reversible | Verified |
|---|---|---|
| Medium-low — the body is now consumed lazily; the timeout window now covers fetch + consumption (same total bound). Abandoned iterators leave a timer armed until it fires (harmless). | Yes | `__tests__/services/git/gitHttp.test.ts` (9/9: streaming merge, chunk granularity, arrayBuffer fallback, read-error cancel, abort timeout, push/download timeouts, cancel-in-flight, **new Case G: zero reads until the consumer pulls**) + all `__tests__/services/git` (140/140) |

## Notes

- True *disk-backed* streaming (write the packfile to a temp file and index from disk) is still blocked by isomorphic-git 1.40.0's internal `Buffer.from(await collect(response.packfile))` — tracked in the #982 wiki (`git-http-packfile-buffering.md`) as a follow-up requiring a `patch-package` on the library.
- The cancel-escape for a stuck clone was already delivered by #1016 (PR #1024) via the same abort hook.

## Verification

```bash
yarn jest __tests__/services/git/gitHttp.test.ts --no-coverage --forceExit
yarn ts:check
```
