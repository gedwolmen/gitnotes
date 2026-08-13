jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  DELETE_FAILURES_STORAGE_KEY,
  clearDeleteFailure,
  deleteFailureKey,
  readDeleteFailures,
  recordDeleteFailure,
} from '../../../src/services/git/deleteFailures';

describe('deleteFailures', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
  });

  test('deleteFailureKey formats repo::branch::path with main fallback', () => {
    expect(deleteFailureKey('owner/repo', 'master', 'notes/a.md'))
      .toBe('owner/repo::master::notes/a.md');
    expect(deleteFailureKey('owner/repo', undefined, 'notes/a.md'))
      .toBe('owner/repo::main::notes/a.md');
  });

  test('record + read round-trips the canonical shape under the canonical key', async () => {
    await recordDeleteFailure('owner/repo', 'master', 'notes/a.md', {
      error: 'Bad credentials',
      kind: 'authentication',
      at: 12345,
    });

    const raw = await AsyncStorage.getItem(DELETE_FAILURES_STORAGE_KEY);
    expect(raw).toBe(JSON.stringify({
      'owner/repo::master::notes/a.md': { error: 'Bad credentials', kind: 'authentication', at: 12345 },
    }));
    expect(await readDeleteFailures()).toEqual({
      'owner/repo::master::notes/a.md': { error: 'Bad credentials', kind: 'authentication', at: 12345 },
    });
  });

  test('record overwrites the entry for the same key', async () => {
    await recordDeleteFailure('r', 'main', 'a.md', { error: 'first', kind: 'network', at: 1 });
    await recordDeleteFailure('r', 'main', 'a.md', { error: 'second', kind: 'exhausted', at: 2 });
    expect(await readDeleteFailures()).toEqual({
      'r::main::a.md': { error: 'second', kind: 'exhausted', at: 2 },
    });
  });

  test('clear removes only the targeted key', async () => {
    await recordDeleteFailure('r', 'main', 'a.md', { error: 'x', kind: 'network', at: 1 });
    await recordDeleteFailure('r', 'main', 'b.md', { error: 'y', kind: 'unknown', at: 2 });
    await clearDeleteFailure('r', 'main', 'a.md');
    expect(await readDeleteFailures()).toEqual({
      'r::main::b.md': { error: 'y', kind: 'unknown', at: 2 },
    });
  });

  test('clear on an absent key is a no-op write', async () => {
    await clearDeleteFailure('r', 'main', 'a.md');
    expect(AsyncStorage.setItem).not.toHaveBeenCalled();
  });

  test('read resolves {} for missing or corrupted payloads', async () => {
    expect(await readDeleteFailures()).toEqual({});
    await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, '{not json');
    expect(await readDeleteFailures()).toEqual({});
    await AsyncStorage.setItem(DELETE_FAILURES_STORAGE_KEY, '["array"]');
    expect(await readDeleteFailures()).toEqual({});
  });
});
