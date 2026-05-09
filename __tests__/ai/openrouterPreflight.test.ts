import {
  isOpenRouterBaseURL,
  checkOpenRouterKey,
} from '../../src/services/ai/openrouterPreflight';

describe('isOpenRouterBaseURL', () => {
  test.each([
    'https://openrouter.ai/api/v1',
    'https://openrouter.ai/api/v1/',
    'https://OpenRouter.AI/api/v1',
    'https://openrouter.ai/api',
    'https://openrouter.ai/',
  ])('matches %s', (url) => {
    expect(isOpenRouterBaseURL(url)).toBe(true);
  });

  test.each([
    'https://api.openai.com/v1',
    'https://anthropic.openrouter.fake.com/v1',
    'https://example.com/openrouter.ai',
    '',
  ])('rejects %s', (url) => {
    expect(isOpenRouterBaseURL(url)).toBe(false);
  });
});

describe('checkOpenRouterKey', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  test('returns null for non-OpenRouter URL', async () => {
    const result = await checkOpenRouterKey('https://api.openai.com/v1', 'sk-x');
    expect(result).toBeNull();
  });

  test('parses /auth/key response on success', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: { is_free_tier: true, limit: 50, usage: 12 },
      }),
    })) as any;

    const result = await checkOpenRouterKey('https://openrouter.ai/api/v1', 'sk-or-x');
    expect(result).toEqual({ isFreeTier: true, limit: 50, usage: 12 });
  });

  test('handles paid tier (is_free_tier false)', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { is_free_tier: false, limit: null, usage: 100 } }),
    })) as any;

    const result = await checkOpenRouterKey('https://openrouter.ai/api/v1', 'sk-or-x');
    expect(result).toEqual({ isFreeTier: false, limit: null, usage: 100 });
  });

  test('returns null when fetch throws', async () => {
    global.fetch = jest.fn(async () => {
      throw new Error('network down');
    }) as any;

    const result = await checkOpenRouterKey('https://openrouter.ai/api/v1', 'sk-or-x');
    expect(result).toBeNull();
  });

  test('returns null when response is not ok', async () => {
    global.fetch = jest.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({}),
    })) as any;

    const result = await checkOpenRouterKey('https://openrouter.ai/api/v1', 'sk-or-x');
    expect(result).toBeNull();
  });

  test('handles trailing slash in baseURL', async () => {
    const fetchMock = jest.fn(async () => ({
      ok: true,
      json: async () => ({ data: { is_free_tier: true, limit: 50, usage: 0 } }),
    })) as any;
    global.fetch = fetchMock;

    await checkOpenRouterKey('https://openrouter.ai/api/v1/', 'sk-or-x');
    const calledUrl = (fetchMock.mock.calls[0][0] as string);
    expect(calledUrl).toBe('https://openrouter.ai/api/v1/auth/key');
  });
});
