import {
  DIAGRAM_DOCUMENT_VERSION,
  BoxObject,
  BoxStyle,
  DrawDocument,
  DrawObject,
  ElbowObject,
  LineObject,
  PaintObject,
  TextObject,
  assertNever,
  createBox,
  createDiagramDocument,
  createElbow,
  createLine,
  createPaint,
  createText,
  generateObjectId,
  isValidRect,
} from '../../src/models/Diagram';

describe('Diagram model — factory functions', () => {
  describe('createBox', () => {
    it('creates a frozen box object with correct defaults', () => {
      const box = createBox({ left: 0, top: 0, right: 3, bottom: 2 });
      expect(box.type).toBe('box');
      expect(box.left).toBe(0);
      expect(box.right).toBe(3);
      expect(box.top).toBe(0);
      expect(box.bottom).toBe(2);
      expect(box.style).toBe('auto');
      expect(box.color).toBe('white');
      expect(box.z).toBe(1);
      expect(box.parentId).toBeNull();
      expect(typeof box.id).toBe('string');
      expect(Object.isFrozen(box)).toBe(true);
    });

    it('accepts all optional overrides', () => {
      const box = createBox({
        id: 'my-box',
        left: 1,
        top: 2,
        right: 5,
        bottom: 4,
        style: 'heavy',
        color: 'red',
        z: 10,
        parentId: 'parent-1',
      });
      expect(box.id).toBe('my-box');
      expect(box.style).toBe('heavy');
      expect(box.color).toBe('red');
      expect(box.z).toBe(10);
      expect(box.parentId).toBe('parent-1');
    });

    it('freezes the returned object', () => {
      const box = createBox({ left: 0, top: 0, right: 1, bottom: 1 });
      expect(Object.isFrozen(box)).toBe(true);
    });
  });

  describe('createLine', () => {
    it('creates a frozen line object with correct defaults', () => {
      const line = createLine({ x1: 0, y1: 0, x2: 5, y2: 0 });
      expect(line.type).toBe('line');
      expect(line.x1).toBe(0);
      expect(line.y1).toBe(0);
      expect(line.x2).toBe(5);
      expect(line.y2).toBe(0);
      expect(line.style).toBe('smooth');
      expect(line.color).toBe('white');
      expect(Object.isFrozen(line)).toBe(true);
    });
  });

  describe('createElbow', () => {
    it('creates a frozen elbow object with correct defaults', () => {
      const elbow = createElbow({ x1: 0, y1: 0, x2: 3, y2: 2 });
      expect(elbow.type).toBe('elbow');
      expect(elbow.orientation).toBe('horizontal-first');
      expect(elbow.style).toBe('light');
      expect(Object.isFrozen(elbow)).toBe(true);
    });

    it('accepts vertical-first orientation', () => {
      const elbow = createElbow({ x1: 0, y1: 0, x2: 3, y2: 2, orientation: 'vertical-first' });
      expect(elbow.orientation).toBe('vertical-first');
    });
  });

  describe('createPaint', () => {
    it('creates a frozen paint object with correct defaults', () => {
      const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }] as const;
      const paint = createPaint({ points: pts });
      expect(paint.type).toBe('paint');
      expect(paint.brush).toBe('#');
      expect(paint.points).toStrictEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }]);
      expect(Object.isFrozen(paint)).toBe(true);
    });
  });

  describe('createText', () => {
    it('creates a frozen text object with correct defaults', () => {
      const text = createText({ x: 0, y: 0, content: 'Hello' });
      expect(text.type).toBe('text');
      expect(text.content).toBe('Hello');
      expect(text.border).toBe('none');
      expect(Object.isFrozen(text)).toBe(true);
    });
  });

  describe('createDiagramDocument', () => {
    it('creates an empty document at version 1', () => {
      const doc = createDiagramDocument();
      expect(doc.version).toBe(DIAGRAM_DOCUMENT_VERSION);
      expect(doc.objects).toEqual([]);
      expect(Object.isFrozen(doc)).toBe(true);
      expect(Object.isFrozen(doc.objects)).toBe(true);
    });
  });

  describe('isValidRect', () => {
    it('returns true for a normal rect (left <= right, top <= bottom)', () => {
      expect(isValidRect({ left: 0, top: 0, right: 3, bottom: 2 })).toBe(true);
    });

    it('returns true for a single-cell rect (left === right, top === bottom)', () => {
      expect(isValidRect({ left: 5, top: 5, right: 5, bottom: 5 })).toBe(true);
    });

    it('returns false when left > right', () => {
      expect(isValidRect({ left: 5, top: 0, right: 3, bottom: 2 })).toBe(false);
    });

    it('returns false when top > bottom', () => {
      expect(isValidRect({ left: 0, top: 5, right: 3, bottom: 2 })).toBe(false);
    });
  });

  describe('generateObjectId', () => {
    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => generateObjectId()));
      expect(ids.size).toBe(100);
    });

    it('generates string IDs', () => {
      expect(typeof generateObjectId()).toBe('string');
    });
  });

  describe('assertNever', () => {
    it('throws with the given message', () => {
      expect(() => assertNever('x' as never, 'custom message')).toThrow('custom message');
    });

    it('throws with default message for unknown variant', () => {
      expect(() => assertNever('x' as never)).toThrow('Unexpected draw object variant');
    });
  });

  describe('DrawObject discriminated union', () => {
    it('can narrow box objects by type field', () => {
      const box = createBox({ left: 0, top: 0, right: 1, bottom: 1 });
      if (box.type === 'box') {
        expect((box as BoxObject).left).toBe(0);
      }
    });

    it('can narrow line objects by type field', () => {
      const line = createLine({ x1: 0, y1: 0, x2: 1, y2: 1 });
      if (line.type === 'line') {
        expect((line as LineObject).x1).toBe(0);
      }
    });

    it('can narrow elbow objects by type field', () => {
      const elbow = createElbow({ x1: 0, y1: 0, x2: 1, y2: 1 });
      if (elbow.type === 'elbow') {
        expect((elbow as ElbowObject).orientation).toBe('horizontal-first');
      }
    });

    it('can narrow paint objects by type field', () => {
      const paint = createPaint({ points: [{ x: 0, y: 0 }] });
      if (paint.type === 'paint') {
        expect((paint as PaintObject).brush).toBe('#');
      }
    });

    it('can narrow text objects by type field', () => {
      const text = createText({ x: 0, y: 0, content: 'Hi' });
      if (text.type === 'text') {
        expect((text as TextObject).content).toBe('Hi');
      }
    });
  });

  describe('readonly types', () => {
    it('factory functions produce frozen objects', () => {
      expect(Object.isFrozen(createBox({ left: 0, top: 0, right: 1, bottom: 1 }))).toBe(true);
      expect(Object.isFrozen(createLine({ x1: 0, y1: 0, x2: 1, y2: 1 }))).toBe(true);
      expect(Object.isFrozen(createElbow({ x1: 0, y1: 0, x2: 1, y2: 1 }))).toBe(true);
      expect(Object.isFrozen(createPaint({ points: [{ x: 0, y: 0 }] }))).toBe(true);
      expect(Object.isFrozen(createText({ x: 0, y: 0, content: 'Hi' }))).toBe(true);
      expect(Object.isFrozen(createDiagramDocument())).toBe(true);
    });

    it('nested arrays and objects in paint points are frozen', () => {
      const paint = createPaint({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
      expect(Object.isFrozen(paint.points)).toBe(true);
      expect(Object.isFrozen(paint.points[0]!)).toBe(true);
    });
  });
});
