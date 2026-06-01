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

export const PROVIDER_QUIRKS: ProviderQuirk[] = [
  {
    id: 'anthropic.minimax',
    matches: (url) => /api\.minimax\.io/i.test(url),
    transformUrl: (url) => {
      if (/api\.minimax\.io\/anthropic($|\/)/i.test(url)) {
        return url.replace('/anthropic/chat/completions', '/anthropic/v1/messages');
      }
      if (url.includes('api.minimax.io')) {
        return url.replace('/chat/completions', '/v1/text/chatcompletion_v2');
      }
      return url;
    },
    transformRequestBody: () => {},
  },
  {
    // Z.AI Coding Plan (api.z.ai/api/coding/paas/v4 and api.z.ai/api/paas/v4).
    // Without `tool_stream: true`, GLM models return HTTP 200 with an empty
    // body when tools are attached. See:
    //   https://github.com/openclaw/openclaw/issues/18135
    id: 'z.ai',
    matches: (url) => /(^|\.)z\.ai($|\/|:)/i.test(url),
    transformRequestBody: (body) => {
      if (Array.isArray(body.tools) && body.tools.length > 0) {
        body.tool_stream = true;
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
    let outboundUrl = input as string;

    if (quirk.transformUrl && typeof input === 'string') {
      outboundUrl = quirk.transformUrl(input);
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

    const response = await fetch(outboundUrl as RequestInfo, outboundInit);

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
