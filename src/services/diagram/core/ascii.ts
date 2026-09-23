/**
 * Deterministic ASCII art export for diagram documents.
 *
 * Schema compatibility: termdraw `.td.json` format, version 1.
 * Provenance: clean-room implementation; produces compatible ASCII output
 * without copying any upstream rendering code.
 */

export { makeGrid, plot, readCell, isOccupied, computeBoundingBox, objectPoints } from './render-grid';
export type { CharGrid, BoundingBox } from './render-grid';
export { renderBox } from './render-box';
export { bresenhamLine, renderLine } from './render-line';
export { renderElbow, renderPaint, renderText } from './render-misc';

import { assertNever } from '../../../models/Diagram';
import type { DrawDocument } from '../../../models/Diagram';
import { makeGrid, computeBoundingBox } from './render-grid';
import { renderBox } from './render-box';
import { renderLine } from './render-line';
import { renderElbow, renderPaint, renderText } from './render-misc';

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Renders a DrawDocument to a string of ASCII art.
 *
 * Objects are sorted by z-index before rendering (ascending).
 * Higher z objects are drawn last (on top).
 * Bounding box is computed from all object extents;
 * empty documents render as a single space.
 */
export function exportAscii(doc: DrawDocument): string {
  if (doc.objects.length === 0) {
    return ' ';
  }

  const { minX, minY, maxX, maxY } = computeBoundingBox(doc);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const offsetX = -minX;
  const offsetY = -minY;

  const grid = makeGrid(width, height);

  const sorted = [...doc.objects].sort((a, b) => a.z - b.z);

  for (const obj of sorted) {
    switch (obj.type) {
      case 'box':
        renderBox(grid, {
          ...obj,
          left: obj.left + offsetX,
          right: obj.right + offsetX,
          top: obj.top + offsetY,
          bottom: obj.bottom + offsetY,
        });
        break;
      case 'line':
        renderLine(grid, {
          ...obj,
          x1: obj.x1 + offsetX,
          y1: obj.y1 + offsetY,
          x2: obj.x2 + offsetX,
          y2: obj.y2 + offsetY,
        });
        break;
      case 'elbow':
        renderElbow(grid, {
          ...obj,
          x1: obj.x1 + offsetX,
          y1: obj.y1 + offsetY,
          x2: obj.x2 + offsetX,
          y2: obj.y2 + offsetY,
        });
        break;
      case 'paint':
        renderPaint(grid, {
          ...obj,
          points: obj.points.map((p) => ({
            x: p.x + offsetX,
            y: p.y + offsetY,
          })),
        });
        break;
      case 'text':
        renderText(grid, {
          ...obj,
          x: obj.x + offsetX,
          y: obj.y + offsetY,
        });
        break;
      default:
        assertNever(obj);
    }
  }

  return grid.map((row) => row.join('')).join('\n');
}
