import {
  TEMPLATE_MAX_TAGS,
  TEMPLATE_MAX_TAG_LENGTH,
  commitPendingTag,
  parseTagInput,
} from '../src/utils/templateTags';

describe('parseTagInput', () => {
  it('keeps a typed-but-not-finalized tag in the remainder', () => {
    const result = parseTagInput('foo', []);
    expect(result.committed).toEqual([]);
    expect(result.remainder).toBe('foo');
  });

  it('commits a tag when followed by a comma', () => {
    const result = parseTagInput('foo,', []);
    expect(result.committed).toEqual(['foo']);
    expect(result.remainder).toBe('');
  });

  it('commits a tag when followed by a space', () => {
    const result = parseTagInput('foo ', []);
    expect(result.committed).toEqual(['foo']);
    expect(result.remainder).toBe('');
  });

  it('commits multiple tags from one paste', () => {
    const result = parseTagInput('alpha, beta gamma,', []);
    expect(result.committed).toEqual(['alpha', 'beta', 'gamma']);
    expect(result.remainder).toBe('');
  });

  it('preserves trailing in-progress text', () => {
    const result = parseTagInput('alpha, bet', []);
    expect(result.committed).toEqual(['alpha']);
    expect(result.remainder).toBe('bet');
  });

  it('lowercases tags', () => {
    const result = parseTagInput('FOO,Bar ', []);
    expect(result.committed).toEqual(['foo', 'bar']);
  });

  it('dedupes against existing tags', () => {
    const result = parseTagInput('foo,bar,', ['foo']);
    expect(result.committed).toEqual(['foo', 'bar']);
  });

  it('respects max tag length', () => {
    const long = 'a'.repeat(TEMPLATE_MAX_TAG_LENGTH + 10);
    const result = parseTagInput(`${long},`, []);
    expect(result.committed[0]).toHaveLength(TEMPLATE_MAX_TAG_LENGTH);
  });

  it('respects max tag count', () => {
    const existing = Array.from({ length: TEMPLATE_MAX_TAGS }, (_, i) => `tag${i}`);
    const result = parseTagInput('overflow,', existing);
    expect(result.committed).toEqual(existing);
  });

  it('skips empty separators (consecutive commas)', () => {
    const result = parseTagInput('foo,,bar,', []);
    expect(result.committed).toEqual(['foo', 'bar']);
  });
});

describe('commitPendingTag', () => {
  it('commits a non-empty trimmed tag', () => {
    expect(commitPendingTag('  foo  ', [])).toEqual(['foo']);
  });

  it('returns existing list for empty input', () => {
    expect(commitPendingTag('   ', ['foo'])).toEqual(['foo']);
  });

  it('skips duplicates', () => {
    expect(commitPendingTag('foo', ['foo'])).toEqual(['foo']);
  });

  it('respects max length', () => {
    const long = 'a'.repeat(TEMPLATE_MAX_TAG_LENGTH + 5);
    const result = commitPendingTag(long, []);
    expect(result[0]).toHaveLength(TEMPLATE_MAX_TAG_LENGTH);
  });

  it('respects max count', () => {
    const existing = Array.from({ length: TEMPLATE_MAX_TAGS }, (_, i) => `tag${i}`);
    expect(commitPendingTag('overflow', existing)).toEqual(existing);
  });
});
