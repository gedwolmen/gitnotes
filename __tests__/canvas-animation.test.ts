import { describe, expect, it } from '@jest/globals';
import { createCanvas, updateCanvas } from '../src/models/Canvas';
import type { CanvasElement, CanvasAnimation } from '../src/models/Canvas';

describe('CanvasAnimation model', () => {
  const pulseAnimation: CanvasAnimation = {
    type: 'pulse',
    duration: 2000,
    loop: true,
  };

  const fadeAnimation: CanvasAnimation = {
    type: 'fade',
    duration: 1500,
    loop: false,
  };

  describe('round-trip through createCanvas', () => {
    it('preserves animation on text element', () => {
      const element: CanvasElement = {
        type: 'text',
        id: 'txt-1',
        text: 'Hello',
        x: 10,
        y: 20,
        fontSize: 16,
        color: '#000',
        animation: pulseAnimation,
      };

      const canvas = createCanvas({
        title: 'Anim Test',
        scene: { version: 1, elements: [element] },
      });

      const el = canvas.scene.elements[0];
      expect(el.animation).toEqual(pulseAnimation);
    });

    it('preserves animation on shape element', () => {
      const element: CanvasElement = {
        type: 'shape',
        id: 'sh-1',
        shape: 'rect',
        color: '#FF0000',
        width: 2,
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 50,
        animation: fadeAnimation,
      };

      const canvas = createCanvas({
        title: 'Shape Anim',
        scene: { version: 1, elements: [element] },
      });

      expect(canvas.scene.elements[0].animation).toEqual(fadeAnimation);
    });

    it('preserves animation on image element', () => {
      const element: CanvasElement = {
        type: 'image',
        id: 'img-1',
        data: 'base64data',
        mimeType: 'image/jpeg',
        x: 0,
        y: 0,
        width: 200,
        height: 150,
        animation: { type: 'spin', duration: 3000, loop: true },
      };

      const canvas = createCanvas({
        title: 'Image Anim',
        scene: { version: 1, elements: [element] },
      });

      expect(canvas.scene.elements[0].animation).toEqual({ type: 'spin', duration: 3000, loop: true });
    });
  });

  describe('round-trip through updateCanvas', () => {
    it('preserves animation when updating other fields', () => {
      const original = createCanvas({
        title: 'Original',
        scene: {
          version: 1,
          elements: [{
            type: 'text',
            id: 'txt-1',
            text: 'Hello',
            x: 10,
            y: 20,
            fontSize: 16,
            color: '#000',
            animation: pulseAnimation,
          }],
        },
      });

      const updated = updateCanvas(original, { title: 'Updated Title' });
      expect(updated.title).toBe('Updated Title');
      expect(updated.scene.elements[0].animation).toEqual(pulseAnimation);
    });
  });

  describe('optional field backward compatibility', () => {
    it('elements without animation field are valid', () => {
      const element: CanvasElement = {
        type: 'text',
        id: 'txt-1',
        text: 'No animation',
        x: 10,
        y: 20,
        fontSize: 16,
        color: '#000',
      };

      const canvas = createCanvas({
        title: 'Legacy',
        scene: { version: 1, elements: [element] },
      });

      expect(canvas.scene.elements[0].animation).toBeUndefined();
    });

    it('setting animation to undefined is equivalent to omitting it', () => {
      const withUndefined: CanvasElement = {
        type: 'text',
        id: 'txt-1',
        text: 'Test',
        x: 10,
        y: 20,
        fontSize: 16,
        color: '#000',
        animation: undefined,
      };

      const withoutField: CanvasElement = {
        type: 'text',
        id: 'txt-1',
        text: 'Test',
        x: 10,
        y: 20,
        fontSize: 16,
        color: '#000',
      };

      const c1 = createCanvas({ title: 'A', scene: { version: 1, elements: [withUndefined] } });
      const c2 = createCanvas({ title: 'B', scene: { version: 1, elements: [withoutField] } });

      expect(c1.scene.elements[0].animation).toBeUndefined();
      expect(c2.scene.elements[0].animation).toBeUndefined();
    });
  });

  describe('JSON serialization', () => {
    it('preserves all animation fields through stringify/parse', () => {
      const element: CanvasElement = {
        type: 'shape',
        id: 'sh-1',
        shape: 'ellipse',
        color: '#0000FF',
        width: 3,
        x1: 10,
        y1: 20,
        x2: 110,
        y2: 70,
        animation: { type: 'translate', duration: 4000, loop: false },
      };

      const json = JSON.stringify(element);
      const parsed = JSON.parse(json) as CanvasElement;

      expect(parsed.animation).toEqual({ type: 'translate', duration: 4000, loop: false });
    });

    it('omits undefined animation from JSON output', () => {
      const element: CanvasElement = {
        type: 'text',
        id: 'txt-1',
        text: 'Test',
        x: 10,
        y: 20,
        fontSize: 16,
        color: '#000',
      };

      const json = JSON.stringify(element);
      expect(json).not.toContain('animation');
    });
  });

  describe('all animation types', () => {
    it.each(['pulse', 'fade', 'spin', 'translate'] as const)(
      'accepts %s animation type',
      (type) => {
        const element: CanvasElement = {
          type: 'text',
          id: 'txt-1',
          text: 'Test',
          x: 10,
          y: 20,
          fontSize: 16,
          color: '#000',
          animation: { type, duration: 1000, loop: true },
        };

        const canvas = createCanvas({
          title: 'Type Test',
          scene: { version: 1, elements: [element] },
        });

        expect(canvas.scene.elements[0].animation?.type).toBe(type);
      },
    );
  });
});
