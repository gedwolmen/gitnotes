import {
  DiagramParseError,
  migrateDiagramDocument,
  parseDiagramDocument,
  validateDiagramDocument,
} from '../../../../src/services/diagram/core/parser';

describe('DiagramDocument parser', () => {
  // -------------------------------------------------------------------------
  // Happy path — well-formed documents
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — valid input', () => {
    it('parses an empty document (version 1, no objects)', () => {
      const result = parseDiagramDocument('{"version":1,"objects":[]}');
      expect(result.version).toBe(1);
      expect(result.objects).toEqual([]);
    });

    it('parses a minimal box object', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'box-1',
            type: 'box',
            z: 1,
            parentId: null,
            color: 'white',
            left: 0,
            top: 0,
            right: 3,
            bottom: 2,
            style: 'light',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      expect(result.objects).toHaveLength(1);
      expect(result.objects[0]!.type).toBe('box');
    });

    it('parses a line object', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'line-1',
            type: 'line',
            z: 1,
            parentId: null,
            color: 'cyan',
            x1: 0,
            y1: 0,
            x2: 4,
            y2: 0,
            style: 'smooth',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      expect(result.objects[0]!.type).toBe('line');
    });

    it('parses an elbow object', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'elbow-1',
            type: 'elbow',
            z: 1,
            parentId: null,
            color: 'red',
            x1: 0,
            y1: 0,
            x2: 3,
            y2: 2,
            style: 'light',
            orientation: 'horizontal-first',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      expect(result.objects[0]!.type).toBe('elbow');
    });

    it('parses a paint object with single cell brush', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'paint-1',
            type: 'paint',
            z: 1,
            parentId: null,
            color: 'yellow',
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
            brush: '#',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      expect(result.objects[0]!.type).toBe('paint');
    });

    it('parses a text object', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'text-1',
            type: 'text',
            z: 1,
            parentId: null,
            color: 'green',
            x: 1,
            y: 2,
            content: 'Hello',
            border: 'single',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      expect(result.objects[0]!.type).toBe('text');
    });

    it('parses all ink colors', () => {
      const colors = ['white', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
      for (const color of colors) {
        const json = JSON.stringify({
          version: 1,
          objects: [
            {
              id: `obj-${color}`,
              type: 'line',
              z: 1,
              parentId: null,
              color,
              x1: 0, y1: 0, x2: 1, y2: 0,
              style: 'smooth',
            },
          ],
        });
        expect(() => parseDiagramDocument(json)).not.toThrow();
      }
    });

    it('parses all box styles', () => {
      const styles: Array<'auto' | 'light' | 'heavy' | 'double' | 'dashed'> = [
        'auto', 'light', 'heavy', 'double', 'dashed',
      ];
      for (const style of styles) {
        const json = JSON.stringify({
          version: 1,
          objects: [
            {
              id: `box-${style}`,
              type: 'box',
              z: 1, parentId: null,
              color: 'white',
              left: 0, top: 0, right: 1, bottom: 1,
              style,
            },
          ],
        });
        expect(() => parseDiagramDocument(json)).not.toThrow();
      }
    });

    it('parses all text border modes', () => {
      const modes = ['none', 'single', 'double', 'underline'];
      for (const border of modes) {
        const json = JSON.stringify({
          version: 1,
          objects: [
            {
              id: `text-${border}`,
              type: 'text',
              z: 1, parentId: null,
              color: 'white',
              x: 0, y: 0,
              content: 'Hi',
              border,
            },
          ],
        });
        expect(() => parseDiagramDocument(json)).not.toThrow();
      }
    });

    it('returns a frozen DrawDocument', () => {
      const result = parseDiagramDocument('{"version":1,"objects":[]}');
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.objects)).toBe(true);
    });

    it('deep-freezes paint points array and individual point objects', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          {
            id: 'paint-1',
            type: 'paint',
            z: 1,
            parentId: null,
            color: 'yellow',
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
            brush: '#',
          },
        ],
      });
      const result = parseDiagramDocument(json);
      const paint = result.objects[0]!;
      expect(paint.type).toBe('paint');
      expect(Object.isFrozen(paint)).toBe(true);
      expect(Object.isFrozen((paint as { readonly points: readonly { readonly x: number; readonly y: number }[] }).points)).toBe(true);
      expect(Object.isFrozen((paint as { readonly points: readonly { readonly x: number; readonly y: number }[] }).points[0]!)).toBe(true);
      expect(Object.isFrozen((paint as { readonly points: readonly { readonly x: number; readonly y: number }[] }).points[1]!)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Reject malformed JSON
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — malformed JSON', () => {
    it('rejects non-JSON strings', () => {
      expect(() => parseDiagramDocument('not json')).toThrow(DiagramParseError);
      expect(() => parseDiagramDocument('')).toThrow(DiagramParseError);
      expect(() => parseDiagramDocument('{broken}')).toThrow(DiagramParseError);
    });

    it('rejects non-object JSON (e.g. a string or array)', () => {
      expect(() => parseDiagramDocument('"hello"')).toThrow(DiagramParseError);
      expect(() => parseDiagramDocument('[1,2,3]')).toThrow(DiagramParseError);
      expect(() => parseDiagramDocument('null')).toThrow(DiagramParseError);
      expect(() => parseDiagramDocument('123')).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // Reject wrong version
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — wrong version', () => {
    it('rejects version 0', () => {
      expect(() => parseDiagramDocument('{"version":0,"objects":[]}')).toThrow(DiagramParseError);
    });

    it('rejects version 2', () => {
      expect(() => parseDiagramDocument('{"version":2,"objects":[]}')).toThrow(DiagramParseError);
    });

    it('rejects missing version', () => {
      expect(() => parseDiagramDocument('{"objects":[]}')).toThrow(DiagramParseError);
    });

    it('rejects non-integer version', () => {
      expect(() => parseDiagramDocument('{"version":"1","objects":[]}')).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // Reject wrong types / missing fields
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — missing / wrong fields', () => {
    it('rejects objects array missing', () => {
      expect(() => parseDiagramDocument('{"version":1}')).toThrow(DiagramParseError);
    });

    it('rejects objects as non-array', () => {
      expect(() => parseDiagramDocument('{"version":1,"objects":"not-array"}')).toThrow(DiagramParseError);
    });

    it('rejects box with missing left field', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'b1', type: 'box', z: 1, parentId: null, color: 'white', top: 0, right: 1, bottom: 1, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects box with non-integer coordinates', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'b1', type: 'box', z: 1, parentId: null, color: 'white', left: 0.5, top: 0, right: 1, bottom: 1, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects line with wrong type field', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'l1', type: 'lin', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects paint with empty points array', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'p1', type: 'paint', z: 1, parentId: null, color: 'white', points: [], brush: '#' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects text with missing content field', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 't1', type: 'text', z: 1, parentId: null, color: 'white', x: 0, y: 0, border: 'none' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects unknown color', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'l1', type: 'line', z: 1, parentId: null, color: 'purple', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects empty id field', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: '', type: 'line', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // Reject invalid rect bounds
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — invalid box bounds', () => {
    it('rejects box where left > right', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'b1', type: 'box', z: 1, parentId: null, color: 'white', left: 5, top: 0, right: 3, bottom: 2, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects box where top > bottom', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'b1', type: 'box', z: 1, parentId: null, color: 'white', left: 0, top: 5, right: 3, bottom: 2, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // Reject invalid brush
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — invalid paint brush', () => {
    it('rejects multi-character brush', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'p1', type: 'paint', z: 1, parentId: null, color: 'white', points: [{ x: 0, y: 0 }], brush: '##' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects whitespace-only brush', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'p1', type: 'paint', z: 1, parentId: null, color: 'white', points: [{ x: 0, y: 0 }], brush: '   ' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects empty string brush', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'p1', type: 'paint', z: 1, parentId: null, color: 'white', points: [{ x: 0, y: 0 }], brush: '' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // Reject duplicate IDs
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — duplicate IDs', () => {
    it('rejects two objects with the same id', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'obj-1', type: 'line', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
          { id: 'obj-1', type: 'box', z: 2, parentId: null, color: 'white', left: 0, top: 0, right: 1, bottom: 1, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // validateDiagramDocument (already-parsed object)
// -------------------------------------------------------------------------

  describe('validateDiagramDocument — pre-parsed object', () => {
    it('accepts a valid already-parsed object', () => {
      const parsed = { version: 1, objects: [] };
      expect(() => validateDiagramDocument(parsed)).not.toThrow();
    });

    it('rejects a non-object at root', () => {
      expect(() => validateDiagramDocument('not an object')).toThrow(DiagramParseError);
    });

    it('rejects wrong version from pre-parsed object', () => {
      expect(() => validateDiagramDocument({ version: 99, objects: [] })).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // DiagramParseError
  // -------------------------------------------------------------------------

  describe('DiagramParseError', () => {
    it('has the correct name', () => {
      try {
        parseDiagramDocument('not json');
      } catch (err) {
        expect((err as DiagramParseError).name).toBe('DiagramParseError');
      }
    });

    it('is an Error instance', () => {
      expect(() => parseDiagramDocument('not json')).toThrow(Error);
    });
  });

  // -------------------------------------------------------------------------
  // Parse boundary — Zod discriminated union enforces `type` discriminator
  // -------------------------------------------------------------------------

  describe('parseDiagramDocument — discriminated union boundary', () => {
    it('rejects objects with an unrecognised type discriminator (invalid union member)', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'obj-1', type: 'invalid', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects objects with a near-miss type (e.g. "lin" instead of "line")', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'obj-1', type: 'lin', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });

    it('rejects objects with a near-miss type (e.g. "boxx" instead of "box")', () => {
      const json = JSON.stringify({
        version: 1,
        objects: [
          { id: 'obj-1', type: 'boxx', z: 1, parentId: null, color: 'white', left: 0, top: 0, right: 1, bottom: 1, style: 'light' },
        ],
      });
      expect(() => parseDiagramDocument(json)).toThrow(DiagramParseError);
    });
  });

  // -------------------------------------------------------------------------
  // migrateDiagramDocument — version routing
  // -------------------------------------------------------------------------

  describe('migrateDiagramDocument', () => {
    describe('v1 documents', () => {
      it('returns ok=true with the parsed DrawDocument', () => {
        const json = JSON.stringify({
          version: 1,
          objects: [
            {
              id: 'box-1', type: 'box', z: 1, parentId: null,
              color: 'white', left: 0, top: 0, right: 3, bottom: 2, style: 'light',
            },
          ],
        });
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.version).toBe(1);
          expect(result.document.objects).toHaveLength(1);
          expect(Object.isFrozen(result.document)).toBe(true);
        }
      });

      it('accepts a pre-parsed v1 object', () => {
        const parsed = {
          version: 1,
          objects: [
            {
              id: 'line-1', type: 'line', z: 1, parentId: null,
              color: 'cyan', x1: 0, y1: 0, x2: 4, y2: 0, style: 'smooth',
            },
          ],
        };
        const result = migrateDiagramDocument(parsed);
        expect(result.ok).toBe(true);
      });

      it('performs strict v1 validation even through migration entry point', () => {
        const json = JSON.stringify({
          version: 1,
          objects: [
            { id: 'b1', type: 'box', z: 1, parentId: null, color: 'white', left: 5, top: 0, right: 3, bottom: 2, style: 'light' },
          ],
        });
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(false);
        if (result.ok === false) {
          expect(result.reason).toContain('v1 parse error');
        }
      });

      it('deep-freezes v1 documents returned via migration', () => {
        const json = JSON.stringify({ version: 1, objects: [] });
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(Object.isFrozen(result.document)).toBe(true);
          expect(Object.isFrozen(result.document.objects)).toBe(true);
        }
      });
    });

    describe('unsupported future versions', () => {
      it('returns ok=false for version 2', () => {
        const json = JSON.stringify({ version: 2, objects: [] });
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.version).toBe(2);
          expect(result.reason).toContain('2');
          expect(result.reason).toContain('not supported');
        }
      });

      it('returns ok=false for version 99', () => {
        const json = JSON.stringify({ version: 99, objects: [] });
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.version).toBe(99);
        }
      });

      it('does not throw for unsupported versions — returns actionable result', () => {
        const json = JSON.stringify({ version: 3, objects: [{ id: 'any', type: 'line', z: 1, parentId: null, color: 'white', x1: 0, y1: 0, x2: 1, y2: 0, style: 'smooth' }] });
        expect(() => migrateDiagramDocument(json)).not.toThrow();
        const result = migrateDiagramDocument(json);
        expect(result.ok).toBe(false);
      });

      it('still throws DiagramParseError for malformed JSON even in migration entry point', () => {
        expect(() => migrateDiagramDocument('not json')).toThrow(DiagramParseError);
      });

      it('still throws DiagramParseError for non-object root even in migration entry point', () => {
        expect(() => migrateDiagramDocument('"hello"')).toThrow(DiagramParseError);
        expect(() => migrateDiagramDocument('null')).toThrow(DiagramParseError);
      });
    });
  });
});
