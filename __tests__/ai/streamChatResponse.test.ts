jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const mockStreamText = jest.fn();
const mockGenerateText = jest.fn();

jest.mock('ai', () => ({
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  tool: (def: unknown) => def,
}));

import { streamChatResponse } from '../../src/services/AIService';

const apiCallError = (overrides: Record<string, unknown> = {}) => {
  const e: any = new Error((overrides.message as string) ?? 'Provider returned error');
  e.name = 'AI_APICallError';
  Object.assign(e, overrides);
  return e;
};

const emptyBodyError = () => {
  const e: any = new Error('empty response body');
  e.name = 'AI_EmptyResponseBodyError';
  return e;
};

const fakeStream = (parts: any[]) => ({
  fullStream: (async function* () {
    for (const p of parts) yield p;
  })(),
});

const collect = async (gen: AsyncGenerator<string>) => {
  const out: string[] = [];
  for await (const chunk of gen) out.push(chunk);
  return out;
};

const collectError = async (gen: AsyncGenerator<string>): Promise<Error> => {
  try {
    for await (const _ of gen) void _;
  } catch (e) {
    return e as Error;
  }
  throw new Error('expected stream to throw');
};

const fakeModel = {} as any;

describe('streamChatResponse', () => {
  beforeEach(() => {
    mockStreamText.mockReset();
    mockGenerateText.mockReset();
  });

  test('yields text-delta chunks from the stream', async () => {
    mockStreamText.mockReturnValueOnce(
      fakeStream([
        { type: 'text-delta', text: 'hello ' },
        { type: 'text-delta', text: 'world' },
      ]),
    );

    const out = await collect(streamChatResponse(fakeModel, []));
    expect(out.join('')).toBe('hello world');
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test('falls back to generateText when stream throws parser-class error before any yield', async () => {
    mockStreamText.mockImplementationOnce(() => {
      const stream = (async function* () {
        throw apiCallError({ statusCode: 200, responseBody: 'data: {...}' });
      })();
      return { fullStream: stream };
    });
    mockGenerateText.mockResolvedValueOnce({ text: 'fallback text', toolCalls: [] });

    const out = await collect(streamChatResponse(fakeModel, []));
    expect(out).toEqual(['fallback text']);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  test('falls back to generateText when stream throws status-less parser error (issue #654)', async () => {
    mockStreamText.mockImplementationOnce(() => {
      const err = apiCallError({ message: 'Failed to process successful response' });
      delete (err as any).statusCode;
      delete (err as any).responseBody;
      return {
        fullStream: (async function* () {
          throw err;
        })(),
      };
    });
    mockGenerateText.mockResolvedValueOnce({ text: 'recovered via fallback', toolCalls: [] });

    const out = await collect(streamChatResponse(fakeModel, []));
    expect(out).toEqual(['recovered via fallback']);
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  test('does NOT fall back on rate-limit error; surfaces HTTP 429', async () => {
    mockStreamText.mockImplementationOnce(() => {
      const stream = (async function* () {
        throw apiCallError({ statusCode: 429, responseBody: 'rate limited' });
      })();
      return { fullStream: stream };
    });

    const err = await collectError(streamChatResponse(fakeModel, []));
    expect(err.message).toMatch(/HTTP 429/);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test('surfaces HTTP 5xx without fallback', async () => {
    mockStreamText.mockImplementationOnce(() => {
      const stream = (async function* () {
        throw apiCallError({ statusCode: 503, responseBody: 'unavailable' });
      })();
      return { fullStream: stream };
    });

    const err = await collectError(streamChatResponse(fakeModel, []));
    expect(err.message).toMatch(/HTTP 503/);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  test('retries once on empty body, then falls back to generateText if still failing', async () => {
    mockStreamText
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          throw emptyBodyError();
        })(),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          throw apiCallError({ statusCode: 200, responseBody: 'data: {...}' });
        })(),
      }));
    mockGenerateText.mockResolvedValueOnce({ text: 'recovered', toolCalls: [] });

    const out = await collect(streamChatResponse(fakeModel, []));
    expect(mockStreamText).toHaveBeenCalledTimes(2);
    expect(out).toEqual(['recovered']);
  });

  test('fallback failure surfaces original (humanized) stream error', async () => {
    mockStreamText.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        throw apiCallError({ statusCode: 200, responseBody: 'data: {...}' });
      })(),
    }));
    mockGenerateText.mockRejectedValueOnce(new Error('fallback boom'));

    const err = await collectError(streamChatResponse(fakeModel, []));
    expect(err.message).toMatch(/parse|parser/i);
    expect(err.message).not.toMatch(/fallback boom/);
  });

  test('does NOT fall back if any chunk was already yielded', async () => {
    mockStreamText.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: 'partial' };
        throw apiCallError({ statusCode: 200, responseBody: '...' });
      })(),
    }));

    const err = await collectError(streamChatResponse(fakeModel, []));
    expect(err.message).toMatch(/parse|parser/i);
    expect(mockGenerateText).not.toHaveBeenCalled();
  });
});
