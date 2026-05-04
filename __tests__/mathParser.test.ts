import { markdownTestCases } from './helpers/markdownTestCases';
import { parseMath, type MathSegment } from '../src/utils/mathParser';

describe('parseMath', () => {
  const expectSegment = (segment: MathSegment, type: MathSegment['type'], content: string, source: string) => {
    expect(segment.type).toBe(type);
    expect(segment.content).toBe(content);
    expect(source.slice(segment.startIndex, segment.endIndex)).toBe(
      type === 'inline' ? `$${content}$` : `$$${content}$$`,
    );
  };

  test('parses inline math from fixtures', () => {
    const segments = parseMath(markdownTestCases.mathInline);

    expect(segments).toHaveLength(1);
    expectSegment(segments[0]!, 'inline', 'E = mc^2', markdownTestCases.mathInline);
  });

  test('parses block math from fixtures', () => {
    const segments = parseMath(markdownTestCases.mathBlock);

    expect(segments).toHaveLength(1);
    expectSegment(segments[0]!, 'block', '\\sum_{i=1}^n x_i', markdownTestCases.mathBlock);
  });

  test('parses multiple inline expressions in one line', () => {
    const source = 'One $a$ plus $b$ equals $c$.';
    const segments = parseMath(source);

    expect(segments).toHaveLength(3);
    expectSegment(segments[0]!, 'inline', 'a', source);
    expectSegment(segments[1]!, 'inline', 'b', source);
    expectSegment(segments[2]!, 'inline', 'c', source);
  });

  test('ignores escaped dollar signs', () => {
    const source = 'Price is \\$not math\\$ and $x$ is math.';
    const segments = parseMath(source);

    expect(segments).toHaveLength(1);
    expectSegment(segments[0]!, 'inline', 'x', source);
  });

  test('ignores empty inline delimiters', () => {
    const source = 'This is $ $ not math.';
    const segments = parseMath(source);

    expect(segments).toHaveLength(0);
  });

  test('parses inline math adjacent to text', () => {
    const source = 'The value $x$ equals $y$.';
    const segments = parseMath(source);

    expect(segments).toHaveLength(2);
    expectSegment(segments[0]!, 'inline', 'x', source);
    expectSegment(segments[1]!, 'inline', 'y', source);
  });

  test('parses multi-line block math', () => {
    const source = `Before

$$
\\sum_{i=1}^n
 x_i
$$
After`;
    const segments = parseMath(source);

    expect(segments).toHaveLength(1);
    expectSegment(segments[0]!, 'block', '\n\\sum_{i=1}^n\n x_i\n', source);
  });
});
