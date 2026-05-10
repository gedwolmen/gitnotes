import { parseMath } from '../../src/utils/mathParser';

describe('parseMath multi-math line (issue #688)', () => {
  test('three inline math expressions on one line all parse', () => {
    const input =
      'Mixed: when $a \\neq 0$, the equation $ax^2 + bx + c = 0$ has solutions $x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$.';
    const segments = parseMath(input).filter((s) => s.type === 'inline');
    expect(segments).toHaveLength(3);
    expect(segments[0].content).toBe('a \\neq 0');
    expect(segments[1].content).toBe('ax^2 + bx + c = 0');
    expect(segments[2].content).toBe('x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}');
  });

  test('endIndex of segment N is BEFORE startIndex of segment N+1', () => {
    const input = 'a $x$ b $y$ c $z$ d';
    const segs = parseMath(input).filter((s) => s.type === 'inline');
    expect(segs).toHaveLength(3);
    for (let i = 0; i + 1 < segs.length; i++) {
      expect(segs[i].endIndex).toBeLessThan(segs[i + 1].startIndex);
    }
  });

  test('two adjacent math segments separated only by space both parse', () => {
    const segs = parseMath('$a$ $b$').filter((s) => s.type === 'inline');
    expect(segs).toHaveLength(2);
    expect(segs[0].content).toBe('a');
    expect(segs[1].content).toBe('b');
  });
});
