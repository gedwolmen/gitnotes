import {
  PROVIDER_QUIRKS,
  buildQuirkedFetch,
  findQuirk,
} from '../../src/services/ai/providerQuirks';

describe('findQuirk', () => {
  test('matches z.ai coding plan host', () => {
    expect(findQuirk('https://api.z.ai/api/coding/paas/v4')).toBeDefined();
    expect(findQuirk('https://api.z.ai/api/paas/v4')?.id).toBe('z.ai');
    expect(findQuirk('https://api.z.ai:443/api/paas/v4')?.id).toBe('z.ai');
  });

  test('does not match unrelated hosts', () => {
    expect(findQuirk('https://api.openai.com/v1')).toBeUndefined();
    expect(findQuirk('https://example.com/z.ai-but-not-host')).toBeUndefined();
    expect(findQuirk('https://az.ai.example.com/v1')).toBeUndefined();
  });

  test('quirk shape is stable', () => {
    expect(PROVIDER_QUIRKS.length).toBeGreaterThanOrEqual(1);
    const zai = PROVIDER_QUIRKS.find((q) => q.id === 'z.ai');
    expect(zai).toBeDefined();
    expect(typeof zai!.matches).toBe('function');
    expect(typeof zai!.transformRequestBody).toBe('function');
  });
});

describe('z.ai transformRequestBody', () => {
  const zai = PROVIDER_QUIRKS.find((q) => q.id === 'z.ai')!;

  test('injects tool_stream when tools array is non-empty', () => {
    const body: Record<string, unknown> = { tools: [{ name: 'x' }] };
    zai.transformRequestBody!(body);
    expect(body.tool_stream).toBe(true);
  });

  test('does not touch body when tools missing or empty', () => {
    const a: Record<string, unknown> = { messages: [] };
    const b: Record<string, unknown> = { tools: [] };
    zai.transformRequestBody!(a);
    zai.transformRequestBody!(b);
    expect(a.tool_stream).toBeUndefined();
    expect(b.tool_stream).toBeUndefined();
  });
});

describe('buildQuirkedFetch', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('returns undefined when no quirk matches', () => {
    expect(buildQuirkedFetch('https://api.openai.com/v1')).toBeUndefined();
  });

  test('returns a fetch wrapper for matched quirk', () => {
    const fn = buildQuirkedFetch('https://api.z.ai/api/paas/v4');
    expect(typeof fn).toBe('function');
  });

  test('rewrites JSON body using transformRequestBody and forwards to global fetch', async () => {
    const mockResponse = new Response('{}', { status: 200 });
    const fetchMock = jest.fn().mockResolvedValue(mockResponse);
    global.fetch = fetchMock as unknown as typeof fetch;

    const fn = buildQuirkedFetch('https://api.z.ai/api/paas/v4')!;
    const inputBody = JSON.stringify({ tools: [{ name: 't' }] });
    const result = await fn('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      body: inputBody,
    });

    expect(result).toBe(mockResponse);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    const sentBody = JSON.parse(init.body);
    expect(sentBody.tool_stream).toBe(true);
    expect(sentBody.tools).toEqual([{ name: 't' }]);
  });

  test('falls through unchanged when body is not valid JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const fn = buildQuirkedFetch('https://api.z.ai/api/paas/v4')!;
    await fn('https://api.z.ai/api/paas/v4/x', { method: 'POST', body: 'not-json' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe('not-json');
  });

  test('passes init through when body is missing', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('{}'));
    global.fetch = fetchMock as unknown as typeof fetch;

    const fn = buildQuirkedFetch('https://api.z.ai/api/paas/v4')!;
    await fn('https://api.z.ai/api/paas/v4/x', { method: 'GET' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBeUndefined();
  });
});
