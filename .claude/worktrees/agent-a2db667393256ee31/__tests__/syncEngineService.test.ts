jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k: string) => store[k] ?? null),
      setItem: jest.fn(async (k: string, v: string) => {
        store[k] = v;
      }),
      removeItem: jest.fn(async (k: string) => {
        delete store[k];
      }),
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SyncEngineService } from '../src/services/SyncEngineService';

describe('SyncEngineService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the in-memory store between tests via the public API.
    AsyncStorage.setItem('@gitnotes:sync_engine_modes', '{}');
  });

  test('default mode is api', async () => {
    expect(await SyncEngineService.getMode('me/repo')).toBe('api');
    expect(SyncEngineService.DEFAULT_MODE).toBe('api');
  });

  test('setMode persists clone overrides per repo', async () => {
    await SyncEngineService.setMode('me/repo', 'clone');
    expect(await SyncEngineService.getMode('me/repo')).toBe('clone');
    expect(await SyncEngineService.getMode('other/repo')).toBe('api');
  });

  test('setting back to api removes the entry', async () => {
    await SyncEngineService.setMode('me/repo', 'clone');
    await SyncEngineService.setMode('me/repo', 'api');
    const overrides = await SyncEngineService.listOverrides();
    expect(overrides).toEqual({});
  });

  test('clear is equivalent to setMode("api")', async () => {
    await SyncEngineService.setMode('me/repo', 'clone');
    await SyncEngineService.clear('me/repo');
    expect(await SyncEngineService.getMode('me/repo')).toBe('api');
  });

  test('listOverrides returns only non-default repos', async () => {
    await SyncEngineService.setMode('a/x', 'clone');
    await SyncEngineService.setMode('b/y', 'clone');
    await SyncEngineService.setMode('c/z', 'api');
    const overrides = await SyncEngineService.listOverrides();
    expect(overrides).toEqual({ 'a/x': 'clone', 'b/y': 'clone' });
  });
});
