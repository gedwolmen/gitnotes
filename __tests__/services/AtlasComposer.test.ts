import { AtlasComposer } from '../../src/services/canvas/AtlasComposer';

describe('AtlasComposer', () => {
  let composer: AtlasComposer;

  beforeEach(() => {
    composer = new AtlasComposer();
  });

  // ── 1. computeBounds — centered, no clipping ────────────────

  it('computeBounds(10000, 10000, 5000) → {x:5000, y:5000, width:10000, height:10000}', () => {
    expect(composer.computeBounds(10000, 10000, 5000)).toEqual({
      x: 5000,
      y: 5000,
      width: 10000,
      height: 10000,
    });
  });

  // ── 2. computeBounds — clamped to canvas origin ─────────────

  it('computeBounds(0, 0, 5000) → {x:0, y:0, width:5000, height:5000} (clamped to origin)', () => {
    expect(composer.computeBounds(0, 0, 5000)).toEqual({
      x: 0,
      y: 0,
      width: 5000,
      height: 5000,
    });
  });

  // ── 3. computeBounds — clamped to canvas max ────────────────

  it('computeBounds(20000, 20000, 5000) → {x:15000, y:15000, width:5000, height:5000} (clamped to max)', () => {
    expect(composer.computeBounds(20000, 20000, 5000)).toEqual({
      x: 15000,
      y: 15000,
      width: 5000,
      height: 5000,
    });
  });

  // ── 4. composeAtlas — single tile fully inside bounds ───────

  it('composeAtlas with 1 tile at (10, 20) within bounds → placement matches tile bounds', () => {
    // Tile (10, 20) → logical [5120, 10240] to [5632, 10752]
    const bounds = { x: 5000, y: 10000, width: 1024, height: 1024 };
    const layout = composer.composeAtlas(bounds, [{ x: 10, y: 20 }]);

    expect(layout.tilePlacements).toHaveLength(1);
    expect(layout.tilePlacements[0]).toEqual({
      tileX: 10,
      tileY: 20,
      offsetX: 5120 - 5000, // 120
      offsetY: 10240 - 10000, // 240
      visibleWidth: 512,
      visibleHeight: 512,
    });
    // bounds 1024×1024 fits within 2048×1536 → no downscale
    expect(layout.outputScale).toBe(1);
    expect(layout.outputWidth).toBe(1024);
    expect(layout.outputHeight).toBe(1024);
  });

  // ── 5. composeAtlas — tile clipped at atlas right edge ──────

  it('composeAtlas with tile extending outside atlas right edge → visibleWidth clipped', () => {
    // Tile (3, 1) → logical [1536, 512] to [2048, 1024]
    // Atlas bounds end at x = 1000 + 800 = 1800 → clip tile right edge
    const bounds = { x: 1000, y: 512, width: 800, height: 512 };
    const layout = composer.composeAtlas(bounds, [{ x: 3, y: 1 }]);

    expect(layout.tilePlacements).toHaveLength(1);
    expect(layout.tilePlacements[0]).toEqual({
      tileX: 3,
      tileY: 1,
      offsetX: 1536 - 1000, // 536
      offsetY: 0,
      visibleWidth: 1800 - 1536, // 264
      visibleHeight: 512,
    });
  });

  // ── 6. getIntersectingTiles — returns exactly the covered tiles ──

  it('getIntersectingTiles with atlas covering a 1×5 tile strip → returns exactly those 5 tiles', () => {
    // Atlas x 600..900 stays strictly inside tile column 1 (logical 512..1023),
    // y 100..2200 spans tile rows 0..4.
    const bounds = { x: 600, y: 100, width: 300, height: 2100 };
    const tiles = composer.getIntersectingTiles(bounds);
    expect(tiles).toHaveLength(5);
    expect(tiles).toEqual([
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ]);
  });

  // ── 7. composeAtlas — output never exceeds MAX dims ─────────

  it('composeAtlas output dimensions never exceed MAX_ATLAS_WIDTH × MAX_ATLAS_HEIGHT', () => {
    // Full-canvas bounds: 20000×20000 → must downscale.
    const bounds = { x: 0, y: 0, width: 20000, height: 20000 };
    const layout = composer.composeAtlas(bounds, []);

    // scale = min(2048/20000, 1536/20000, 1) = 1536/20000 = 0.0768
    // float: 20000 * 0.0768 = 1535.999... → floor = 1535 (never exceeds max)
    expect(layout.outputScale).toBeCloseTo(1536 / 20000, 10);
    expect(layout.outputHeight).toBe(1535);
    expect(layout.outputWidth).toBe(1535);
    expect(layout.outputWidth).toBeLessThanOrEqual(2048);
    expect(layout.outputHeight).toBeLessThanOrEqual(1536);

    // Wide-aspect bounds: width-limited.
    const wide = { x: 0, y: 0, width: 10000, height: 1000 };
    const wideLayout = composer.composeAtlas(wide, []);
    // scale = min(2048/10000, 1536/1000, 1) = 0.2048
    expect(wideLayout.outputScale).toBeCloseTo(0.2048, 10);
    expect(wideLayout.outputWidth).toBe(Math.floor(10000 * 0.2048));
    expect(wideLayout.outputWidth).toBeLessThanOrEqual(2048);
    expect(wideLayout.outputHeight).toBeLessThanOrEqual(1536);
  });

  // ── 8. composeAtlas — empty tile list ───────────────────────

  it('composeAtlas with empty tile list → empty placements, valid output dims', () => {
    const bounds = { x: 1000, y: 2000, width: 4096, height: 4096 };
    const layout = composer.composeAtlas(bounds, []);

    expect(layout.tilePlacements).toEqual([]);
    expect(layout.outputScale).toBeLessThanOrEqual(1);
    expect(layout.outputWidth).toBeGreaterThan(0);
    expect(layout.outputHeight).toBeGreaterThan(0);
    expect(layout.outputWidth).toBeLessThanOrEqual(2048);
    expect(layout.outputHeight).toBeLessThanOrEqual(1536);
    // scale = min(2048/4096, 1536/4096, 1) = 0.375 → dims = 1536×1536
    expect(layout.outputScale).toBe(0.375);
    expect(layout.outputWidth).toBe(1536);
    expect(layout.outputHeight).toBe(1536);
  });
});
