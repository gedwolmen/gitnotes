import { describe, expect, it } from '@jest/globals';
import { pointInPolygon, elementCenter } from '../src/utils/canvasSelection';
import type { CanvasElement } from '../src/models/Canvas';

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];

  it('returns true for point inside a square', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(true);
  });

  it('returns false for point outside a square', () => {
    expect(pointInPolygon({ x: 150, y: 50 }, square)).toBe(false);
    expect(pointInPolygon({ x: -10, y: 50 }, square)).toBe(false);
  });

  it('returns true for point inside a triangle', () => {
    const triangle = [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 50, y: 60 }, triangle)).toBe(true);
  });

  it('returns false for point outside a triangle', () => {
    const triangle = [
      { x: 50, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 10, y: 10 }, triangle)).toBe(false);
  });

  it('handles concave polygons', () => {
    const concave = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 50, y: 50 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    // Point in the "notch" area
    expect(pointInPolygon({ x: 25, y: 50 }, concave)).toBe(true);
  });

  it('returns false for empty polygon', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, [])).toBe(false);
  });

  it('returns false for polygon with fewer than 3 points', () => {
    expect(pointInPolygon({ x: 50, y: 50 }, [{ x: 0, y: 0 }, { x: 100, y: 100 }])).toBe(false);
  });

  it('returns false for collinear points', () => {
    const collinear = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(pointInPolygon({ x: 50, y: 0 }, collinear)).toBe(false);
  });
});

describe('elementCenter', () => {
  it('returns centroid of stroke points', () => {
    const stroke: CanvasElement = {
      type: 'stroke',
      id: 's1',
      tool: 'pen',
      color: '#000',
      width: 2,
      points: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
    };
    expect(elementCenter(stroke)).toEqual({ x: 20, y: 30 });
  });

  it('returns {0,0} for stroke with no points', () => {
    const stroke: CanvasElement = {
      type: 'stroke',
      id: 's2',
      tool: 'pen',
      color: '#000',
      width: 2,
      points: [],
    };
    expect(elementCenter(stroke)).toEqual({ x: 0, y: 0 });
  });

  it('returns center of shape bounding box', () => {
    const shape: CanvasElement = {
      type: 'shape',
      id: 'sh1',
      shape: 'rect',
      color: '#000',
      width: 2,
      x1: 10,
      y1: 20,
      x2: 50,
      y2: 60,
    };
    expect(elementCenter(shape)).toEqual({ x: 30, y: 40 });
  });

  it('returns approximate center of text element', () => {
    const text: CanvasElement = {
      type: 'text',
      id: 't1',
      text: 'Hello',
      x: 100,
      y: 200,
      fontSize: 20,
      color: '#000',
    };
    const center = elementCenter(text);
    // textWidth = max(1, 5 * 20 * 0.6) = 60
    // centerX = 100 + 60/2 = 130
    // centerY = 200 - 20/2 = 190
    expect(center).toEqual({ x: 130, y: 190 });
  });

  it('returns center of chart element', () => {
    const chart: CanvasElement = {
      type: 'chart',
      id: 'c1',
      chartType: 'bar',
      title: 'Test',
      labels: ['A', 'B'],
      values: [10, 20],
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    };
    expect(elementCenter(chart)).toEqual({ x: 100, y: 50 });
  });

  it('returns center of image element', () => {
    const image: CanvasElement = {
      type: 'image',
      id: 'i1',
      data: 'base64data',
      mimeType: 'image/jpeg',
      x: 50,
      y: 50,
      width: 100,
      height: 80,
    };
    expect(elementCenter(image)).toEqual({ x: 100, y: 90 });
  });
});
