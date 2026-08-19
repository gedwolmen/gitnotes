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

  test('default mode is clone', async () => {
    expect(await SyncEngineService.getMode('me/repo')).toBe('clone');
    expect(SyncEngineService.DEFAULT_MODE).toBe('clone');
  });

  test('setMode persists api overrides per repo', async () => {
    await SyncEngineService.setMode('me/repo', 'api');
    expect(await SyncEngineService.getMode('me/repo')).toBe('api');
    expect(await SyncEngineService.getMode('other/repo')).toBe('clone');
  });

  test('setting back to clone removes the entry', async () => {
    await SyncEngineService.setMode('me/repo', 'api');
    await SyncEngineService.setMode('me/repo', 'clone');
    const overrides = await SyncEngineService.listOverrides();
    expect(overrides).toEqual({});
  });

  test('clear is equivalent to setMode("clone")', async () => {
    await SyncEngineService.setMode('me/repo', 'api');
    await SyncEngineService.clear('me/repo');
    expect(await SyncEngineService.getMode('me/repo')).toBe('clone');
  });

  test('listOverrides returns only non-default repos', async () => {
    await SyncEngineService.setMode('a/x', 'api');
    await SyncEngineService.setMode('b/y', 'api');
    await SyncEngineService.setMode('c/z', 'clone');
    const overrides = await SyncEngineService.listOverrides();
    expect(overrides).toEqual({ 'a/x': 'api', 'b/y': 'api' });
  });
});
