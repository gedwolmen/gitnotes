import AsyncStorage from '@react-native-async-storage/async-storage';

import { TilePersistenceService } from '../../src/services/canvas/TilePersistenceService';

const CANVAS_ID = 'canvas-1';

function makeService(): TilePersistenceService {
  return new TilePersistenceService();
}

async function seedTiles(
  service: TilePersistenceService,
  canvasId: string,
  count: number,
): Promise<void> {
  const saves: Promise<void>[] = [];
  for (let i = 0; i < count; i++) {
    saves.push(service.saveTile(canvasId, i, i * 2, `data-${i}`));
  }
  await Promise.all(saves);
}

describe('TilePersistenceService', () => {
  let service: TilePersistenceService;

  beforeEach(async () => {
    jest.useRealTimers();
    await AsyncStorage.clear?.();
    service = makeService();
    jest.restoreAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('saves and loads a tile round-trip', async () => {
    await service.saveTile(CANVAS_ID, 10, 20, 'path-data');
    const loaded = await service.loadTile(CANVAS_ID, 10, 20);
    expect(loaded).toBe('path-data');
  });

  it('returns null when loading a deleted tile', async () => {
    await service.saveTile(CANVAS_ID, 10, 20, 'path-data');
    await service.deleteTile(CANVAS_ID, 10, 20);
    const loaded = await service.loadTile(CANVAS_ID, 10, 20);
    expect(loaded).toBeNull();
  });

  it('lists 3 tiles after 3 saves', async () => {
    await seedTiles(service, CANVAS_ID, 3);
    const tiles = await service.listTiles(CANVAS_ID);
    expect(tiles).toHaveLength(3);
    expect(tiles).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 1, y: 2 },
        { x: 2, y: 4 },
      ]),
    );
  });

  it('clearCanvas removes all tiles for the canvas', async () => {
    await seedTiles(service, CANVAS_ID, 3);
    await service.clearCanvas(CANVAS_ID);
    const tiles = await service.listTiles(CANVAS_ID);
    expect(tiles).toEqual([]);
  });

  it('batches 10 saves within 100ms into a single multiSet transaction', async () => {
    const multiSetSpy = jest.spyOn(AsyncStorage, 'multiSet');
    const baselineCalls = multiSetSpy.mock.calls.length;

    const saves: Promise<void>[] = [];
    for (let i = 0; i < 10; i++) {
      saves.push(service.saveTile(CANVAS_ID, i, i, `payload-${i}`));
    }
    await Promise.all(saves);

    expect(multiSetSpy.mock.calls.length - baselineCalls).toBe(1);
    const entries = multiSetSpy.mock.calls[baselineCalls][0];
    expect(entries).toHaveLength(10);

    const tiles = await service.listTiles(CANVAS_ID);
    expect(tiles).toHaveLength(10);
  });

  it('returns null and logs error when AsyncStorage throws on read', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk gone'));

    const loaded = await service.loadTile(CANVAS_ID, 1, 1);

    expect(loaded).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('returns null and logs warning for corrupted tile data', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await AsyncStorage.setItem(`canvas-tile:${CANVAS_ID}:5:6`, 'not-json{{{');

    const loaded = await service.loadTile(CANVAS_ID, 5, 6);

    expect(loaded).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('lists 500 tiles in under 10ms', async () => {
    // Seed storage directly to isolate listTiles() cost from save batching.
    const entries: Array<[string, string]> = [];
    for (let i = 0; i < 500; i++) {
      entries.push([`canvas-tile:${CANVAS_ID}:${i}:${i}`, JSON.stringify(`d-${i}`)]);
    }
    await AsyncStorage.multiSet(entries);

    const start = Date.now();
    const tiles = await service.listTiles(CANVAS_ID);
    const elapsed = Date.now() - start;

    expect(tiles).toHaveLength(500);
    expect(elapsed).toBeLessThan(10);
  });

  it('fires onTileSaved after a successful save', async () => {
    const onSaved = jest.fn();
    service.onTileSaved(onSaved);

    await service.saveTile(CANVAS_ID, 3, 4, 'path-data');

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(CANVAS_ID, 3, 4, 'path-data');
  });

  it('fires onTileDeleted after a successful delete', async () => {
    const onDeleted = jest.fn();
    service.onTileDeleted(onDeleted);

    await service.saveTile(CANVAS_ID, 7, 8, 'path-data');
    await service.deleteTile(CANVAS_ID, 7, 8);

    expect(onDeleted).toHaveBeenCalledTimes(1);
    expect(onDeleted).toHaveBeenCalledWith(CANVAS_ID, 7, 8);
  });
});
