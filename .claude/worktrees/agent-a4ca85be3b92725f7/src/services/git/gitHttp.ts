import type { GitHttpRequest, GitHttpResponse, HttpClient } from 'isomorphic-git';

async function* yieldOnce(bytes: Uint8Array): AsyncIterableIterator<Uint8Array> {
  yield bytes;
}

async function consumeBody(
  body: GitHttpRequest['body'],
): Promise<Uint8Array | undefined> {
  if (!body) return undefined;
  // Body is an iterable (sync or async) of Uint8Arrays. Concat to a single
  // buffer — the streaming win isn't worth the platform-specific plumbing on
  // RN for the request side, where bodies stay small (refspec advertisements,
  // small packs from shallow clones).
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
 * Minimal HTTP client for isomorphic-git built on `fetch`. RN/Hermes ships
 * `fetch` natively; we deliberately avoid `isomorphic-git/http/web` because
 * its body-streaming path leans on `ReadableStream` features that aren't
 * universally polyfilled on the RN runtime we ship.
 *
 * Buffering the response body in memory is fine for the workloads Phase 1
 * targets (shallow clones / refspec advertisements). When we wire push and
 * deep clones in later phases, we can revisit and stream.
 */
export const gitHttp: HttpClient = {
  async request(req: GitHttpRequest): Promise<GitHttpResponse> {
    const body = await consumeBody(req.body);
    const response = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: req.headers ?? {},
      body: body as BodyInit | undefined,
    });

    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      url: response.url || req.url,
      method: req.method,
      headers,
      statusCode: response.status,
      statusMessage: response.statusText,
      body: yieldOnce(bytes),
    };
  },
};
