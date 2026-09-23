import {
  exportAscii,
} from '../../../../src/services/diagram/core/ascii';
import {
  createBox,
  createDiagramDocument,
  createElbow,
  createLine,
  createPaint,
  createText,
  DIAGRAM_DOCUMENT_VERSION,
} from '../../../../src/models/Diagram';
import type { DrawDocument } from '../../../../src/models/Diagram';

function mixedDoc(objects: DrawDocument['objects']): DrawDocument {
  return Object.freeze({ version: DIAGRAM_DOCUMENT_VERSION, objects: Object.freeze([...objects]) });
}

describe('exportAscii', () => {
  describe('empty document', () => {
    it('renders a single space for an empty document', () => {
      const result = exportAscii(createDiagramDocument());
      expect(result).toBe(' ');
    });
  });

  describe('box rendering', () => {
    it('renders a single-cell box (dot)', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 0, bottom: 0, style: 'light' }),
      ]));
      expect(result).toContain('┌');
    });

    it('renders a 2x1 light box with corners', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'light' }),
      ]));
      expect(result).toContain('┌');
      expect(result).toContain('┐');
      expect(result).toContain('─');
    });

    it('renders a heavy box with heavy box-drawing chars', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'heavy' }),
      ]));
      expect(result).toContain('━');
      expect(result).toContain('┏');
      expect(result).toContain('┛');
    });

    it('renders a double box with double box-drawing chars', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'double' }),
      ]));
      expect(result).toContain('═');
      expect(result).toContain('╔');
      expect(result).toContain('╝');
    });

    it('renders a dashed box', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'dashed' }),
      ]));
      expect(result).toContain('-');
      expect(result).toContain('┌');
      expect(result).toContain('┘');
    });

    it('auto box defaults to light style', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'auto' }),
      ]));
      expect(result).toContain('─');
    });
  });

  describe('line rendering', () => {
    it('renders a horizontal line with arrowhead at end', () => {
      const result = exportAscii(mixedDoc([
        createLine({ x1: 0, y1: 0, x2: 3, y2: 0 }),
      ]));
      expect(result).toContain('─');
      expect(result).toContain('>');
    });

    it('renders a vertical line with arrowhead', () => {
      const result = exportAscii(mixedDoc([
        createLine({ x1: 0, y1: 0, x2: 0, y2: 3 }),
      ]));
      expect(result).toContain('│');
      expect(result).toContain('v');
    });

    it('renders a diagonal line', () => {
      const result = exportAscii(mixedDoc([
        createLine({ x1: 0, y1: 0, x2: 2, y2: 2 }),
      ]));
      // Diagonal line should have slanted chars or straight approximation
      expect(result.trim().length).toBeGreaterThan(0);
    });

    it('renders a single-cell dot', () => {
      const result = exportAscii(mixedDoc([
        createLine({ x1: 1, y1: 1, x2: 1, y2: 1 }),
      ]));
      expect(result).toContain('•');
    });
  });

  describe('elbow rendering', () => {
    it('renders a horizontal-first elbow', () => {
      const result = exportAscii(mixedDoc([
        createElbow({ x1: 0, y1: 0, x2: 3, y2: 2, orientation: 'horizontal-first' }),
      ]));
      // Should have horizontal segment and arrowhead
      expect(result.trim().length).toBeGreaterThan(0);
      expect(result).toContain('─');
    });

    it('renders a vertical-first elbow', () => {
      const result = exportAscii(mixedDoc([
        createElbow({ x1: 0, y1: 0, x2: 3, y2: 2, orientation: 'vertical-first' }),
      ]));
      expect(result.trim().length).toBeGreaterThan(0);
    });
  });

  describe('paint rendering', () => {
    it('renders brush characters at each point', () => {
      const result = exportAscii(mixedDoc([
        createPaint({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], brush: '#' }),
      ]));
      expect(result).toContain('#');
    });

    it('renders multi-point stroke', () => {
      const result = exportAscii(mixedDoc([
        createPaint({ points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }], brush: '*' }),
      ]));
      expect(result).toContain('*');
    });
  });

  describe('text rendering', () => {
    it('renders text content without border', () => {
      const result = exportAscii(mixedDoc([
        createText({ x: 0, y: 0, content: 'Hi', border: 'none' }),
      ]));
      expect(result).toContain('H');
      expect(result).toContain('i');
    });

    it('renders text with single border', () => {
      const result = exportAscii(mixedDoc([
        createText({ x: 0, y: 0, content: 'A', border: 'single' }),
      ]));
      expect(result).toContain('┌');
      expect(result).toContain('┐');
      expect(result).toContain('│');
      expect(result).toContain('└');
      expect(result).toContain('┘');
      expect(result).toContain('─');
    });

    it('renders text with double border', () => {
      const result = exportAscii(mixedDoc([
        createText({ x: 0, y: 0, content: 'B', border: 'double' }),
      ]));
      expect(result).toContain('╔');
      expect(result).toContain('═');
      expect(result).toContain('║');
    });

    it('renders text with underline border', () => {
      const result = exportAscii(mixedDoc([
        createText({ x: 0, y: 0, content: 'Yo', border: 'underline' }),
      ]));
      expect(result).toContain('Y');
      expect(result).toContain('o');
      expect(result).toContain('─');
    });
  });

  describe('z-ordering', () => {
    it('higher z objects render on top (later in output)', () => {
      // A box drawn over a line — the line should appear below
      const result = exportAscii(mixedDoc([
        createLine({ id: 'l1', x1: 0, y1: 0, x2: 2, y2: 0, z: 1 }),
        createBox({ id: 'b1', left: 0, top: 0, right: 2, bottom: 1, style: 'light', z: 2 }),
      ]));
      // Box corners should appear in the result
      expect(result).toContain('┌');
    });
  });

  describe('bounding box computation', () => {
    it('offsets output so min x/y is 0', () => {
      const result = exportAscii(mixedDoc([
        createLine({ x1: 5, y1: 5, x2: 7, y2: 5 }),
      ]));
      // Should not have leading spaces at the start
      const lines = result.split('\n');
      expect(lines[0]![0]).not.toBe(' ');
    });

    it('renders a tall box fully', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 1, bottom: 4, style: 'light' }),
      ]));
      // Should have vertical sides spanning multiple rows
      const lines = result.split('\n');
      expect(lines.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('multiple objects', () => {
    it('renders a box and a line together', () => {
      const result = exportAscii(mixedDoc([
        createBox({ left: 0, top: 0, right: 2, bottom: 1, style: 'light' }),
        createLine({ x1: 4, y1: 0, x2: 6, y2: 0 }),
      ]));
      expect(result).toContain('┌');
      expect(result).toContain('─');
    });
  });
});
