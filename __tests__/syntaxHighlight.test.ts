import { getThemeColors, tokenize } from '../src/utils/syntaxHighlight';

describe('syntaxHighlight', () => {
  test('tokenizes JavaScript and TypeScript keywords, identifiers, numbers, and punctuation', () => {
    const tokens = tokenize('const x = 1;', 'typescript');

    expect(tokens).toEqual([
      { text: 'const', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: 'x', type: 'plain' },
      { text: ' ', type: 'plain' },
      { text: '=', type: 'operator' },
      { text: ' ', type: 'plain' },
      { text: '1', type: 'number' },
      { text: ';', type: 'punctuation' },
    ]);
  });

  test('tokenizes Python def statements with function names', () => {
    const tokens = tokenize('def foo():', 'python');

    expect(tokens).toEqual([
      { text: 'def', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: 'foo', type: 'function' },
      { text: '(', type: 'punctuation' },
      { text: ')', type: 'punctuation' },
      { text: ':', type: 'punctuation' },
    ]);
  });

  test('tokenizes Bash shebang comments, commands, and strings', () => {
    const tokens = tokenize('#!/bin/bash\necho "hello"', 'bash');

    expect(tokens).toEqual([
      { text: '#!/bin/bash', type: 'comment' },
      { text: '\n', type: 'plain' },
      { text: 'echo', type: 'function' },
      { text: ' ', type: 'plain' },
      { text: '"hello"', type: 'string' },
    ]);
  });

  test('tokenizes JSON punctuation, strings, and numbers', () => {
    const tokens = tokenize('{"key": 123}', 'json');

    expect(tokens).toEqual([
      { text: '{', type: 'punctuation' },
      { text: '"key"', type: 'string' },
      { text: ':', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: '123', type: 'number' },
      { text: '}', type: 'punctuation' },
    ]);
  });

  test('tokenizes YAML keys and values', () => {
    const tokens = tokenize('key: value', 'yaml');

    expect(tokens).toEqual([
      { text: 'key', type: 'string' },
      { text: ':', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: 'value', type: 'string' },
    ]);
  });

  test('tokenizes CSS selectors, properties, and values', () => {
    const tokens = tokenize('.class { color: red; }', 'css');

    expect(tokens).toEqual([
      { text: '.', type: 'punctuation' },
      { text: 'class', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: '{', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: 'color', type: 'keyword' },
      { text: ':', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: 'red', type: 'plain' },
      { text: ';', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: '}', type: 'punctuation' },
    ]);
  });

  test('tokenizes HTML tags, attributes, and strings', () => {
    const tokens = tokenize('<div class="foo">', 'html');

    expect(tokens).toEqual([
      { text: '<', type: 'punctuation' },
      { text: 'div', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: 'class', type: 'keyword' },
      { text: '=', type: 'operator' },
      { text: '"foo"', type: 'string' },
      { text: '>', type: 'punctuation' },
    ]);
  });

  test('tokenizes SQL keywords, operators, identifiers, and punctuation', () => {
    const tokens = tokenize('SELECT * FROM users;', 'sql');

    expect(tokens).toEqual([
      { text: 'SELECT', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: '*', type: 'operator' },
      { text: ' ', type: 'plain' },
      { text: 'FROM', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: 'users', type: 'plain' },
      { text: ';', type: 'punctuation' },
    ]);
  });

  test('tokenizes Go function declarations', () => {
    const tokens = tokenize('func main() {', 'go');

    expect(tokens).toEqual([
      { text: 'func', type: 'keyword' },
      { text: ' ', type: 'plain' },
      { text: 'main', type: 'function' },
      { text: '(', type: 'punctuation' },
      { text: ')', type: 'punctuation' },
      { text: ' ', type: 'plain' },
      { text: '{', type: 'punctuation' },
    ]);
  });

  test('falls back to plain tokens for unknown languages', () => {
    const tokens = tokenize('mystery 42', 'unknown-language');

    expect(tokens).toEqual([
      { text: 'mystery 42', type: 'plain' },
    ]);
  });

  test('returns distinct theme colors for dark and light modes', () => {
    const dark = getThemeColors(true);
    const light = getThemeColors(false);

    expect(dark.keyword).not.toBe(light.keyword);
    expect(dark.string).not.toBe(light.string);
    expect(dark.comment).not.toBe(light.comment);
    expect(dark.number).not.toBe(light.number);
    expect(dark.function).not.toBe(light.function);
    expect(dark.operator).not.toBe(light.operator);
    expect(dark.punctuation).not.toBe(light.punctuation);
    expect(dark.plain).not.toBe(light.plain);
  });
});
