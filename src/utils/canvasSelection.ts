import type { CanvasElement } from '../models/Canvas';

type Point = { x: number; y: number };

/**
 * Ray-casting point-in-polygon test (even-odd rule).
 * Returns false for polygons with fewer than 3 points.
 * Marked as worklet for use in gesture handlers.
 */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  'worklet';
  if (polygon.length < 3) return false;

  let inside = false;
  const { x: px, y: py } = point;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;

    const intersect =
      yi > py !== yj > py &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Returns the geometric center of a canvas element.
 * - stroke: centroid of points array (or {0,0} if empty)
 * - shape: center of bounding box
 * - text: approximate center based on estimated text width
 * - chart/image: center of rectangle
 */
export function elementCenter(el: CanvasElement): Point {
  'worklet';

  switch (el.type) {
    case 'stroke': {
      if (el.points.length === 0) return { x: 0, y: 0 };
      const sum = el.points.reduce(
        (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
        { x: 0, y: 0 },
      );
      return { x: sum.x / el.points.length, y: sum.y / el.points.length };
    }

    case 'shape':
      return {
        x: (el.x1 + el.x2) / 2,
        y: (el.y1 + el.y2) / 2,
      };

    case 'text': {
      const textWidth = Math.max(1, el.text.length * el.fontSize * 0.6);
      return {
        x: el.x + textWidth / 2,
        y: el.y - el.fontSize / 2,
      };
    }

    case 'chart':
    case 'image':
      return {
        x: el.x + el.width / 2,
        y: el.y + el.height / 2,
      };
  }
}
