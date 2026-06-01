jest.mock('axios', () => {
  const request = jest.fn();
  const isAxiosError = (e: unknown): e is { response?: { status?: number } } =>
    !!e && typeof e === 'object' && 'response' in (e as object);
  return {
    __esModule: true,
    default: { request, isAxiosError },
    isAxiosError,
  };
});

jest.mock('../../src/services/AuthService', () => ({
  __esModule: true,
  default: { getToken: jest.fn(async () => 'token-xyz') },
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: { isAuthenticated: jest.fn(() => true) },
}));

import axios from 'axios';
import {
  deleteThread,
  initializeChatStorage,
  isChatStorageInitialized,
  loadThread,
  loadThreadSummaries,
  saveThread,
} from '../../src/services/ChatStorageService';
import { GitHubService } from '../../src/services/GitHubService';
import AuthService from '../../src/services/AuthService';
import AsyncStorage from '@react-native-async-storage/async-storage';

const requestMock = (axios as unknown as { request: jest.Mock }).request;

interface AxiosCall {
  url: string;
  method: 'GET' | 'PUT' | 'DELETE';
  data?: Record<string, unknown>;
  params?: Record<string, unknown>;
}

function expectCall(index: number, expected: Partial<AxiosCall>): void {
  const actual = requestMock.mock.calls[index][0] as AxiosCall;
  if (expected.url) expect(actual.url).toBe(expected.url);
  if (expected.method) expect(actual.method).toBe(expected.method);
  if (expected.data) expect(actual.data).toMatchObject(expected.data);
  if (expected.params) expect(actual.params).toEqual(expected.params);
}

function makeAxiosError(status: number): Error & { response: { status: number } } {
  const err = new Error(`HTTP ${status}`) as Error & { response: { status: number } };
  err.response = { status };
  return err;
}

beforeEach(async () => {
  requestMock.mockReset();
  (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
  (AuthService.getToken as jest.Mock).mockResolvedValue('token-xyz');
  await AsyncStorage.clear();
});

describe('initializeChatStorage', () => {
  test('returns false when not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
    const result = await initializeChatStorage('o', 'r', 'main');
    expect(result).toBe(false);
    expect(requestMock).not.toHaveBeenCalled();
  });

  test('PUTs .gitkeep + index.json with auth header', async () => {
    requestMock.mockResolvedValue({ data: {} });
    const ok = await initializeChatStorage('o', 'r', 'main');
    expect(ok).toBe(true);
    expect(requestMock).toHaveBeenCalledTimes(2);
    expectCall(0, {
      url: 'https://api.github.com/repos/o/r/contents/chat/.gitkeep',
      method: 'PUT',
    });
    expectCall(1, {
      url: 'https://api.github.com/repos/o/r/contents/chat/index.json',
      method: 'PUT',
    });
    const headers = (requestMock.mock.calls[0][0] as { headers: Record<string, string> }).headers;
    expect(headers.Authorization).toBe('token token-xyz');
    expect(headers.Accept).toBe('application/vnd.github+json');
  });

  test('swallows 409/422 conflicts during init but rethrows others', async () => {
    requestMock
      .mockRejectedValueOnce(makeAxiosError(409))
      .mockRejectedValueOnce(makeAxiosError(409))
      .mockRejectedValueOnce(makeAxiosError(409))
      .mockRejectedValueOnce(makeAxiosError(409))
      .mockRejectedValueOnce(makeAxiosError(409))
      .mockRejectedValueOnce(makeAxiosError(409));
    const ok = await initializeChatStorage('o', 'r', 'main');
    expect(ok).toBe(true);
  });

  test('rethrows unexpected status from init', async () => {
    requestMock.mockRejectedValue(makeAxiosError(500));
    await expect(initializeChatStorage('o', 'r', 'main')).rejects.toBeDefined();
  });
});

