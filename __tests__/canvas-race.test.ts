jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  let blockNextCanvasWrite = false;
  let blockedCanvasWrite: {
    promise: Promise<void>;
    release: () => void;
    started: Promise<void>;
    markStarted: () => void;
  } | null = null;

  const createBlockedWrite = () => {
    let release = () => {};
    let markStarted = () => {};
    const promise = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    return { promise, release, started, markStarted };
  };

  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (key: string) => (key in store ? store[key] : null)),
      setItem: jest.fn(async (key: string, value: string) => {
        if (key === '@gitnotes:canvases' && blockNextCanvasWrite) {
          blockNextCanvasWrite = false;
          blockedCanvasWrite = createBlockedWrite();
          blockedCanvasWrite.markStarted();
          await blockedCanvasWrite.promise;
          blockedCanvasWrite = null;
        }
        store[key] = value;
      }),
      removeItem: jest.fn(async (key: string) => {
        delete store[key];
      }),
      multiGet: jest.fn(async (keys: string[]) => keys.map((key) => [key, key in store ? store[key] : null])),
      multiSet: jest.fn(async (pairs: [string, string][]) => {
        for (const [key, value] of pairs) {
          store[key] = value;
        }
      }),
      multiRemove: jest.fn(async (keys: string[]) => {
        for (const key of keys) {
          delete store[key];
        }
      }),
      clear: jest.fn(async () => {
        store = {};
      }),
      __reset: () => {
        blockedCanvasWrite?.release();
        store = {};
        blockNextCanvasWrite = false;
        blockedCanvasWrite = null;
      },
      __blockNextCanvasWrite: () => {
        blockNextCanvasWrite = true;
      },
      __waitForBlockedCanvasWrite: async () => {
        for (let attempt = 0; attempt < 20 && !blockedCanvasWrite; attempt += 1) {
          await Promise.resolve();
        }
        if (!blockedCanvasWrite) {
          throw new Error('No blocked canvas write in progress');
        }
        await blockedCanvasWrite.started;
      },
      __releaseBlockedCanvasWrite: () => {
        blockedCanvasWrite?.release();
      },
    },
  };
});

jest.mock('../src/services/GitHubService', () => ({
  GitHubService: {
    isAuthenticated: jest.fn(() => true),
    getTreeRecursive: jest.fn(async () => []),
    getRepoContents: jest.fn(async (_owner: string, _repo: string, dirPath: string) => {
      if (dirPath !== 'canvases') return [];
      return [{ type: 'file', path: 'canvases/remote-canvas.json', download_url: 'https://example.com/remote-canvas.json' }];
    }),
    getFileContent: jest.fn(async (_owner: string, _repo: string, path: string) => {
      if (path !== 'canvases/remote-canvas.json') return null;
      return JSON.stringify({
        version: 1,
        width: 640,
        height: 480,
        background: '#FFFFFF',
        elements: [
          {
            type: 'text',
            id: 'remote-text',
            text: 'remote',
            x: 16,
            y: 24,
            fontSize: 18,
            color: '#000000',
          },
        ],
      });
    }),
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createCanvas } from '../src/models/Canvas';
import { pullFromSingleRepo } from '../src/services/RepoPullService';
import { StorageService } from '../src/services/StorageService';

const CANVASES_STORAGE_KEY = '@gitnotes:canvases';
const CANVASES_BACKUP_STORAGE_KEY = '@gitnotes:canvases.bak';

type AsyncStorageMock = {
  __reset: () => void;
  __blockNextCanvasWrite: () => void;
  __waitForBlockedCanvasWrite: () => Promise<void>;
  __releaseBlockedCanvasWrite: () => void;
};

describe('canvas storage race handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as unknown as AsyncStorageMock).__reset();
  });

  test('concurrent local save and repo pull preserve both changes', async () => {
    const localCanvas = createCanvas({
      title: 'Local canvas',
      repo: 'owner/repo',
      branch: 'main',
      filePath: 'canvases/local-canvas.json',
    });

    await StorageService.saveAllCanvases([localCanvas]);
    await StorageService.saveRepositories([{ id: 'repo-1', name: 'repo', path: 'owner/repo', branch: 'main' }]);

    (AsyncStorage as unknown as AsyncStorageMock).__blockNextCanvasWrite();

    const updatePromise = StorageService.updateCanvas({ id: localCanvas.id, title: 'Local canvas edited' });
    await (AsyncStorage as unknown as AsyncStorageMock).__waitForBlockedCanvasWrite();

    const pullPromise = pullFromSingleRepo('owner/repo');

    (AsyncStorage as unknown as AsyncStorageMock).__releaseBlockedCanvasWrite();

    const [updatedCanvas, pullResult] = await Promise.all([updatePromise, pullPromise]);
    const canvases = await StorageService.getAllCanvases();

    expect(updatedCanvas?.title).toBe('Local canvas edited');
    expect(pullResult.canvases).toBe(1);
    expect(canvases).toHaveLength(2);
    expect(canvases.find((canvas) => canvas.id === localCanvas.id)?.title).toBe('Local canvas edited');
    expect(canvases.find((canvas) => canvas.filePath === 'canvases/remote-canvas.json')?.scene.elements).toHaveLength(1);
  });

  test('malformed canvas JSON returns [] instead of throwing', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await AsyncStorage.setItem(CANVASES_STORAGE_KEY, '{not json');

    await expect(StorageService.getAllCanvases()).resolves.toEqual([]);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Error reading canvases from storage:', expect.any(Error));

    consoleErrorSpy.mockRestore();
  });

  test('canvas writes keep a backup of the previous blob', async () => {
    await AsyncStorage.setItem(CANVASES_STORAGE_KEY, JSON.stringify([{ id: 'old-canvas' }]));

    await StorageService.saveAllCanvases([createCanvas({ title: 'New canvas' })]);

    await expect(AsyncStorage.getItem(CANVASES_BACKUP_STORAGE_KEY)).resolves.toBe(JSON.stringify([{ id: 'old-canvas' }]));
  });
});
