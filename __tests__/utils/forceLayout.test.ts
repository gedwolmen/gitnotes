import {
  computeForceLayout,
  SIM_ITERATIONS,
} from '../../src/utils/forceLayout';

function makeNodes(n: number, width = 2000, height = 2000) {
  const nodes = [];
  for (let i = 0; i < n; i++) {
    const angle = (i / n) * Math.PI * 2;
    nodes.push({
      id: `note-${i}`,
      x: width / 2 + Math.cos(angle) * 300,
      y: height / 2 + Math.sin(angle) * 300,
    });
  }
  return nodes;
}

describe('computeForceLayout', () => {
  it('returns empty array for empty input', () => {
    expect(computeForceLayout([], [], 2000, 2000)).toEqual([]);
  });

  it('keeps all node ids present in the result', () => {
    const nodes = makeNodes(20);
    const result = computeForceLayout(nodes, [], 2000, 2000);
    expect(result).toHaveLength(20);
    expect(new Set(result.map((n) => n.id))).toEqual(new Set(nodes.map((n) => n.id)));
  });

  it('clamps every position inside the canvas bounds', () => {
    const nodes = makeNodes(50);
    const result = computeForceLayout(nodes, [], 2000, 2000);
    for (const n of result) {
      expect(n.x).toBeGreaterThanOrEqual(0);
      expect(n.x).toBeLessThanOrEqual(2000);
      expect(n.y).toBeGreaterThanOrEqual(0);
      expect(n.y).toBeLessThanOrEqual(2000);
    }
  });

  it('respects edges via id lookup (nodes referenced by edges move toward each other)', () => {
    const nodes = [
      { id: 'a', x: 400, y: 1000 },
      { id: 'b', x: 1600, y: 1000 },
      { id: 'c', x: 1000, y: 300 },
    ];
    const result = computeForceLayout(nodes, [{ from: 'a', to: 'b' }], 2000, 2000);
    const byId = new Map(result.map((n) => [n.id, n]));
    expect(byId.get('a')).toBeDefined();
    expect(byId.get('b')).toBeDefined();

    const distBefore = Math.hypot(1600 - 400, 0);
    const distAfter = Math.hypot(
      byId.get('b')!.x - byId.get('a')!.x,
      byId.get('b')!.y - byId.get('a')!.y,
    );
    expect(distAfter).toBeLessThan(distBefore);
  });

  it('completes 200-node layout within a bounded time budget (bug-hunt loop3 #11)', () => {
    const nodes = makeNodes(200);
    const start = Date.now();
    const result = computeForceLayout(nodes, [], 2000, 2000);
    const elapsed = Date.now() - start;

    expect(result).toHaveLength(200);
    expect(elapsed).toBeLessThan(5000);
  }, 10_000);

  it('runs exactly SIM_ITERATIONS convergence passes (deterministic output)', () => {
    expect(SIM_ITERATIONS).toBe(250);
    const nodes = makeNodes(10);
    const first = computeForceLayout(nodes, [], 2000, 2000);
    const second = computeForceLayout(nodes, [], 2000, 2000);
    expect(first).toEqual(second);
  });
});
