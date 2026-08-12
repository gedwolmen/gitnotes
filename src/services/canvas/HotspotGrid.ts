/**
 * HotspotGrid — PenEcho-style spatial stroke ordering.
 *
 * Divides a rectangular atlas region into a grid (default 8×8 = 64 cells)
 * and assigns each stroke point to its containing cell. Provides per-cell
 * stroke ordering (chronological by insertion strokeIndex) so downstream
 * vision models can infer writing direction (e.g. left-to-right,
 * top-to-bottom for English text).
 *
 * Pure TypeScript: no React / UI / gesture-handler dependencies.
 */

import type { AtlasBounds } from './AtlasComposer';

export type { AtlasBounds };

export interface CanvasPoint {
  x: number;
  y: number;
  /** Insertion order — unique identifier per stroke. */
  strokeIndex: number;
}

export interface GridCell {
  /** Column index, 0..(gridSize-1). */
  col: number;
  /** Row index, 0..(gridSize-1). */
  row: number;
  /** Stroke indices that fall in this cell, sorted ascending (chronological). */
  strokeIndices: number[];
}

export interface GridConfig {
  /** Logical bounds of the atlas region. */
  bounds: AtlasBounds;
  /** Cells per side. Default 8 → 8×8 = 64 cells. */
  gridSize: number;
  /** Derived: bounds.width / gridSize (width of one cell in logical units). */
  cellSize: number;
}

const DEFAULT_GRID_SIZE = 8;

export class HotspotGrid {
  /**
   * Build the full grid from stroke points within atlas bounds.
   *
   * - Points outside bounds are IGNORED (not errors).
   * - Every grid always contains exactly `gridSize * gridSize` cells,
   *   including empty cells (`strokeIndices: []`).
   * - Within each cell, `strokeIndices` are sorted ascending so chronological
   *   insertion order is preserved.
   * - Zero-area bounds (width or height = 0) return an empty grid without
   *   crashing.
   */
  build(
    bounds: AtlasBounds,
    points: CanvasPoint[],
    gridSize: number = DEFAULT_GRID_SIZE,
  ): GridCell[] {
    const totalCells = gridSize * gridSize;
    const cells: GridCell[] = new Array<GridCell>(totalCells);

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        cells[row * gridSize + col] = { col, row, strokeIndices: [] };
      }
    }

    // Zero-area bounds: nothing can fall inside; return the empty grid.
    if (bounds.width <= 0 || bounds.height <= 0) {
      return cells;
    }

    const cellW = bounds.width / gridSize;
    const cellH = bounds.height / gridSize;
    const minX = bounds.x;
    const minY = bounds.y;
    const maxX = bounds.x + bounds.width;
    const maxY = bounds.y + bounds.height;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];

      // Ignore points strictly outside the bounds.
      if (p.x < minX || p.x > maxX || p.y < minY || p.y > maxY) {
        continue;
      }

      const rawCol = Math.floor((p.x - minX) / cellW);
      const rawRow = Math.floor((p.y - minY) / cellH);
      const col = Math.max(0, Math.min(gridSize - 1, rawCol));
      const row = Math.max(0, Math.min(gridSize - 1, rawRow));

      cells[row * gridSize + col].strokeIndices.push(p.strokeIndex);
    }

    // Chronological ordering within each cell.
    for (let i = 0; i < cells.length; i++) {
      cells[i].strokeIndices.sort((a, b) => a - b);
    }

    return cells;
  }

  /**
   * Determine which cell contains a given logical point.
   *
   * The result is clamped to the grid edges, so points outside the bounds
   * map to the nearest edge cell. Use {@link contains} to test whether a
   * point is actually inside the bounds.
   */
  findCell(
    bounds: AtlasBounds,
    x: number,
    y: number,
    gridSize: number = DEFAULT_GRID_SIZE,
  ): { col: number; row: number } {
    if (bounds.width <= 0 || bounds.height <= 0) {
      return { col: 0, row: 0 };
    }

    const cellW = bounds.width / gridSize;
    const cellH = bounds.height / gridSize;

    const rawCol = Math.floor((x - bounds.x) / cellW);
    const rawRow = Math.floor((y - bounds.y) / cellH);

    return {
      col: Math.max(0, Math.min(gridSize - 1, rawCol)),
      row: Math.max(0, Math.min(gridSize - 1, rawRow)),
    };
  }

  /**
   * Check whether a logical point lies within the atlas bounds (inclusive).
   */
  contains(bounds: AtlasBounds, x: number, y: number): boolean {
    if (bounds.width <= 0 || bounds.height <= 0) {
      return false;
    }
    return (
      x >= bounds.x &&
      x <= bounds.x + bounds.width &&
      y >= bounds.y &&
      y <= bounds.y + bounds.height
    );
  }
}
