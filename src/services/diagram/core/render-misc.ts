/**
 * Elbow connector, paint stroke, and text label rendering for ASCII export.
 *
 * MIT License — https://github.com/benvinegar/termdraw
 */

import { assertNever } from '../../../models/Diagram';
import type {
  ElbowObject,
  PaintObject,
  TextObject,
} from '../../../models/Diagram';
import type { CharGrid } from './render-grid';
import { plot } from './render-grid';
import { bresenhamLine } from './render-line';

// ---------------------------------------------------------------------------
// Elbow renderer
// ---------------------------------------------------------------------------

/**
 * Renders an ElbowObject using horizontal-first or vertical-first routing
 * with elbow corner glyphs and arrowheads.
 */
export function renderElbow(grid: CharGrid, obj: ElbowObject): void {
  const { x1, y1, x2, y2, orientation } = obj;
  const midX = orientation === 'horizontal-first' ? x2 : x1;
  const midY = orientation === 'horizontal-first' ? y1 : y2;

  const pts1 = bresenhamLine(x1, y1, midX, midY);
  const pts2 = bresenhamLine(midX, midY, x2, y2);

  const allPts = [...pts1, ...pts2.slice(1)];

  for (let i = 0; i < allPts.length; i++) {
    const p = allPts[i]!;
    const isEnd = i === allPts.length - 1;
    const prev = allPts[i - 1];

    if (isEnd) {
      if (x1 === x2) {
        plot(grid, p.x, p.y, y1 < y2 ? 'v' : '^');
      } else if (y1 === y2) {
        plot(grid, p.x, p.y, x1 < x2 ? '>' : '<');
      } else if (orientation === 'horizontal-first') {
        plot(grid, p.x, p.y, x2 > midX ? '>' : '<');
      } else {
        plot(grid, p.x, p.y, y2 > midY ? 'v' : '^');
      }
      continue;
    }

    if (prev) {
      const cornerX = p.x !== prev.x;
      const cornerY = p.y !== prev.y;
      if (cornerX && cornerY) {
        if (p.x === midX && p.y === midY) {
          if (orientation === 'horizontal-first') {
            const fromLeft = prev.x < p.x;
            if (fromLeft && y1 < y2) plot(grid, p.x, p.y, '┌');
            else if (fromLeft && y1 > y2) plot(grid, p.x, p.y, '└');
            else if (!fromLeft && y1 < y2) plot(grid, p.x, p.y, '┐');
            else plot(grid, p.x, p.y, '┘');
          } else {
            const fromTop = prev.y < p.y;
            if (fromTop && x1 < x2) plot(grid, p.x, p.y, '┌');
            else if (fromTop && x1 > x2) plot(grid, p.x, p.y, '┐');
            else if (!fromTop && x1 < x2) plot(grid, p.x, p.y, '└');
            else plot(grid, p.x, p.y, '┘');
          }
        } else {
          plot(grid, p.x, p.y, '┼');
        }
        continue;
      }
    }

    if (p.x === x1 && p.y !== midY && p.y !== y2) {
      plot(grid, p.x, p.y, '│');
    } else if (p.y === y1 && p.x !== midX && p.x !== x2) {
      plot(grid, p.x, p.y, '─');
    } else if (p.x === midX && midX !== x2 && p.y !== y1 && p.y !== y2) {
      plot(grid, p.x, p.y, '│');
    } else if (p.y === midY && midY !== y2 && p.x !== x1 && p.x !== x2) {
      plot(grid, p.x, p.y, '─');
    } else {
      plot(grid, p.x, p.y, '─');
    }
  }
}

// ---------------------------------------------------------------------------
// Paint renderer
// ---------------------------------------------------------------------------

/** Renders a PaintObject as a series of brush characters on the grid. */
export function renderPaint(grid: CharGrid, obj: PaintObject): void {
  for (const pt of obj.points) {
    plot(grid, pt.x, pt.y, obj.brush);
  }
}

// ---------------------------------------------------------------------------
// Text renderer
// ---------------------------------------------------------------------------

/** Renders a TextObject with optional border characters. */
export function renderText(grid: CharGrid, obj: TextObject): void {
  const { x, y, content, border } = obj;
  const chars = [...content];

  switch (border) {
    case 'none':
      for (let i = 0; i < chars.length; i++) {
        plot(grid, x + i, y, chars[i]!);
      }
      break;

    case 'single': {
      const w = chars.length + 2;
      plot(grid, x, y, '┌');
      for (let i = 1; i < w - 1; i++) plot(grid, x + i, y, '─');
      plot(grid, x + w - 1, y, '┐');
      plot(grid, x, y + 1, '│');
      for (let i = 0; i < chars.length; i++) plot(grid, x + 1 + i, y + 1, chars[i]!);
      plot(grid, x + w - 1, y + 1, '│');
      plot(grid, x, y + 2, '└');
      for (let i = 1; i < w - 1; i++) plot(grid, x + i, y + 2, '─');
      plot(grid, x + w - 1, y + 2, '┘');
      break;
    }

    case 'double': {
      const w = chars.length + 2;
      plot(grid, x, y, '╔');
      for (let i = 1; i < w - 1; i++) plot(grid, x + i, y, '═');
      plot(grid, x + w - 1, y, '╗');
      plot(grid, x, y + 1, '║');
      for (let i = 0; i < chars.length; i++) plot(grid, x + 1 + i, y + 1, chars[i]!);
      plot(grid, x + w - 1, y + 1, '║');
      plot(grid, x, y + 2, '╚');
      for (let i = 1; i < w - 1; i++) plot(grid, x + i, y + 2, '═');
      plot(grid, x + w - 1, y + 2, '╝');
      break;
    }

    case 'underline':
      for (let i = 0; i < chars.length; i++) plot(grid, x + i, y, chars[i]!);
      for (let i = 0; i < chars.length; i++) plot(grid, x + i, y + 1, '─');
      break;

    default:
      assertNever(border);
  }
}
