/**
 * AtlasComposer — PenEcho-style canvas atlas composition.
 *
 * Given a target region of the 20,000×20,000 logical canvas (center point +
 * radius) and a set of sparse 512×512 tile coordinates, computes:
 *   - the cropped atlas bounds (clamped to the canvas),
 *   - the output scale factor so the rasterized atlas never exceeds
 *     MAX_ATLAS_WIDTH × MAX_ATLAS_HEIGHT pixels,
 *   - per-tile placement offsets within the atlas (with clipping).
 *
 * Pure geometric math — no Skia, no I/O, no side effects.
 */

const MAX_ATLAS_WIDTH = 2048;
const MAX_ATLAS_HEIGHT = 1536;
const TILE_SIZE = 512;
const CANVAS_SIZE = 20000;

export interface AtlasBounds {
  /** logical top-left x of atlas region */
  x: number;
  /** logical top-left y of atlas region */
  y: number;
  /** logical width */
  width: number;
  /** logical height */
  height: number;
}

export interface TilePlacement {
  /** tile coordinate */
  tileX: number;
  /** tile coordinate */
  tileY: number;
  /** where this tile sits in the atlas (logical coords) */
  offsetX: number;
  /** where this tile sits in the atlas (logical coords) */
  offsetY: number;
  /** clipped width if tile extends outside bounds */
  visibleWidth: number;
  /** clipped height if tile extends outside bounds */
  visibleHeight: number;
}

export interface AtlasLayout {
  bounds: AtlasBounds;
  /** pixel width after scaling */
  outputWidth: number;
  /** pixel height after scaling */
  outputHeight: number;
  /** scale factor applied (outputSize / logicalSize) */
  outputScale: number;
  tilePlacements: TilePlacement[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export class AtlasComposer {
  /**
   * Compute atlas bounds from center point + radius, clamped to canvas
   * limits [0, 20000].
   *
   * The rectangle starts at (centerX - radius, centerY - radius) with
   * width/height = 2 * radius. When the center is within `radius` of an
   * edge, the origin is pinned to that edge and the extent shrinks
   * accordingly (matching PenEcho behavior).
   */
  computeBounds(centerX: number, centerY: number, radius: number): AtlasBounds {
    const x = clamp(centerX - radius, 0, CANVAS_SIZE);
    const y = clamp(centerY - radius, 0, CANVAS_SIZE);
    const right = clamp(centerX + radius, 0, CANVAS_SIZE);
    const bottom = clamp(centerY + radius, 0, CANVAS_SIZE);
    return {
      x,
      y,
      width: right - x,
      height: bottom - y,
    };
  }

  /**
   * Compute atlas layout: given bounds, determine output scale, dimensions
   * (never exceeding MAX_ATLAS_WIDTH × MAX_ATLAS_HEIGHT), and tile
   * placements within the atlas.
   */
  composeAtlas(
    bounds: AtlasBounds,
    tiles: Array<{ x: number; y: number }>,
  ): AtlasLayout {
    const outputScale = Math.min(
      MAX_ATLAS_WIDTH / bounds.width,
      MAX_ATLAS_HEIGHT / bounds.height,
      1.0,
    );
    const outputWidth = Math.floor(bounds.width * outputScale);
    const outputHeight = Math.floor(bounds.height * outputScale);

    const boundsRight = bounds.x + bounds.width;
    const boundsBottom = bounds.y + bounds.height;

    const tilePlacements: TilePlacement[] = [];
    for (const tile of tiles) {
      const tileLeft = tile.x * TILE_SIZE;
      const tileTop = tile.y * TILE_SIZE;
      const tileRight = tileLeft + TILE_SIZE;
      const tileBottom = tileTop + TILE_SIZE;

      const clippedLeft = Math.max(tileLeft, bounds.x);
      const clippedTop = Math.max(tileTop, bounds.y);
      const clippedRight = Math.min(tileRight, boundsRight);
      const clippedBottom = Math.min(tileBottom, boundsBottom);

      const visibleWidth = clippedRight - clippedLeft;
      const visibleHeight = clippedBottom - clippedTop;
      if (visibleWidth <= 0 || visibleHeight <= 0) continue;

      tilePlacements.push({
        tileX: tile.x,
        tileY: tile.y,
        offsetX: clippedLeft - bounds.x,
        offsetY: clippedTop - bounds.y,
        visibleWidth,
        visibleHeight,
      });
    }

    return {
      bounds,
      outputWidth,
      outputHeight,
      outputScale,
      tilePlacements,
    };
  }

  /**
   * Get all tiles whose logical bounds overlap the given atlas region.
   * Enumerates the tile grid covering the region (edge-touching tiles are
   * excluded — strict overlap required).
   */
  getIntersectingTiles(bounds: AtlasBounds): Array<{ x: number; y: number }> {
    const minTX = Math.floor(bounds.x / TILE_SIZE);
    const minTY = Math.floor(bounds.y / TILE_SIZE);
    const maxTX = Math.floor((bounds.x + bounds.width - 1) / TILE_SIZE);
    const maxTY = Math.floor((bounds.y + bounds.height - 1) / TILE_SIZE);

    const tiles: Array<{ x: number; y: number }> = [];
    for (let ty = minTY; ty <= maxTY; ty++) {
      for (let tx = minTX; tx <= maxTX; tx++) {
        tiles.push({ x: tx, y: ty });
      }
    }
    return tiles;
  }
}