describe('loadThreadSummaries', () => {
  test('decodes index.json and sorts threads newest-first', async () => {
    const indexBody = JSON.stringify({
      threads: [
        { id: 'a', title: 'Old', updatedAt: 1, messageCount: 0 },
        { id: 'b', title: 'New', updatedAt: 99, messageCount: 0 },
      ],
    });
    requestMock.mockResolvedValueOnce({
      data: { content: Buffer.from(indexBody).toString('base64'), sha: 'sha1' },
    });
    const summaries = await loadThreadSummaries('o', 'r', 'main');
    expect(summaries.map((s) => s.id)).toEqual(['b', 'a']);
    const cached = await AsyncStorage.getItem('chat-index-o-r-main');
    expect(cached).not.toBeNull();
  });

  test('repairs stale placeholder title and preview from thread file', async () => {
    const indexBody = JSON.stringify({
      threads: [
        { id: 'tid', title: 'New Chat', updatedAt: 10, messageCount: 2, preview: 'No messages yet' },
      ],
    });
    const threadBody = JSON.stringify({
      id: 'tid',
      title: 'New Chat',
      messages: [
        { id: 'm1', role: 'user', content: 'Plan Sri Lanka trip itinerary', timestamp: 1 },
        { id: 'm2', role: 'assistant', content: '', timestamp: 2, toolCallName: 'create_note' },
      ],
      createdAt: 0,
      updatedAt: 10,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    });

    requestMock
      .mockResolvedValueOnce({
        data: { content: Buffer.from(indexBody).toString('base64'), sha: 'idxsha' },
      })
      .mockResolvedValueOnce({
        data: { content: Buffer.from(threadBody).toString('base64') },
      })
      .mockResolvedValueOnce({
        data: { content: Buffer.from(indexBody).toString('base64'), sha: 'idxsha' },
      })
      .mockResolvedValueOnce({ data: {} });

    const summaries = await loadThreadSummaries('o', 'r', 'main');

    expect(summaries).toHaveLength(1);
    expect(summaries[0].title).toBe('Plan Sri Lanka trip itinerary');
    expect(summaries[0].preview).toBe('Create note');

    const putCall = requestMock.mock.calls
      .map((c) => c[0] as AxiosCall)
      .find((c) => c.method === 'PUT' && c.url.includes('chat/index.json'));
    expect(putCall).toBeDefined();
  });

  test('returns [] (and writes empty cache) when index missing (404)', async () => {
    requestMock.mockRejectedValueOnce(makeAxiosError(404));
    const summaries = await loadThreadSummaries('o', 'r', 'main');
    expect(summaries).toEqual([]);
    const cached = await AsyncStorage.getItem('chat-index-o-r-main');
    expect(cached).toBe('[]');
  });

  test('falls back to AsyncStorage cache on transient errors', async () => {
    await AsyncStorage.setItem(
      'chat-index-o-r-main',
      JSON.stringify([{ id: 'cached', title: 'X', updatedAt: 5, messageCount: 1 }]),
    );
    requestMock.mockRejectedValueOnce(makeAxiosError(500));
    const summaries = await loadThreadSummaries('o', 'r', 'main');
    expect(summaries.map((s) => s.id)).toEqual(['cached']);
  });

  test('repairs stale cached summaries from cached thread bodies on transient errors', async () => {
    await AsyncStorage.setItem(
      'chat-index-o-r-main',
      JSON.stringify([{ id: 'tid', title: 'New Chat', updatedAt: 5, messageCount: 1, preview: 'No messages yet' }]),
    );
    await AsyncStorage.setItem(
      'chat-thread-o-r-main-tid',
      JSON.stringify({
        id: 'tid',
        title: 'New Chat',
        messages: [{ id: 'm1', role: 'user', content: 'Plan Sri Lanka trip itinerary', timestamp: 1 }],
        createdAt: 0,
        updatedAt: 5,
        repoOwner: 'o',
        repoName: 'r',
        branch: 'main',
        filePath: 'chat/tid.json',
      }),
    );
    requestMock.mockRejectedValueOnce(makeAxiosError(500));

    const summaries = await loadThreadSummaries('o', 'r', 'main');

    expect(summaries[0].title).toBe('Plan Sri Lanka trip itinerary');
    expect(summaries[0].preview).toBe('Plan Sri Lanka trip itinerary');
  });

  test('does not reuse cached summaries from another branch', async () => {
    await AsyncStorage.setItem(
      'chat-index-o-r-main',
      JSON.stringify([{ id: 'main-only', title: 'Main branch title', updatedAt: 5, messageCount: 1 }]),
    );
    requestMock.mockRejectedValueOnce(makeAxiosError(500));

    await expect(loadThreadSummaries('o', 'r', 'feature')).rejects.toBeDefined();
  });

  test('rethrows non-404 when no cache exists', async () => {
    requestMock.mockRejectedValueOnce(makeAxiosError(500));
    await expect(loadThreadSummaries('o', 'r', 'main')).rejects.toBeDefined();
  });
});

