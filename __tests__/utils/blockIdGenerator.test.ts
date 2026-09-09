import { generateBlockId, injectBlockIds, stripBlockIds } from '../../src/utils/blockIdGenerator';

describe('blockIdGenerator', () => {
  test('generateBlockId is stable', () => {
    const id1 = generateBlockId('Hello world');
    const id2 = generateBlockId('Hello world');
    expect(id1).toBe(id2);
  });

  test('generateBlockId is different for different content', () => {
    const id1 = generateBlockId('Hello');
    const id2 = generateBlockId('World');
    expect(id1).not.toBe(id2);
  });

  test('injectBlockIds adds anchor to heading', () => {
    const input = '# My Heading';
    const output = injectBlockIds(input);
    expect(output).toMatch(/\^[a-f0-9]{8}/);
  });

  test('stripBlockIds removes anchors', () => {
    const input = '# My Heading ^abc12345';
    expect(stripBlockIds(input)).toBe('# My Heading');
  });

  test('stable IDs on re-inject', () => {
    const input = '# My Heading';
    const out1 = injectBlockIds(input);
    const out2 = injectBlockIds(out1);
    expect(out1).toBe(out2);
  });
});