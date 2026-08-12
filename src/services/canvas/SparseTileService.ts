/**
 * SparseTileService — manages a sparse grid of 512×512 tiles over a
 * 20,000×20,000 logical canvas, using lazy allocation (tiles are created
 * only when first written to) and dirty-box tracking for re-rendering.
 *
 * Follows the PenEcho sparse-canvas convention: tile keys use the `${x}:${y}`
 * colon-separated format.
 */

const TILE_SIZE = 512;

export interface TileCoord {
  x: number;
  y: number;
}

export interface DirtyBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type TileCallback = (x: number, y: number) => void;

function tileKey(x: number, y: number): string {
  return `${x}:${y}`;
}

export class SparseTileService {
  private tiles: Map<string, TileCoord> = new Map();
  private allocateListeners: TileCallback[] = [];
  private deallocateListeners: TileCallback[] = [];

  // ── Allocation ──────────────────────────────────────────────

  /** Lazily allocate a tile. No-op if already allocated. */
  allocateTile(x: number, y: number): void {
    const key = tileKey(x, y);
    if (this.tiles.has(key)) return;
    this.tiles.set(key, { x, y });
    for (const cb of this.allocateListeners) {
      cb(x, y);
    }
  }

  /** Deallocate a tile. No-op if not allocated. */
  deallocateTile(x: number, y: number): void {
    const key = tileKey(x, y);
    if (!this.tiles.delete(key)) return;
    for (const cb of this.deallocateListeners) {
      cb(x, y);
    }
  }

  /** Check whether a tile is allocated. */
  isAllocated(x: number, y: number): boolean {
    return this.tiles.has(tileKey(x, y));
  }

  /** Return all allocated tiles as an array of coordinate pairs. */
  getAllocatedTiles(): TileCoord[] {
    return Array.from(this.tiles.values());
  }

  // ── Coordinate conversion ───────────────────────────────────

  /** Convert logical canvas coordinates to tile coordinates. */
  logicalToTile(lx: number, ly: number): TileCoord {
    return {
      x: Math.floor(lx / TILE_SIZE),
      y: Math.floor(ly / TILE_SIZE),
    };
  }

  /** Convert tile coordinates to the logical coordinate of the tile's top-left corner. */
  tileToLogical(tx: number, ty: number): TileCoord {
    return {
      x: tx * TILE_SIZE,
      y: ty * TILE_SIZE,
    };
  }

  // ── Dirty box ───────────────────────────────────────────────

  /**
   * Given a changed tile, return the logical-coordinate bounding box
   * that needs re-rendering.
   */
  getDirtyBox(changedTileX: number, changedTileY: number): DirtyBox {
    return {
      x1: changedTileX * TILE_SIZE,
      y1: changedTileY * TILE_SIZE,
      x2: (changedTileX + 1) * TILE_SIZE,
      y2: (changedTileY + 1) * TILE_SIZE,
    };
  }

  // ── Persistence / renderer hooks ────────────────────────────

  /** Subscribe to tile-allocation events. */
  onTileAllocated(callback: TileCallback): void {
    this.allocateListeners.push(callback);
  }

  /** Subscribe to tile-deallocation events. */
  onTileDeallocated(callback: TileCallback): void {
    this.deallocateListeners.push(callback);
  }

  // ── Introspection (testing / debugging) ─────────────────────

  /** Number of currently allocated tiles. */
  get size(): number {
    return this.tiles.size;
  }

  /** Remove all tiles and clear listeners. */
  clear(): void {
    this.tiles.clear();
    this.allocateListeners = [];
    this.deallocateListeners = [];
  }
}