describe('loadThread', () => {
  test('decodes a thread JSON and caches it', async () => {
    const thread = {
      id: 'tid',
      title: 'T',
      messages: [],
      createdAt: 0,
      updatedAt: 1,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };
    requestMock.mockResolvedValueOnce({
      data: { content: Buffer.from(JSON.stringify(thread)).toString('base64') },
    });

    const result = await loadThread('o', 'r', 'tid', 'main');
    expect(result?.id).toBe('tid');
    const cached = await AsyncStorage.getItem('chat-thread-o-r-main-tid');
    expect(cached).not.toBeNull();
  });

  test('repairs stale placeholder title before returning thread', async () => {
    const staleThread = {
      id: 'tid',
      title: 'New Chat',
      messages: [
        { id: 'm1', role: 'user' as const, content: 'Plan Sri Lanka trip itinerary', timestamp: 1 },
      ],
      createdAt: 0,
      updatedAt: 1,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };
    const staleIndex = JSON.stringify({
      threads: [{ id: 'tid', title: 'New Chat', updatedAt: 1, messageCount: 1, preview: 'No messages yet' }],
    });

    requestMock
      .mockResolvedValueOnce({
        data: { content: Buffer.from(JSON.stringify(staleThread)).toString('base64'), sha: 'threadsha' },
      })
      .mockResolvedValueOnce({ data: {} })
      .mockResolvedValueOnce({
        data: { content: Buffer.from(staleIndex).toString('base64'), sha: 'idxsha' },
      })
      .mockResolvedValueOnce({
        data: { content: Buffer.from(staleIndex).toString('base64'), sha: 'idxsha' },
      })
      .mockResolvedValueOnce({ data: {} });

    const result = await loadThread('o', 'r', 'tid', 'main');

    expect(result?.title).toBe('Plan Sri Lanka trip itinerary');
    const cached = JSON.parse((await AsyncStorage.getItem('chat-thread-o-r-main-tid')) || '{}');
    expect(cached.title).toBe('Plan Sri Lanka trip itinerary');
  });

  test('returns null when 404', async () => {
    requestMock.mockRejectedValueOnce(makeAxiosError(404));
    const result = await loadThread('o', 'r', 'missing', 'main');
    expect(result).toBeNull();
  });

  test('falls back to cached thread when network fails', async () => {
    const cachedThread = {
      id: 'tid',
      title: 'cached',
      messages: [],
      createdAt: 0,
      updatedAt: 1,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };
    await AsyncStorage.setItem('chat-thread-o-r-main-tid', JSON.stringify(cachedThread));
    requestMock.mockRejectedValueOnce(makeAxiosError(500));
    const result = await loadThread('o', 'r', 'tid', 'main');
    expect(result?.title).toBe('cached');
  });

  test('repairs stale cached thread title when network fails', async () => {
    const cachedThread = {
      id: 'tid',
      title: 'New Chat',
      messages: [{ id: 'm1', role: 'user' as const, content: 'Prepare iOS chat naming fix', timestamp: 1 }],
      createdAt: 0,
      updatedAt: 1,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };
    await AsyncStorage.setItem('chat-thread-o-r-main-tid', JSON.stringify(cachedThread));
    requestMock.mockRejectedValueOnce(makeAxiosError(500));

    const result = await loadThread('o', 'r', 'tid', 'main');

    expect(result?.title).toBe('Prepare iOS chat naming fix');
  });

  test('does not reuse cached thread body from another branch', async () => {
    await AsyncStorage.setItem(
      'chat-thread-o-r-main-tid',
      JSON.stringify({
        id: 'tid',
        title: 'Main only title',
        messages: [],
        createdAt: 0,
        updatedAt: 1,
        repoOwner: 'o',
        repoName: 'r',
        branch: 'main',
        filePath: 'chat/tid.json',
      }),
    );
    requestMock.mockRejectedValueOnce(makeAxiosError(500));

    await expect(loadThread('o', 'r', 'tid', 'feature')).rejects.toBeDefined();
  });
});

