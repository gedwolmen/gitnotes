/**
 * Grid primitives and bounding-box utilities for ASCII rendering.
 *
 * MIT License — https://github.com/benvinegar/termdraw
 */

import type { DrawDocument, DrawObject, Point } from '../../../models/Diagram';
import { assertNever } from '../../../models/Diagram';

// ---------------------------------------------------------------------------
// Grid types
// ---------------------------------------------------------------------------

export type CharGrid = string[][];

// ---------------------------------------------------------------------------
// Grid primitives
// ---------------------------------------------------------------------------

/** Create a width×height grid filled with spaces. */
export function makeGrid(width: number, height: number): CharGrid {
  return Array.from({ length: height }, () => Array(width).fill(' '));
}

/** Write a character into grid at (x, y) if inside bounds. */
export function plot(grid: CharGrid, x: number, y: number, ch: string): void {
  if (y < 0 || y >= grid.length) return;
  if (x < 0 || x >= grid[y]!.length) return;
  grid[y]![x] = ch;
}

/** Read a character from grid at (x, y). Returns ' ' if out of bounds. */
export function readCell(grid: CharGrid, x: number, y: number): string {
  if (y < 0 || y >= grid.length) return ' ';
  if (x < 0 || x >= grid[y]!.length) return ' ';
  return grid[y]![x] ?? ' ';
}

/** True when the character at (x, y) is not a space. */
export function isOccupied(grid: CharGrid, x: number, y: number): boolean {
  return readCell(grid, x, y) !== ' ';
}

// ---------------------------------------------------------------------------
// Bounding box
// ---------------------------------------------------------------------------

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Returns the bounding box that tightly contains all objects in the document. */
export function computeBoundingBox(doc: DrawDocument): BoundingBox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const obj of doc.objects) {
    const pts = objectPoints(obj);
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }

  if (!isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  return { minX, minY, maxX, maxY };
}

/** All grid points occupied by a draw object (for bounding box computation). */
export function objectPoints(obj: DrawObject): Point[] {
  switch (obj.type) {
    case 'box':
      return [
        { x: obj.left, y: obj.top },
        { x: obj.right, y: obj.bottom },
      ];
    case 'line':
    case 'elbow':
      return [
        { x: obj.x1, y: obj.y1 },
        { x: obj.x2, y: obj.y2 },
      ];
    case 'paint':
      return [...obj.points];
    case 'text': {
      const chars = [...obj.content];
      const len = chars.length;
      const pts = chars.map((_, i) => ({ x: obj.x + i, y: obj.y }));
      pts.push({ x: obj.x + len + 1, y: obj.y });
      // Include bottom row so vertical borders and bottom edge aren't clipped
      pts.push({ x: obj.x, y: obj.y + 2 });
      pts.push({ x: obj.x + len + 1, y: obj.y + 2 });
      return pts;
    }
    default:
      return assertNever(obj);
  }
}
