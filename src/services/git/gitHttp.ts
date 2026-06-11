import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git';
import type { GitHostKind } from './hostAdapters';
import { getAdapter } from './hostAdapters';

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
 * Build the `Authorization: Basic <b64>` header for a given host +
 * token. Centralised here so every isomorphic-git call site uses the
 * same convention and adding a new host only touches `hostAdapters/`.
 */
function buildAuthHeader(kind: GitHostKind, token: string | undefined): string | null {
  if (!token) return null;
  const { username, password } = getAdapter(kind).buildBasicAuth({ token });
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

/**
 * Module-level "active host" context. Set by `GitFsService` (and
 * `LocalGitWriter`) right before kicking off a clone / fetch / push,
 * read by the auth helper below. Defaults to GitHub so any direct
 * test of `gitHttp` outside the normal flow still works the way it
 * did before this refactor.
 *
 * This is intentionally module-scoped rather than threaded through
 * every isomorphic-git call: isomorphic-git's `HttpClient` interface
 * is a flat `request({ url, headers, body, onAuth })` shape with no
 * per-call context hook, and clone-mode is a single-host-at-a-time
 * flow (you don't push to GitHub and Gitea in the same operation).
 */
let activeHostKind: GitHostKind = 'github';

export function setActiveGitHostKind(kind: GitHostKind): void {
  activeHostKind = kind;
}

export function getActiveGitHostKind(): GitHostKind {
  return activeHostKind;
}

function applyAuth(headers: Record<string, string>, token: string | undefined): void {
  const auth = buildAuthHeader(activeHostKind, token);
  if (auth) headers['Authorization'] = auth;
}

export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const body = await consumeBody(req.body);

    const headers: Record<string, string> = { ...req.headers };
    if (req.onAuth) {
      const credentials = await req.onAuth();
      if (credentials) {
        const token = credentials.password || credentials.token;
        applyAuth(headers, token);
      }
    }

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

    if (response.status === 401 && req.onAuth) {
      const credentials = await req.onAuth();
      if (credentials) {
        const token = credentials.password || credentials.token;
        if (token) {
          applyAuth(headers, token);
          clearTimeout(timeoutId);
          response = await fetch(req.url, {
            method: req.method ?? 'GET',
            headers,
            body: body as BodyInit | undefined,
            signal: controller.signal,
          });
        }
      }
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
