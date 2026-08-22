import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git';

// Large clone/fetch (git-upload-pack) downloads can legitimately take
// minutes on big repos, so keep the long timeout there (#790). The push
// path (git-receive-pack) uploads only local objects — a push stuck longer
// than a minute means the network is bad and the user should get an error
// instead of a 10-minute frozen spinner (#1013).
const FETCH_TIMEOUT_MS = 600_000;
const PUSH_TIMEOUT_MS = 60_000;

let inflightController: AbortController | null = null;
let userCancelled = false;

/**
 * Aborts the currently in-flight git HTTP request, if any. Used by the
 * SyncBlockOverlay cancel button so a stuck push/fetch can be escaped
 * without force-quitting the app (#1013). Returns true if a request was
 * aborted.
 */
export function cancelInflightGitHttp(): boolean {
  if (!inflightController) return false;
  userCancelled = true;
  inflightController.abort();
  return true;
}

async function* yieldOnce(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

// Yields response chunks as they were read instead of merging them into one
// contiguous buffer. isomorphic-git still collects the packfile into memory
// on its side (`Buffer.from(await collect(response.packfile))` in 1.40.0),
// but skipping our own merge removes a second full-size copy of the packfile
// from peak memory during a large clone/fetch (#982).
async function* yieldChunks(chunks: Uint8Array[]): AsyncIterableIterator<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function consumeBody(
  body: GitHttpRequest['body'],
): Promise<Uint8Array | undefined> {
  if (!body) return undefined;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body as Iterable<Uint8Array> | AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  let total = 0;
  for (const c of chunks) total += c.length;
  const merged = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    merged.set(c, off);
    off += c.length;
  }
  return merged;
}

/**
 * Custom HTTP client for isomorphic-git.
 *
 * Auth: callers pass `onAuth` to `git.clone/fetch/push`; the
 * isomorphic-git manager invokes it on 401, builds the
 * `Authorization` header itself, and calls our `http.request` with
 * the header already set. `onAuth` is NOT a field on
 * `GitHttpRequest`, so this client never sees it. We only add a
 * long fetch timeout for large packfiles.
 */
export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const body = await consumeBody(req.body);
    const headers: Record<string, string> = { ...req.headers };

    const isPush = req.url.includes('/git-receive-pack');
    const timeoutMs = isPush ? PUSH_TIMEOUT_MS : FETCH_TIMEOUT_MS;
    const controller = new AbortController();
    inflightController = controller;
    userCancelled = false;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    let response: Response;
    try {
      response = await fetch(req.url, {
        method: req.method ?? 'GET',
        headers,
        body: body as BodyInit | undefined,
        signal: controller.signal,
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (inflightController === controller) inflightController = null;
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        if (userCancelled) {
          throw new Error(`Git HTTP request cancelled by user: ${req.url}`);
        }
        throw new Error(`Git HTTP request timed out after ${timeoutMs}ms: ${req.url}`);
      }
      throw fetchError;
    }

    // Try to stream the response body when the environment supports
    // ReadableStream (iOS/Android modern RN, Web). Falls back to
    // `arrayBuffer()` for environments without streaming support
    // (legacy RN, older Hermes). Chunks are yielded as read (never merged
    // into one contiguous buffer) so a large packfile is not held twice in
    // memory (#982) — fixing "Packfile trailer mismatch" errors on large
    // repos (issue #790).
    let outBody: AsyncIterableIterator<Uint8Array>;
    const responseBody = response.body as (ReadableStream<Uint8Array> & { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }) | null;
    const hasStreaming = !!responseBody && typeof responseBody.getReader === 'function';

    if (hasStreaming) {
      const reader = responseBody!.getReader!();
      const chunks: Uint8Array[] = [];
      try {
         
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value && value.length > 0) {
            chunks.push(value);
          }
        }
      } catch (readError) {
        try { await reader.cancel(); } catch { /* ignore */ }
        clearTimeout(timeoutId);
        if (inflightController === controller) inflightController = null;
        if (readError instanceof Error && readError.name === 'AbortError') {
          if (userCancelled) {
            throw new Error(`Git HTTP request cancelled by user: ${req.url}`);
          }
          throw new Error(`Git HTTP response body read timed out after ${timeoutMs}ms: ${req.url}`);
        }
        throw readError;
      }

      clearTimeout(timeoutId);
      if (inflightController === controller) inflightController = null;
      outBody = yieldChunks(chunks);
    } else {
      let buffer: ArrayBuffer;
      try {
        buffer = await response.arrayBuffer();
      } catch (arrayBufferError) {
        clearTimeout(timeoutId);
        if (inflightController === controller) inflightController = null;
        if (arrayBufferError instanceof Error && arrayBufferError.name === 'AbortError') {
          if (userCancelled) {
            throw new Error(`Git HTTP request cancelled by user: ${req.url}`);
          }
          throw new Error(`Git HTTP response body read timed out after ${timeoutMs}ms: ${req.url}`);
        }
        throw arrayBufferError;
      }
      clearTimeout(timeoutId);
      if (inflightController === controller) inflightController = null;
      outBody = yieldOnce(new Uint8Array(buffer));
    }

    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      url: response.url || req.url,
      method: req.method,
      headers: responseHeaders,
      statusCode: response.status,
      statusMessage: response.statusText,
      body: outBody,
    };
  },
};
