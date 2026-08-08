import { describe, expect, it } from '@jest/globals';
import { createCanvas, updateCanvas, isImageElement } from '../src/models/Canvas';
import { canvasSceneToSvg } from '../src/utils/canvasExport';
import { pointInPolygon, elementCenter } from '../src/utils/canvasSelection';
import { parseChartLabels, parseChartValues } from '../src/utils/chartParsing';
import type { CanvasElement, CanvasImage, CanvasScene } from '../src/models/Canvas';

describe('PenEcho-inspired features integration', () => {
  const imageElement: CanvasImage = {
    type: 'image',
    id: 'img-1',
    data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    mimeType: 'image/jpeg',
    x: 10,
    y: 20,
    width: 200,
    height: 150,
    animation: { type: 'pulse', duration: 2000, loop: true },
  };

  const shapeElement: CanvasElement = {
    type: 'shape',
    id: 'sh-1',
    shape: 'rect',
    color: '#FF0000',
    width: 2,
    x1: 50,
    y1: 50,
    x2: 150,
    y2: 100,
  };

  const textElement: CanvasElement = {
    type: 'text',
    id: 'txt-1',
    text: 'Hello World',
    x: 100,
    y: 200,
    fontSize: 16,
    color: '#000000',
    animation: { type: 'fade', duration: 1500, loop: false },
  };

  const chartElement: CanvasElement = {
    type: 'chart',
    id: 'ch-1',
    chartType: 'bar',
    title: 'Sales',
    labels: ['Q1', 'Q2', 'Q3'],
    values: [100, 200, 150],
    x: 300,
    y: 50,
    width: 200,
    height: 150,
  };

  const strokeElement: CanvasElement = {
    type: 'stroke',
    id: 'st-1',
    tool: 'pen',
    color: '#0000FF',
    width: 3,
    points: [{ x: 10, y: 10 }, { x: 50, y: 50 }, { x: 100, y: 30 }],
  };

  const allElements: CanvasElement[] = [
    strokeElement, shapeElement, textElement, chartElement, imageElement,
  ];

  describe('full scene round-trip', () => {
    it('createCanvas preserves all 5 element types with animations', () => {
      const canvas = createCanvas({
        title: 'Full Scene',
        scene: { version: 1, elements: allElements },
      });

      expect(canvas.scene.elements).toHaveLength(5);
      expect(canvas.scene.elements.map((e) => e.type)).toEqual([
        'stroke', 'shape', 'text', 'chart', 'image',
      ]);

      const img = canvas.scene.elements[4] as CanvasImage;
      expect(img.animation).toEqual({ type: 'pulse', duration: 2000, loop: true });
      expect(img.data).toBe(imageElement.data);
    });

    it('updateCanvas preserves all elements when changing title', () => {
      const original = createCanvas({
        title: 'Original',
        scene: { version: 1, elements: allElements },
      });

      const updated = updateCanvas(original, { title: 'Updated' });
      expect(updated.title).toBe('Updated');
      expect(updated.scene.elements).toHaveLength(5);
      expect(updated.scene.elements[4].type).toBe('image');
    });

    it('JSON serialization round-trip preserves all fields', () => {
      const canvas = createCanvas({
        title: 'Serialization Test',
        scene: { version: 1, elements: allElements },
      });

      const json = JSON.stringify(canvas.scene);
      const parsed: CanvasScene = JSON.parse(json);

      expect(parsed.elements).toHaveLength(5);
      expect(parsed.elements[0].type).toBe('stroke');
      expect(parsed.elements[4].type).toBe('image');
      expect((parsed.elements[4] as CanvasImage).animation).toEqual({
        type: 'pulse', duration: 2000, loop: true,
      });
    });
  });

  describe('SVG export with all element types', () => {
    it('generates SVG containing all 5 element types', () => {
      const svg = canvasSceneToSvg({
        version: 1,
        width: 800,
        height: 600,
        background: '#FFFFFF',
        elements: allElements,
      });

      expect(svg).toContain('<svg');
      expect(svg).toContain('<path');
      expect(svg).toContain('<rect');
      expect(svg).toContain('<text');
      expect(svg).toContain('<g>');
      expect(svg).toContain('<image');
    });

    it('image SVG includes base64 data URI', () => {
      const svg = canvasSceneToSvg({
        version: 1,
        width: 800,
        height: 600,
        background: '#FFFFFF',
        elements: [imageElement],
      });

      expect(svg).toContain('data:image/jpeg;base64,');
      expect(svg).toContain('width="200"');
      expect(svg).toContain('height="150"');
    });
  });

  describe('lasso selection with mixed elements', () => {
    it('selects elements whose centers fall inside lasso polygon', () => {
      const lassoPolygon = [
        { x: 0, y: 0 },
        { x: 200, y: 0 },
        { x: 200, y: 200 },
        { x: 0, y: 200 },
      ];

      const selected = allElements.filter((el) =>
        pointInPolygon(elementCenter(el), lassoPolygon),
      );

      const selectedIds = selected.map((e) => e.id);
      expect(selectedIds).toContain('st-1');
      expect(selectedIds).toContain('sh-1');
      expect(selectedIds).toContain('txt-1');
    });

    it('elementCenter returns correct center for each type', () => {
      const strokeCenter = elementCenter(strokeElement);
      expect(strokeCenter.x).toBeCloseTo(53.33, 1);
      expect(strokeCenter.y).toBeCloseTo(30, 1);

      const shapeCenter = elementCenter(shapeElement);
      expect(shapeCenter).toEqual({ x: 100, y: 75 });

      const textCenter = elementCenter(textElement);
      expect(textCenter.x).toBeCloseTo(152.8, 0);
      expect(textCenter.y).toBe(192);

      const chartCenter = elementCenter(chartElement);
      expect(chartCenter).toEqual({ x: 400, y: 125 });

      const imageCenter = elementCenter(imageElement);
      expect(imageCenter).toEqual({ x: 110, y: 95 });
    });
  });

  describe('chart parsing integration', () => {
    it('parsed labels and values create valid chart element', () => {
      const labels = parseChartLabels('A, B, C, D');
      const values = parseChartValues('10, 20, 30, 40');

      expect(labels).toEqual(['A', 'B', 'C', 'D']);
      expect(values).toEqual([10, 20, 30, 40]);

      const chart: CanvasElement = {
        type: 'chart',
        id: 'ch-new',
        chartType: 'bar',
        title: 'Test Chart',
        labels,
        values,
        x: 0,
        y: 0,
        width: 300,
        height: 200,
      };

      const canvas = createCanvas({
        title: 'Chart Test',
        scene: { version: 1, elements: [chart] },
      });

      expect(canvas.scene.elements[0].type).toBe('chart');
      const svg = canvasSceneToSvg(canvas.scene);
      expect(svg).toContain('<rect');
    });
  });

  describe('isImageElement guard integration', () => {
    it('correctly identifies image elements in mixed scene', () => {
      const images = allElements.filter(isImageElement);
      expect(images).toHaveLength(1);
      expect(images[0].id).toBe('img-1');
    });

    it('rejects non-image elements', () => {
      expect(isImageElement(strokeElement)).toBe(false);
      expect(isImageElement(shapeElement)).toBe(false);
      expect(isImageElement(textElement)).toBe(false);
      expect(isImageElement(chartElement)).toBe(false);
    });
  });
});
