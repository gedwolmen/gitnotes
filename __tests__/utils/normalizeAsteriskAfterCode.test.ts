import { normalizeAsteriskAfterCode } from '../../src/utils/normalizeAsteriskAfterCode';

describe('normalizeAsteriskAfterCode (issue #678)', () => {
  test('rewrites *italic* immediately after a code span to _italic_', () => {
    expect(normalizeAsteriskAfterCode('child with `code` and *italic*')).toBe(
      'child with `code` and _italic_',
    );
  });

  test('rewrites **bold** immediately after a code span to __bold__', () => {
    expect(normalizeAsteriskAfterCode('item with `multi word code` and **end bold**')).toBe(
      'item with `multi word code` and __end bold__',
    );
  });

  test('does not rewrite asterisks elsewhere on the line', () => {
    expect(normalizeAsteriskAfterCode('start *italic* before any code')).toBe(
      'start *italic* before any code',
    );
  });

  test('does not rewrite **bold** that has no preceding code', () => {
    expect(normalizeAsteriskAfterCode('plain **bold** no code')).toBe('plain **bold** no code');
  });

  test('handles multiple code spans on one line', () => {
    expect(
      normalizeAsteriskAfterCode('a `c1` and *one*, then `c2` and **two**'),
    ).toBe('a `c1` and _one_, then `c2` and __two__');
  });

  test('preserves the code span content unchanged', () => {
    expect(normalizeAsteriskAfterCode('see `*not italic*` and `code` *italic*')).toBe(
      'see `*not italic*` and `code` _italic_',
    );
  });

  test('does not eat asterisks across newlines', () => {
    expect(
      normalizeAsteriskAfterCode('line one with `code` and end\n*starts a line*'),
    ).toBe('line one with `code` and end\n*starts a line*');
  });

  test('preserves triple-asterisk emphasis (***triple***)', () => {
    expect(normalizeAsteriskAfterCode('with `code` then ***triple***')).toBe(
      'with `code` then ***triple***',
    );
  });

  test('returns input unchanged when no asterisks present', () => {
    expect(normalizeAsteriskAfterCode('plain text only')).toBe('plain text only');
  });
});