describe('saveThread', () => {
  test('writes thread file and updates index summaries', async () => {
    const thread = {
      id: 'tid',
      title: 'T',
      messages: [{ id: 'm1', role: 'user' as const, content: 'hi', timestamp: 0 }],
      createdAt: 0,
      updatedAt: 5,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };

    requestMock
      // GET existing thread file (404 = new)
      .mockRejectedValueOnce(makeAxiosError(404))
      // PUT thread file
      .mockResolvedValueOnce({ data: {} })
      // GET index.json (returns empty index)
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
          sha: 'idxsha',
        },
      })
      // GET existing index for sha (writeIndex)
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
          sha: 'idxsha',
        },
      })
      // PUT index.json
      .mockResolvedValueOnce({ data: {} });

    await saveThread(thread);

    const putCalls = requestMock.mock.calls
      .map((c) => c[0] as AxiosCall)
      .filter((c) => c.method === 'PUT');
    expect(putCalls).toHaveLength(2);
    expect(putCalls[0].url).toContain('chat/tid.json');
    expect(putCalls[1].url).toContain('chat/index.json');
    expect(putCalls[1].data?.sha).toBe('idxsha');
  });

  test('retries PUT on 409 by re-reading sha', async () => {
    const thread = {
      id: 'tid',
      title: 'T',
      messages: [],
      createdAt: 0,
      updatedAt: 5,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };

    requestMock
      // GET existing thread file → exists with sha-old
      .mockResolvedValueOnce({ data: { sha: 'sha-old' } })
      // PUT thread → 409
      .mockRejectedValueOnce(makeAxiosError(409))
      // GET latest sha
      .mockResolvedValueOnce({ data: { sha: 'sha-new' } })
      // PUT thread → success
      .mockResolvedValueOnce({ data: {} })
      // GET index.json → empty
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
          sha: 'i',
        },
      })
      // GET index for write
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
          sha: 'i',
        },
      })
      // PUT index
      .mockResolvedValueOnce({ data: {} });

    await saveThread(thread);

    const threadPuts = requestMock.mock.calls
      .map((c) => c[0] as AxiosCall)
      .filter((c) => c.method === 'PUT' && c.url.includes('chat/tid.json'));
    expect(threadPuts).toHaveLength(2);
    expect(threadPuts[1].data?.sha).toBe('sha-new');
  });

  test('serializes concurrent saves for different threads in same repo branch', async () => {
    const firstThread = {
      id: 'tid-1',
      title: 'First title',
      messages: [{ id: 'm1', role: 'user' as const, content: 'First message', timestamp: 1 }],
      createdAt: 0,
      updatedAt: 1,
      repoOwner: 'o',
      repoName: 'r',
      branch: 'main',
      filePath: 'chat/tid.json',
    };
    const secondThread = {
      ...firstThread,
      id: 'tid-2',
      title: 'Latest title',
      messages: [...firstThread.messages, { id: 'm2', role: 'assistant' as const, content: 'Latest message', timestamp: 2 }],
      updatedAt: 2,
    };

    let resolveFirstThreadPut: (() => void) | null = null;
    let threadPutCount = 0;
    const emptyIndex = Buffer.from(JSON.stringify({ threads: [] })).toString('base64');

    requestMock.mockImplementation(async (config: AxiosCall) => {
      if (config.method === 'GET' && (config.url.includes('chat/tid-1.json') || config.url.includes('chat/tid-2.json'))) {
        return { data: { sha: 'sha-thread' } };
      }
      if (config.method === 'PUT' && (config.url.includes('chat/tid-1.json') || config.url.includes('chat/tid-2.json'))) {
        threadPutCount += 1;
        if (threadPutCount === 1) {
          await new Promise<void>((resolve) => {
            resolveFirstThreadPut = resolve;
          });
        }
        return { data: {} };
      }
      if (config.method === 'GET' && config.url.includes('chat/index.json')) {
        return { data: { content: emptyIndex, sha: 'idxsha' } };
      }
      if (config.method === 'PUT' && config.url.includes('chat/index.json')) {
        return { data: {} };
      }
      throw new Error(`Unexpected request: ${config.method} ${config.url}`);
    });

    const firstSave = saveThread(firstThread);
    const secondSave = saveThread(secondThread);

    await expect(
      (async () => {
        while (requestMock.mock.calls.length < 2) {
          await Promise.resolve();
        }
        return requestMock.mock.calls.length;
      })(),
    ).resolves.toBe(2);

    resolveFirstThreadPut?.();
    await Promise.all([firstSave, secondSave]);

    const threadPuts = requestMock.mock.calls
      .map((c) => c[0] as AxiosCall)
      .filter((c) => c.method === 'PUT' && (c.url.includes('chat/tid-1.json') || c.url.includes('chat/tid-2.json')));
    expect(threadPuts).toHaveLength(2);
    const latestThreadBody = JSON.parse(Buffer.from(String(threadPuts[1].data?.content), 'base64').toString('utf8'));
    expect(latestThreadBody.title).toBe('Latest title');
    expect(latestThreadBody.messages).toHaveLength(2);
  });
});

