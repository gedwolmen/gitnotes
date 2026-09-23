/**
 * Bresenham line rendering for ASCII export.
 *
 * MIT License — https://github.com/benvinegar/termdraw
 */

import type { LineObject, Point } from '../../../models/Diagram';
import type { CharGrid } from './render-grid';
import { plot } from './render-grid';

// ---------------------------------------------------------------------------
// Bresenham
// ---------------------------------------------------------------------------

/** Bresenham line points from (x1,y1) to (x2,y2). */
export function bresenhamLine(x1: number, y1: number, x2: number, y2: number): Point[] {
  const pts: Point[] = [];
  let x = x1;
  let y = y1;
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    pts.push({ x, y });
    if (x === x2 && y === y2) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }

  return pts;
}

/** Select appropriate line glyph based on segment direction and overall slope. */
function lineGlyph(dx: number, dy: number, _isStart: boolean, _isEnd: boolean): string {
  if (dy === 0) return '─';
  if (dx === 0) return '│';
  if (dx > 0 && dy < 0) return '╲';
  if (dx < 0 && dy < 0) return '╱';
  if (dx > 0 && dy > 0) return '╲';
  if (dx < 0 && dy > 0) return '╱';
  return '─';
}

// ---------------------------------------------------------------------------
// Line renderer
// ---------------------------------------------------------------------------

/**
 * Renders a LineObject onto the character grid with arrowheads at endpoints.
 * Diagonal lines use direction-aware glyphs; single-cell lines render as a dot.
 */
export function renderLine(grid: CharGrid, obj: LineObject): void {
  if (obj.x1 === obj.x2 && obj.y1 === obj.y2) {
    plot(grid, obj.x1, obj.y1, '•');
    return;
  }

  const pts = bresenhamLine(obj.x1, obj.y1, obj.x2, obj.y2);
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const isStart = i === 0;
    const isEnd = i === pts.length - 1;
    const prev = pts[i - 1];
    const next = pts[i + 1];

    let dx = 0;
    let dy = 0;
    if (prev) {
      dx += p.x - prev.x;
      dy += p.y - prev.y;
    }
    if (next) {
      dx += next.x - p.x;
      dy += next.y - p.y;
    }

    if (isEnd) {
      if (obj.x1 === obj.x2) {
        plot(grid, p.x, p.y, obj.y1 < obj.y2 ? 'v' : '^');
        continue;
      }
      if (obj.y1 === obj.y2) {
        plot(grid, p.x, p.y, obj.x1 < obj.x2 ? '>' : '<');
        continue;
      }
      const ch = obj.x1 < obj.x2 ? (obj.y1 < obj.y2 ? 'v' : '^') : (obj.y1 < obj.y2 ? '>' : '<');
      plot(grid, p.x, p.y, ch);
      continue;
    }

    if (!isStart) {
      if (obj.x1 === obj.x2) {
        plot(grid, p.x, p.y, '│');
        continue;
      }
      if (obj.y1 === obj.y2) {
        plot(grid, p.x, p.y, '─');
        continue;
      }
    }

    plot(grid, p.x, p.y, lineGlyph(dx, dy, isStart, isEnd));
  }
}
