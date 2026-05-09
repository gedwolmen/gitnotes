export interface ErrorDetails {
  status?: number;
  body?: string;
  isRateLimit: boolean;
  isParserError: boolean;
  isEmptyBody: boolean;
  underlying: unknown;
}

const BODY_SNIPPET_MAX = 200;

function asObj(x: unknown): Record<string, unknown> | null {
  return x && typeof x === 'object' ? (x as Record<string, unknown>) : null;
}

function isApiCallError(e: unknown): boolean {
  const o = asObj(e);
  return o?.name === 'AI_APICallError';
}

function isRetryError(e: unknown): boolean {
  const o = asObj(e);
  return o?.name === 'AI_RetryError';
}

function isEmptyBodyError(e: unknown): boolean {
  const o = asObj(e);
  if (!o) return false;
  if (o.name === 'AI_EmptyResponseBodyError') return true;
  const cause = asObj(o.cause);
  if (cause?.name === 'AI_EmptyResponseBodyError') return true;
  if (typeof o.message === 'string' && /empty response body/i.test(o.message)) return true;
  return false;
}

function unwrapInner(e: unknown): unknown {
  if (!isRetryError(e)) return e;
  const o = asObj(e);
  if (!o) return e;
  const errs = o.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return errs[errs.length - 1];
  }
  if (o.lastError !== undefined) return o.lastError;
  return e;
}

function readStatus(e: unknown): number | undefined {
  const o = asObj(e);
  if (!o) return undefined;
  const s = o.statusCode;
  return typeof s === 'number' ? s : undefined;
}

function readBody(e: unknown): string | undefined {
  const o = asObj(e);
  if (!o) return undefined;
  const b = o.responseBody;
  return typeof b === 'string' ? b : undefined;
}

const PARSER_MESSAGE_PATTERN =
  /failed to (process successful response|parse(?: \w+)? (?:stream|json|sse)?[^.]*)|invalid sse chunk|chunk format/i;

function hasParserMessage(e: unknown): boolean {
  const o = asObj(e);
  if (!o) return false;
  const msg = typeof o.message === 'string' ? o.message : '';
  return PARSER_MESSAGE_PATTERN.test(msg);
}

export function extractErrorDetails(error: unknown): ErrorDetails {
  const inner = unwrapInner(error);
  const status = readStatus(inner);
  const body = readBody(inner);
  const isEmptyBody = isEmptyBodyError(error) || isEmptyBodyError(inner);
  const isRateLimit = status === 429;
  const isApi = isApiCallError(inner);

  const isStatusedParserError =
    isApi && typeof status === 'number' && status >= 200 && status < 300 && !isEmptyBody;
  const isMessagedParserError =
    isApi && typeof status !== 'number' && !isEmptyBody && hasParserMessage(inner);
  const isParserError = isStatusedParserError || isMessagedParserError;

  return {
    status,
    body,
    isRateLimit,
    isParserError,
    isEmptyBody,
    underlying: inner,
  };
}

function snippet(s?: string): string {
  if (!s) return '';
  const trimmed = s.trim();
  if (trimmed.length <= BODY_SNIPPET_MAX) return trimmed;
  return trimmed.slice(0, BODY_SNIPPET_MAX) + '…';
}

export function humanizeStreamError(error: unknown): string {
  const d = extractErrorDetails(error);

  if (d.isEmptyBody) {
    return 'The AI provider returned an empty response. This is often caused by high load on the provider, an invalid model name, or a tools-incompatible request. Please try again, or pick a different model.';
  }

  if (d.isParserError) {
    const body = snippet(d.body);
    const tail = body ? ` Response snippet: ${body}` : '';
    return `The provider returned a successful response the SDK could not parse.${tail}`;
  }

  if (typeof d.status === 'number') {
    const body = snippet(d.body);
    const tail = body ? `: ${body}` : '';
    if (d.isRateLimit) {
      return `HTTP 429 (rate limited)${tail}`;
    }
    return `HTTP ${d.status}${tail}`;
  }

  const message = error instanceof Error ? error.message : 'Unknown streaming error';
  return `Failed to stream chat response: ${message}`;
}

export function isEmptyBody(error: unknown): boolean {
  return extractErrorDetails(error).isEmptyBody;
}
