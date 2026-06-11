import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git';
import type { GitHostKind } from './hostAdapters';

const FETCH_TIMEOUT_MS = 600_000;

async function* yieldOnce(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
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
 * Module-level "active host" context. Set by `GitFsService` (and
 * `LocalGitWriter`) right before kicking off a clone / fetch / push,
 * read by `ensureToken` in `GitFsService.ts` so the onAuth callback
 * returns the host-correct `{ username, password }` pair.
 *
 * This is intentionally module-scoped rather than threaded through
 * every isomorphic-git call: isomorphic-git's `HttpClient` interface
 * is a flat `request({ url, headers, body })` shape with no per-call
 * context hook, and clone-mode is a single-host-at-a-time flow (you
 * don't push to GitHub and Gitea in the same operation).
 *
 * Auth flow (isomorphic-git 1.37+):
 *   1. Caller passes an `onAuth` callback to `git.clone/fetch/push`.
 *   2. isomorphic-git receives a 401 from the host, invokes
 *      `onAuth(url, auth)` to acquire credentials, then builds the
 *      `Authorization: Basic <b64>` header itself from whatever
 *      `{ username, password }` the callback returns.
 *   3. isomorphic-git then calls our `http.request({ headers })` with
 *      that pre-populated header, which we just pass through to
 *      `fetch()`.
 *
 * The earlier version of this file tried to invoke `req.onAuth()`
 * from inside the HTTP client and re-run `fetch()` on 401. That code
 * path has been dead since isomorphic-git 1.37 removed `onAuth` from
 * the `GitHttpRequest` type — the type errors in `tsc` were a symptom
 * of this dead code, not a real auth bug. The host-correct
 * credentials now live in `ensureToken` and ride into the
 * request via the Authorization header that isomorphic-git itself
 * injects.
 */
let activeHostKind: GitHostKind = 'github';

export function setActiveGitHostKind(kind: GitHostKind): void {
  activeHostKind = kind;
}

export function getActiveGitHostKind(): GitHostKind {
  return activeHostKind;
}

export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const body = await consumeBody(req.body);
    const headers: Record<string, string> = { ...req.headers };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

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
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        throw new Error(`Git HTTP request timed out after ${FETCH_TIMEOUT_MS}ms: ${req.url}`);
      }
      throw fetchError;
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (arrayBufferError) {
      clearTimeout(timeoutId);
      if (arrayBufferError instanceof Error && arrayBufferError.name === 'AbortError') {
        throw new Error(`Git HTTP response body read timed out after ${FETCH_TIMEOUT_MS}ms: ${req.url}`);
      }
      throw arrayBufferError;
    }
    clearTimeout(timeoutId);
    const bytes = new Uint8Array(buffer);

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
      body: yieldOnce(bytes),
    };
  },
};