describe('deleteThread', () => {
  test('returns false (and cleans index/cache) when thread file does not exist', async () => {
    requestMock
      // GET thread → 404
      .mockRejectedValueOnce(makeAxiosError(404))
      // GET index → empty
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
        },
      })
      // GET index for write
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [] })).toString('base64'),
          sha: 'i',
        },
      })
      // PUT index
      .mockResolvedValueOnce({ data: {} });

    const ok = await deleteThread('o', 'r', 'gone', 'main');
    expect(ok).toBe(false);
  });

  test('DELETEs thread file when it exists', async () => {
    const summary = {
      id: 'tid',
      title: 'T',
      updatedAt: 5,
      messageCount: 0,
    };

    requestMock
      // GET thread → exists with sha
      .mockResolvedValueOnce({ data: { sha: 'sha-1' } })
      // GET index → contains the thread
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [summary] })).toString('base64'),
        },
      })
      // DELETE thread
      .mockResolvedValueOnce({ data: {} })
      // GET index for write
      .mockResolvedValueOnce({
        data: {
          content: Buffer.from(JSON.stringify({ threads: [summary] })).toString('base64'),
          sha: 'isha',
        },
      })
      // PUT index
      .mockResolvedValueOnce({ data: {} });

    const ok = await deleteThread('o', 'r', 'tid', 'main');
    expect(ok).toBe(true);

    const deleteCall = requestMock.mock.calls
      .map((c) => c[0] as AxiosCall)
      .find((c) => c.method === 'DELETE');
    expect(deleteCall?.url).toContain('chat/tid.json');
    expect(deleteCall?.data?.sha).toBe('sha-1');
  });
});

describe('isChatStorageInitialized', () => {
  test('returns true when index.json exists', async () => {
    requestMock.mockResolvedValueOnce({ data: { sha: 'x' } });
    expect(await isChatStorageInitialized('o', 'r', 'main')).toBe(true);
  });

  test('returns false when index.json missing (404)', async () => {
    requestMock.mockRejectedValueOnce(makeAxiosError(404));
    expect(await isChatStorageInitialized('o', 'r', 'main')).toBe(false);
  });

  test('rethrows other errors', async () => {
    requestMock.mockRejectedValueOnce(makeAxiosError(500));
    await expect(isChatStorageInitialized('o', 'r', 'main')).rejects.toBeDefined();
  });
});

describe('auth gating', () => {
  test('throws when AuthService returns no token', async () => {
    (AuthService.getToken as jest.Mock).mockResolvedValueOnce(null);
    await expect(loadThreadSummaries('o', 'r', 'main')).rejects.toThrow(/token/);
  });

  test('throws when GitHub not authenticated', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(false);
    await expect(loadThreadSummaries('o', 'r', 'main')).rejects.toThrow(/not authenticated/i);
  });
});
