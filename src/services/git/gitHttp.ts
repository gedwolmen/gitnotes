export type GitHttpRequest = {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: AsyncIterable<Uint8Array> | Iterable<Uint8Array> | Uint8Array | string | null;
};
export type GitHttpResponse = {
  url: string;
  method?: string;
  headers: Record<string, string>;
  statusCode: number;
  statusMessage: string;
  body: AsyncIterable<Uint8Array>;
};
export type HttpClient = {
  request(req: GitHttpRequest): Promise<GitHttpResponse>;
};

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

/**
 * Lazily reads the response body from the reader, yielding each chunk as it
 * arrives instead of collecting the whole stream first. We never hold a second
 * full-size copy, and the consumer gets the first chunk as soon as the network
 * delivers it (#982, #1021).
 */
async function* streamResponseBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  controller: AbortController,
  timeoutId: ReturnType<typeof setTimeout>,
  timeoutMs: number,
  url: string,
): AsyncIterableIterator<Uint8Array> {
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length > 0) {
        yield value;
      }
    }
  } catch (readError) {
    try { await reader.cancel(); } catch { /* ignore */ }
    if (readError instanceof Error && readError.name === 'AbortError') {
      if (userCancelled) {
        throw new Error(`Git HTTP request cancelled by user: ${url}`);
      }
      throw new Error(`Git HTTP response body read timed out after ${timeoutMs}ms: ${url}`);
    }
    throw readError;
  } finally {
    clearTimeout(timeoutId);
    if (inflightController === controller) inflightController = null;
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
 * Custom HTTP client for git operations.
 *
 * Auth: callers pass `onAuth` to `git.clone/fetch/push`; the
 * git manager invokes it on 401, builds the
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
    // (legacy RN, older Hermes). The body is a lazy generator: chunks are
    // read and yielded as the consumer pulls, never accumulated here (#982,
    // #1021) — fixing "Packfile trailer mismatch" errors on large repos
    // (issue #790).
    let outBody: AsyncIterableIterator<Uint8Array>;
    const responseBody = response.body as (ReadableStream<Uint8Array> & { getReader?: () => ReadableStreamDefaultReader<Uint8Array> }) | null;
    const hasStreaming = !!responseBody && typeof responseBody.getReader === 'function';

    if (hasStreaming) {
      const reader = responseBody!.getReader!();
      outBody = streamResponseBody(reader, controller, timeoutId, timeoutMs, req.url);
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
