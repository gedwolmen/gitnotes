import { SparseTileService } from '../../src/services/canvas/SparseTileService';

describe('SparseTileService', () => {
  let service: SparseTileService;

  beforeEach(() => {
    service = new SparseTileService();
  });

  // ── 1. allocateTile → isAllocated returns true ─────────────

  it('allocateTile(10, 20) → isAllocated(10, 20) returns true', () => {
    service.allocateTile(10, 20);
    expect(service.isAllocated(10, 20)).toBe(true);
  });

  // ── 2. logicalToTile conversion ─────────────────────────────

  it('logicalToTile(15234, 7281) → {x: 29, y: 14} (round-trip)', () => {
    const tile = service.logicalToTile(15234, 7281);
    expect(tile).toEqual({ x: 29, y: 14 });

    // round-trip: tile → logical → tile should be idempotent
    const logical = service.tileToLogical(tile.x, tile.y);
    const back = service.logicalToTile(logical.x, logical.y);
    expect(back).toEqual(tile);
  });

  // ── 3. Origin ───────────────────────────────────────────────

  it('logicalToTile(0, 0) → {x: 0, y: 0}', () => {
    expect(service.logicalToTile(0, 0)).toEqual({ x: 0, y: 0 });
  });

  // ── 4. Negative coordinates use Math.floor ──────────────────

  it('logicalToTile(-100, -100) → {x: -1, y: -1}', () => {
    expect(service.logicalToTile(-100, -100)).toEqual({ x: -1, y: -1 });
  });

  // ── 5. tileToLogical ────────────────────────────────────────

  it('tileToLogical(29, 14) → {x: 14848, y: 7168}', () => {
    expect(service.tileToLogical(29, 14)).toEqual({ x: 14848, y: 7168 });
  });

  // ── 6. getDirtyBox ─────────────────────────────────────────

  it('getDirtyBox(10, 20) → correct logical bounds', () => {
    expect(service.getDirtyBox(10, 20)).toEqual({
      x1: 5120,
      y1: 10240,
      x2: 5632,
      y2: 10752,
    });
  });

  // ── 7. deallocateTile → isAllocated returns false ──────────

  it('deallocateTile(10, 20) → isAllocated(10, 20) returns false', () => {
    service.allocateTile(10, 20);
    expect(service.isAllocated(10, 20)).toBe(true);

    service.deallocateTile(10, 20);
    expect(service.isAllocated(10, 20)).toBe(false);
  });

  // ── 8. getAllocatedTiles after 3 allocations ────────────────

  it('getAllocatedTiles() after 3 allocations returns array of 3 tiles', () => {
    service.allocateTile(0, 0);
    service.allocateTile(5, 10);
    service.allocateTile(39, 39);

    const tiles = service.getAllocatedTiles();
    expect(tiles).toHaveLength(3);
    expect(tiles).toContainEqual({ x: 0, y: 0 });
    expect(tiles).toContainEqual({ x: 5, y: 10 });
    expect(tiles).toContainEqual({ x: 39, y: 39 });
  });

  // ── 9. onTileAllocated fires once, not on duplicate ─────────

  it('onTileAllocated fires on first allocation, not on duplicate', () => {
    const callback = jest.fn();
    service.onTileAllocated(callback);

    service.allocateTile(3, 7);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(3, 7);

    // duplicate allocation should NOT fire again
    service.allocateTile(3, 7);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // ── 10. onTileDeallocated fires on deallocation ─────────────

  it('onTileDeallocated fires on deallocation', () => {
    const callback = jest.fn();
    service.onTileDeallocated(callback);

    service.allocateTile(1, 2);
    service.deallocateTile(1, 2);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(1, 2);

    // deallocating again should NOT fire (already gone)
    service.deallocateTile(1, 2);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  // ── 11. Performance: 500 tiles, getAllocatedTiles < 5 ms ────

  it('allocate 500 tiles, getAllocatedTiles() completes in <5 ms', () => {
    for (let i = 0; i < 500; i++) {
      service.allocateTile(i % 40, Math.floor(i / 40));
    }

    const start = performance.now();
    const tiles = service.getAllocatedTiles();
    const elapsed = performance.now() - start;

    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(500);
    expect(elapsed).toBeLessThan(5);
  });

  // ── Edge cases ──────────────────────────────────────────────

  it('deallocating an unallocated tile is a no-op', () => {
    const allocCb = jest.fn();
    const deallocCb = jest.fn();
    service.onTileAllocated(allocCb);
    service.onTileDeallocated(deallocCb);

    service.deallocateTile(99, 99);
    expect(deallocCb).not.toHaveBeenCalled();
    expect(service.size).toBe(0);
  });

  it('clear() removes all tiles and listeners', () => {
    const cb = jest.fn();
    service.onTileAllocated(cb);
    service.allocateTile(1, 1);
    expect(service.size).toBe(1);

    service.clear();
    expect(service.size).toBe(0);
    expect(service.getAllocatedTiles()).toHaveLength(0);

    // listeners cleared — allocating should not fire old callback
    service.allocateTile(2, 2);
    expect(cb).toHaveBeenCalledTimes(1); // only the first allocation
  });

  it('negative tile coordinates work correctly', () => {
    service.allocateTile(-3, -7);
    expect(service.isAllocated(-3, -7)).toBe(true);
    expect(service.isAllocated(-3, -6)).toBe(false);

    const tile = service.logicalToTile(-1536, -3585);
    expect(tile).toEqual({ x: -3, y: -8 });
  });

  it('multiple listeners all fire', () => {
    const cb1 = jest.fn();
    const cb2 = jest.fn();
    service.onTileAllocated(cb1);
    service.onTileAllocated(cb2);

    service.allocateTile(5, 5);
    expect(cb1).toHaveBeenCalledWith(5, 5);
    expect(cb2).toHaveBeenCalledWith(5, 5);
  });

  it('getDirtyBox(0, 0) returns origin bounds', () => {
    expect(service.getDirtyBox(0, 0)).toEqual({
      x1: 0,
      y1: 0,
      x2: 512,
      y2: 512,
    });
  });

  it('getDirtyBox for negative tile coordinates', () => {
    expect(service.getDirtyBox(-1, -1)).toEqual({
      x1: -512,
      y1: -512,
      x2: 0,
      y2: 0,
    });
  });
});
