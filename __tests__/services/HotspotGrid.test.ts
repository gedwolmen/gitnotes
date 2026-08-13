import { AtlasBounds, CanvasPoint, HotspotGrid } from '../../src/services/canvas/HotspotGrid';

describe('HotspotGrid', () => {
  const grid = new HotspotGrid();
  const BOUNDS: AtlasBounds = { x: 0, y: 0, width: 800, height: 600 };

  const cellAt = (
    cells: ReturnType<HotspotGrid['build']>,
    col: number,
    row: number,
  ) => cells.find((c) => c.col === col && c.row === row)!;

  describe('build', () => {
    it('places a single center point into cell (4,4)', () => {
      const points: CanvasPoint[] = [{ x: 400, y: 300, strokeIndex: 0 }];
      const cells = grid.build(BOUNDS, points);
      expect(cells).toHaveLength(64);
      expect(cellAt(cells, 4, 4).strokeIndices).toEqual([0]);
    });

    it('distributes 64 points across all 64 cells (1 per cell)', () => {
      const points: CanvasPoint[] = [];
      const cellW = BOUNDS.width / 8;
      const cellH = BOUNDS.height / 8;
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
          points.push({
            x: BOUNDS.x + col * cellW + cellW / 2,
            y: BOUNDS.y + row * cellH + cellH / 2,
            strokeIndex: row * 8 + col,
          });
        }
      }
      const cells = grid.build(BOUNDS, points);
      expect(cells).toHaveLength(64);
      for (const cell of cells) {
        expect(cell.strokeIndices).toHaveLength(1);
        expect(cell.strokeIndices[0]).toBe(cell.row * 8 + cell.col);
      }
    });

    it('collects 10 points in the same cell with sorted strokeIndices', () => {
      const points: CanvasPoint[] = [];
      for (let i = 0; i < 10; i++) {
        // All inside cell (0,0): x,y in [0,100) x [0,75)
        points.push({ x: 10 + i, y: 10 + i, strokeIndex: i });
      }
      const cells = grid.build(BOUNDS, points);
      expect(cellAt(cells, 0, 0).strokeIndices).toEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
      ]);
      const others = cells.filter((c) => !(c.col === 0 && c.row === 0));
      for (const c of others) {
        expect(c.strokeIndices).toEqual([]);
      }
    });

    it('sorts strokeIndices ascending when given in reverse order', () => {
      const points: CanvasPoint[] = [
        { x: 10, y: 10, strokeIndex: 5 },
        { x: 11, y: 11, strokeIndex: 3 },
        { x: 12, y: 12, strokeIndex: 9 },
        { x: 13, y: 13, strokeIndex: 1 },
      ];
      const cells = grid.build(BOUNDS, points);
      expect(cellAt(cells, 0, 0).strokeIndices).toEqual([1, 3, 5, 9]);
    });

    it('returns 64 empty cells for an empty points list', () => {
      const cells = grid.build(BOUNDS, []);
      expect(cells).toHaveLength(64);
      for (const c of cells) {
        expect(c.strokeIndices).toEqual([]);
      }
    });

    it('places logical (0,0) at cell (0,0)', () => {
      const cells = grid.build(BOUNDS, [{ x: 0, y: 0, strokeIndex: 0 }]);
      expect(cellAt(cells, 0, 0).strokeIndices).toEqual([0]);
    });

    it('clamps bottom-right edge to last cell (7,7)', () => {
      const cells = grid.build(BOUNDS, [
        { x: BOUNDS.width, y: BOUNDS.height, strokeIndex: 0 },
      ]);
      expect(cellAt(cells, 7, 7).strokeIndices).toEqual([0]);
    });

    it('ignores points outside bounds', () => {
      const cells = grid.build(BOUNDS, [
        { x: -1, y: 0, strokeIndex: 0 },
        { x: 0, y: -1, strokeIndex: 1 },
        { x: BOUNDS.width + 1, y: 0, strokeIndex: 2 },
        { x: 0, y: BOUNDS.height + 1, strokeIndex: 3 },
      ]);
      for (const c of cells) {
        expect(c.strokeIndices).toEqual([]);
      }
    });

    it('returns exactly gridSize * gridSize cells regardless of input', () => {
      expect(grid.build(BOUNDS, [])).toHaveLength(64);
      expect(grid.build(BOUNDS, [], 4)).toHaveLength(16);
      expect(grid.build(BOUNDS, [], 16)).toHaveLength(256);
    });

    it('returns empty grid (no crash) for zero-area bounds', () => {
      const zeroW: AtlasBounds = { x: 0, y: 0, width: 0, height: 600 };
      const zeroH: AtlasBounds = { x: 0, y: 0, width: 800, height: 0 };
      const pts: CanvasPoint[] = [{ x: 1, y: 1, strokeIndex: 0 }];

      const cw = grid.build(zeroW, pts);
      expect(cw).toHaveLength(64);
      for (const c of cw) expect(c.strokeIndices).toEqual([]);

      const ch = grid.build(zeroH, pts);
      expect(ch).toHaveLength(64);
      for (const c of ch) expect(c.strokeIndices).toEqual([]);
    });

    it('processes 10,000 points under 200ms on CI', () => {
      const points: CanvasPoint[] = [];
      for (let i = 0; i < 10_000; i++) {
        points.push({
          x: Math.random() * BOUNDS.width,
          y: Math.random() * BOUNDS.height,
          strokeIndex: i,
        });
      }
      const start = performance.now();
      const cells = grid.build(BOUNDS, points);
      const elapsed = performance.now() - start;

      expect(cells).toHaveLength(64);
      // Relaxed from <50ms after observing CI runners hit ~54ms on slow boxes.
      // Still catches O(n²) regressions — those would land in the 1000ms+ range.
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('findCell', () => {
    it('maps a center point to (4,4)', () => {
      expect(grid.findCell(BOUNDS, 400, 300)).toEqual({ col: 4, row: 4 });
    });

    it('maps (0,0) to (0,0)', () => {
      expect(grid.findCell(BOUNDS, 0, 0)).toEqual({ col: 0, row: 0 });
    });

    it('clamps right edge to col=7', () => {
      expect(grid.findCell(BOUNDS, BOUNDS.width, 100).col).toBe(7);
    });

    it('clamps bottom edge to row=7', () => {
      expect(grid.findCell(BOUNDS, 100, BOUNDS.height).row).toBe(7);
    });

    it('clamps points far outside bounds to edges', () => {
      expect(grid.findCell(BOUNDS, -1000, -1000)).toEqual({ col: 0, row: 0 });
      expect(grid.findCell(BOUNDS, 99999, 99999)).toEqual({ col: 7, row: 7 });
    });

    it('returns (0,0) for zero-area bounds', () => {
      const zero: AtlasBounds = { x: 0, y: 0, width: 0, height: 0 };
      expect(grid.findCell(zero, 5, 5)).toEqual({ col: 0, row: 0 });
    });
  });

  describe('contains', () => {
    it('returns true for interior points', () => {
      expect(grid.contains(BOUNDS, 400, 300)).toBe(true);
    });

    it('returns true for boundary points (inclusive)', () => {
      expect(grid.contains(BOUNDS, 0, 0)).toBe(true);
      expect(grid.contains(BOUNDS, BOUNDS.width, BOUNDS.height)).toBe(true);
    });

    it('returns false for points outside bounds', () => {
      expect(grid.contains(BOUNDS, -1, 0)).toBe(false);
      expect(grid.contains(BOUNDS, 0, -1)).toBe(false);
      expect(grid.contains(BOUNDS, BOUNDS.width + 1, 0)).toBe(false);
      expect(grid.contains(BOUNDS, 0, BOUNDS.height + 1)).toBe(false);
    });

    it('returns false for zero-area bounds', () => {
      const zero: AtlasBounds = { x: 0, y: 0, width: 0, height: 0 };
      expect(grid.contains(zero, 0, 0)).toBe(false);
    });
  });
});
