/**
 * Per-provider request/response quirks for OpenAI-compatible endpoints.
 *
 * Some providers diverge from the standard OpenAI schema (extra body fields,
 * non-standard SSE shape, header requirements, etc.). Add a `ProviderQuirk`
 * here instead of branching inside the main service so the chat code stays
 * provider-agnostic.
 *
 * Match order: first quirk whose `matches(baseURL)` returns true wins.
 */

export interface ProviderQuirk {
  id: string;
  matches: (baseURL: string) => boolean;
  transformRequestBody?: (body: Record<string, unknown>) => void;
  transformUrl?: (url: string) => string;
  inspectResponse?: (response: Response) => void;
}

function getHostname(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    const stripped = value
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .replace(/:\d+$/, '');
    return stripped.toLowerCase();
  }
}

function hostnameMatches(value: string, host: string): boolean {
  const hostname = getHostname(value);
  return hostname === host || hostname.endsWith(`.${host}`);
}

function rewriteMiniMaxChatCompletionsUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    if (!/(^|\.)api\.minimax\.io$/i.test(parsed.hostname)) return rawUrl;

    const path = parsed.pathname;
    if (/\/chat\/completions$/i.test(path) && !/^\/v1\/chat\/completions$/i.test(path)) {
      parsed.pathname = '/v1/chat/completions';
      return parsed.toString();
    }
    return rawUrl;
  } catch {
    return rawUrl
      .replace(/^https?:\/\/api\.minimax\.io\/anthropic\/v1\/chat\/completions(\?|$)/i, 'https://api.minimax.io/v1/chat/completions$1')
      .replace(/^https?:\/\/api\.minimax\.io\/anthropic\/chat\/completions(\?|$)/i, 'https://api.minimax.io/v1/chat/completions$1')
      .replace(/^https?:\/\/api\.minimax\.io\/chat\/completions(\?|$)/i, 'https://api.minimax.io/v1/chat/completions$1');
  }
}

export const PROVIDER_QUIRKS: ProviderQuirk[] = [
  {
    id: 'z.ai',
    matches: (url) => hostnameMatches(url, 'z.ai'),
    transformRequestBody: (body) => {
      if (Array.isArray(body.tools) && body.tools.length > 0) {
        body.tool_stream = true;
      }
    },
  },
  {
    id: 'minimax',
    matches: (url) => hostnameMatches(url, 'api.minimax.io'),
    transformUrl: rewriteMiniMaxChatCompletionsUrl,
    inspectResponse: (response) => {
      if (__DEV__ && response.status >= 400) {
        console.warn('[minimax] response', response.status, response.url);
      }
    },
  },
];

export function findQuirk(baseURL: string): ProviderQuirk | undefined {
  return PROVIDER_QUIRKS.find((quirk) => quirk.matches(baseURL));
}

/**
 * Returns a `fetch` that applies the matching quirk's request/response
 * transforms, or `undefined` when no quirk matches the baseURL.
 */
export function buildQuirkedFetch(baseURL: string): typeof fetch | undefined {
  const quirk = findQuirk(baseURL);
  if (!quirk) {
    return undefined;
  }

  return async (input, init) => {
    let outboundInit = init;
    let outboundInput: RequestInfo | URL = input;

    const rewriteUrl = (rawUrl: string): string => {
      if (!quirk.transformUrl) return rawUrl;
      return quirk.transformUrl(rawUrl);
    };

    if (quirk.transformUrl) {
      if (typeof input === 'string') {
        outboundInput = rewriteUrl(input);
      } else if (input instanceof URL) {
        outboundInput = rewriteUrl(input.toString());
      } else if (input instanceof Request) {
        const rewritten = rewriteUrl(input.url);
        outboundInput = rewritten === input.url ? input : new Request(rewritten, input);
      }
    }

    if (init?.body && typeof init.body === 'string' && quirk.transformRequestBody) {
      try {
        const parsed = JSON.parse(init.body) as Record<string, unknown>;
        quirk.transformRequestBody(parsed);
        outboundInit = { ...init, body: JSON.stringify(parsed) };
      } catch (error) {
        if (__DEV__) {
          console.warn(`[${quirk.id}] failed to rewrite request body`, error);
        }
      }
    }

    const getUrlString = (value: RequestInfo | URL): string | null => {
      if (typeof value === 'string') return value;
      if (value instanceof URL) return value.toString();
      if (value instanceof Request) return value.url;
      return null;
    };

    let response = await fetch(outboundInput, outboundInit);

    if (quirk.id === 'minimax' && response.status === 404) {
      const attemptedUrl = getUrlString(outboundInput);
      if (attemptedUrl && /api\.minimax\.io/i.test(attemptedUrl) && !/\/v1\/chat\/completions(?:\?|$)/i.test(attemptedUrl)) {
        const retriedUrl = rewriteMiniMaxChatCompletionsUrl(attemptedUrl);
        if (retriedUrl !== attemptedUrl) {
          response = await fetch(retriedUrl, outboundInit);
        }
      }
    }

    if (__DEV__ && quirk.inspectResponse) {
      try {
        quirk.inspectResponse(response);
      } catch (error) { void error;
        // diagnostics must never break the request
      }
    }

    return response;
  };
}
