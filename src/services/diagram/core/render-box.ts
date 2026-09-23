/**
 * Box glyph tables and rendering for ASCII export.
 *
 * MIT License — https://github.com/benvinegar/termdraw
 */

import type { BoxObject, BoxStyle } from '../../../models/Diagram';
import type { CharGrid } from './render-grid';
import { plot } from './render-grid';

// ---------------------------------------------------------------------------
// Glyph tables
// ---------------------------------------------------------------------------

interface BoxGlyphs {
  h: string;
  v: string;
  tl: string;
  tr: string;
  bl: string;
  br: string;
}

const LIGHT_BOX: BoxGlyphs = { h: '─', v: '│', tl: '┌', tr: '┐', bl: '└', br: '┘' };
const HEAVY_BOX: BoxGlyphs = { h: '━', v: '┃', tl: '┏', tr: '┓', bl: '┗', br: '┛' };
const DOUBLE_BOX: BoxGlyphs = { h: '═', v: '║', tl: '╔', tr: '╗', bl: '╚', br: '╝' };
const DASHED_BOX: BoxGlyphs = { h: '-', v: '╎', tl: '┌', tr: '┐', bl: '└', br: '┘' };
const AUTO_BOX: BoxGlyphs = LIGHT_BOX;

// ---------------------------------------------------------------------------
// Glyph lookup
// ---------------------------------------------------------------------------

function getBoxGlyphs(style: BoxStyle): BoxGlyphs {
  switch (style) {
    case 'light': return LIGHT_BOX;
    case 'heavy': return HEAVY_BOX;
    case 'double': return DOUBLE_BOX;
    case 'dashed': return DASHED_BOX;
    case 'auto': return AUTO_BOX;
    default: {
      const _: never = style;
      return _;
    }
  }
}

// ---------------------------------------------------------------------------
// Box renderer
// ---------------------------------------------------------------------------

/**
 * Renders a BoxObject onto the character grid using box-drawing characters.
 * The caller is responsible for creating a grid large enough to hold the box.
 */
export function renderBox(grid: CharGrid, obj: BoxObject): void {
  const g = getBoxGlyphs(obj.style);
  const { left, top, right, bottom } = obj;
  const w = right - left;
  const h = bottom - top;

  if (w === 0 && h === 0) {
    plot(grid, left, top, g.tl);
    return;
  }

  for (let x = left + 1; x < right; x++) {
    plot(grid, x, top, g.h);
  }
  for (let x = left + 1; x < right; x++) {
    plot(grid, x, bottom, g.h);
  }
  for (let y = top + 1; y < bottom; y++) {
    plot(grid, left, y, g.v);
  }
  for (let y = top + 1; y < bottom; y++) {
    plot(grid, right, y, g.v);
  }

  plot(grid, left, top, g.tl);
  plot(grid, right, top, g.tr);
  plot(grid, left, bottom, g.bl);
  plot(grid, right, bottom, g.br);
}
