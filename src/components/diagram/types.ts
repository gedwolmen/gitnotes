/**
 * Shared types and pure utility functions for diagram editor components.
 */

import type { BoxStyle, DrawObject, InkColor, LineStyle, Point } from '../../models/Diagram';

// ---------------------------------------------------------------------------
// Tool types
// ---------------------------------------------------------------------------

export const TOOLS = [
  { key: 'select', icon: 'hand-left-outline' as const, label: 'Select' },
  { key: 'box', icon: 'square-outline' as const, label: 'Box' },
  { key: 'line', icon: 'remove' as const, label: 'Line' },
  { key: 'elbow', icon: 'git-commit-outline' as const, label: 'Elbow' },
  { key: 'paint', icon: 'brush-outline' as const, label: 'Paint' },
  { key: 'text', icon: 'text-outline' as const, label: 'Text' },
  { key: 'erase', icon: 'backspace-outline' as const, label: 'Erase' },
] as const;

export type ToolKey = typeof TOOLS[number]['key'];

// ---------------------------------------------------------------------------
// Color and style constants
// ---------------------------------------------------------------------------

export const INK_COLORS: InkColor[] = [
  'white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta',
];

export const BOX_STYLES: BoxStyle[] = ['auto', 'light', 'heavy', 'double', 'dashed'];
export const LINE_STYLES: LineStyle[] = ['smooth', 'light', 'double', 'dashed'];
export const BORDER_MODES: Array<'none' | 'single' | 'double' | 'underline'> = [
  'none', 'single', 'double', 'underline',
];

export const INK_HEX: Record<InkColor, string> = {
  white: '#FFFFFF',
  red: '#FF3B30',
  orange: '#FF9500',
  yellow: '#FFCC00',
  green: '#34C759',
  cyan: '#00C7BE',
  blue: '#007AFF',
  magenta: '#AF52DE',
};

// ---------------------------------------------------------------------------
// Drawing state (lifecycle of an in-progress gesture)
// ---------------------------------------------------------------------------

export type DrawingState =
  | { readonly type: 'box'; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number }
  | { readonly type: 'line'; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number }
  | { readonly type: 'elbow'; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number }
  | { readonly type: 'paint'; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number; readonly points: readonly Point[] }
  | { readonly type: 'text'; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number };

// ---------------------------------------------------------------------------
// Hit testing
// ---------------------------------------------------------------------------

function objectBounds(obj: DrawObject): { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number } {
  switch (obj.type) {
    case 'box':
      return { minX: obj.left, minY: obj.top, maxX: obj.right, maxY: obj.bottom };
    case 'line':
    case 'elbow':
      return {
        minX: Math.min(obj.x1, obj.x2),
        minY: Math.min(obj.y1, obj.y2),
        maxX: Math.max(obj.x1, obj.x2),
        maxY: Math.max(obj.y1, obj.y2),
      };
    case 'paint': {
      if (obj.points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of obj.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
    case 'text':
      return { minX: obj.x, minY: obj.y, maxX: obj.x + obj.content.length, maxY: obj.y + 2 };
  }
}

/**
 * Returns true if the given grid point (gx, gy) falls within or on the
 * bounding box of obj, expanded by `pad` cells in each direction.
 */
export function hitTestObject(obj: DrawObject, gx: number, gy: number, pad = 1): boolean {
  const b = objectBounds(obj);
  return gx >= b.minX - pad && gx <= b.maxX + pad && gy >= b.minY - pad && gy <= b.maxY + pad;
}
