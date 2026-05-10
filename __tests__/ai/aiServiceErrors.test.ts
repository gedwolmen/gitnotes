import {
  extractErrorDetails,
  humanizeStreamError,
} from '../../src/services/ai/aiServiceErrors';

const apiCallError = (overrides: Record<string, unknown> = {}) => {
  const e: any = new Error(overrides.message as string ?? 'Provider returned error');
  e.name = 'AI_APICallError';
  Object.assign(e, overrides);
  return e;
};

const retryError = (errors: unknown[], lastError?: unknown) => {
  const e: any = new Error('Failed after 3 attempts. Last error: Provider returned error');
  e.name = 'AI_RetryError';
  if (errors) e.errors = errors;
  if (lastError) e.lastError = lastError;
  return e;
};

const emptyBodyError = (asCause = false) => {
  if (asCause) {
    const wrapper: any = new Error('upstream returned empty');
    wrapper.cause = { name: 'AI_EmptyResponseBodyError' };
    return wrapper;
  }
  const e: any = new Error('empty response body');
  e.name = 'AI_EmptyResponseBodyError';
  return e;
};

describe('extractErrorDetails', () => {
  test('returns status 429 from AI_APICallError', () => {
    const e = apiCallError({ statusCode: 429, responseBody: 'rate limited' });
    const d = extractErrorDetails(e);
    expect(d.status).toBe(429);
    expect(d.body).toBe('rate limited');
    expect(d.isRateLimit).toBe(true);
    expect(d.isParserError).toBe(false);
  });

  test('walks AI_RetryError.errors[last] for inner status', () => {
    const inner = apiCallError({ statusCode: 502, responseBody: 'bad gateway' });
    const e = retryError([apiCallError({ statusCode: 502 }), apiCallError({ statusCode: 502 }), inner]);
    const d = extractErrorDetails(e);
    expect(d.status).toBe(502);
    expect(d.body).toBe('bad gateway');
  });

  test('walks AI_RetryError.lastError when no errors array', () => {
    const inner = apiCallError({ statusCode: 500, responseBody: 'oops' });
    const e = retryError(undefined as any, inner);
    const d = extractErrorDetails(e);
    expect(d.status).toBe(500);
    expect(d.body).toBe('oops');
  });

  test('isParserError true for AI_APICallError with successful HTTP status and non-empty body', () => {
    const e = apiCallError({ statusCode: 200, responseBody: 'data: {...}\n\n' });
    const d = extractErrorDetails(e);
    expect(d.isParserError).toBe(true);
    expect(d.isRateLimit).toBe(false);
  });

  test('isParserError false for HTTP error responses', () => {
    const e = apiCallError({ statusCode: 500, responseBody: 'oops' });
    expect(extractErrorDetails(e).isParserError).toBe(false);
  });

  test('isParserError true for AI_APICallError with parser-class message and no status (issue #654)', () => {
    const e = apiCallError({ message: 'Failed to process successful response' });
    delete (e as any).statusCode;
    delete (e as any).responseBody;
    const d = extractErrorDetails(e);
    expect(d.isParserError).toBe(true);
    expect(d.isRateLimit).toBe(false);
  });

  test('isParserError true for AI_APICallError wrapped inside AI_RetryError with no status (issue #654)', () => {
    const inner = apiCallError({ message: 'Failed to process successful response' });
    delete (inner as any).statusCode;
    const e = retryError([inner]);
    expect(extractErrorDetails(e).isParserError).toBe(true);
  });

  test.each([
    'Failed to process successful response',
    'Failed to parse stream chunk',
    'Failed to parse JSON response',
    'invalid SSE chunk format',
  ])('parser-class message detected: %s', (message) => {
    const e = apiCallError({ message });
    delete (e as any).statusCode;
    expect(extractErrorDetails(e).isParserError).toBe(true);
  });

  test('non-AI_APICallError with parser-like message is NOT marked parser-error', () => {
    const e = new Error('Failed to process successful response');
    expect(extractErrorDetails(e).isParserError).toBe(false);
  });

  test('isEmptyBody true for AI_EmptyResponseBodyError direct or via cause', () => {
    expect(extractErrorDetails(emptyBodyError(false)).isEmptyBody).toBe(true);
    expect(extractErrorDetails(emptyBodyError(true)).isEmptyBody).toBe(true);
  });

  test('handles unknown errors gracefully', () => {
    const d = extractErrorDetails(new Error('whatever'));
    expect(d.status).toBeUndefined();
    expect(d.isRateLimit).toBe(false);
    expect(d.isParserError).toBe(false);
    expect(d.isEmptyBody).toBe(false);
  });
});

describe('humanizeStreamError', () => {
  test('rate limit returns HTTP 429 message with body snippet', () => {
    const e = apiCallError({ statusCode: 429, responseBody: 'free tier exhausted' });
    expect(humanizeStreamError(e)).toMatch(/HTTP 429.*rate limited.*free tier exhausted/);
  });

  test('5xx returns HTTP <code> message', () => {
    const e = apiCallError({ statusCode: 503, responseBody: 'unavailable' });
    expect(humanizeStreamError(e)).toMatch(/HTTP 503.*unavailable/);
  });

  test('parser error returns parser-specific copy', () => {
    const e = apiCallError({ statusCode: 200, responseBody: 'data: {...}' });
    expect(humanizeStreamError(e)).toMatch(/parse|parser/i);
  });

  test('empty body returns existing copy', () => {
    expect(humanizeStreamError(emptyBodyError())).toMatch(/empty response/i);
  });

  test('truncates long body snippets', () => {
    const longBody = 'x'.repeat(500);
    const e = apiCallError({ statusCode: 500, responseBody: longBody });
    const out = humanizeStreamError(e);
    expect(out.length).toBeLessThan(400);
  });

  test('walks AI_RetryError to surface inner status', () => {
    const inner = apiCallError({ statusCode: 429, responseBody: 'rl' });
    const e = retryError([inner]);
    expect(humanizeStreamError(e)).toMatch(/HTTP 429/);
  });
});

describe('parser-error detection on bare AI_APICallError (issue #685)', () => {
  test('AI_APICallError with no statusCode and generic message is treated as parser error', () => {
    const e = apiCallError({ message: 'Provider returned error' });
    delete (e as any).statusCode;
    delete (e as any).responseBody;
    const d = extractErrorDetails(e);
    expect(d.isParserError).toBe(true);
  });

  test('AI_RetryError wrapping an AI_APICallError without statusCode is treated as parser error', () => {
    const inner = apiCallError({ message: 'Provider returned error' });
    delete (inner as any).statusCode;
    const e = retryError([inner]);
    expect(extractErrorDetails(e).isParserError).toBe(true);
  });

  test('AI_APICallError with explicit non-success statusCode is NOT marked parser', () => {
    const e = apiCallError({ statusCode: 500, responseBody: 'oops' });
    expect(extractErrorDetails(e).isParserError).toBe(false);
  });

  test('non-AI_APICallError without status is NOT marked parser', () => {
    expect(extractErrorDetails(new Error('boom')).isParserError).toBe(false);
  });
});
