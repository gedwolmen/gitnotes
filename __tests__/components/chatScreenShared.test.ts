import {
  decodeOverEscapedChunk,
  formatExecutorResult,
  formatToolResult,
} from '../../src/components/chat/chatScreenShared';

describe('decodeOverEscapedChunk', () => {
  test('decodes JSON-stringified assistant chunks', () => {
    expect(decodeOverEscapedChunk('"line 1\\nline 2"')).toBe('line 1\nline 2');
  });

  test('decodes shell-escaped Maestro screenshot paths', () => {
    expect(
      decodeOverEscapedChunk(
        '/Users/vidwadeseram/Desktop/Simulator\\ Screenshot\\ -\\ iPhone\\ 17\\ Pro\\ -\\ 2026-05-13\\ at\\ 15.35.18.png',
      ),
    ).toBe('/Users/vidwadeseram/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-13 at 15.35.18.png');
  });

  test('leaves non-path shell-like content untouched', () => {
    expect(decodeOverEscapedChunk('Hello\\ world')).toBe('Hello\\ world');
  });
});

describe('formatToolResult', () => {
  test('decodes shell-escaped string results', () => {
    expect(
      formatToolResult(
        '/Users/vidwadeseram/Desktop/Simulator\\ Screenshot\\ -\\ iPhone\\ 17\\ Pro\\ -\\ 2026-05-13\\ at\\ 15.35.18.png',
      ),
    ).toBe('/Users/vidwadeseram/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-13 at 15.35.18.png');
  });
});

describe('formatExecutorResult', () => {
  test('decodes shell-escaped error text', () => {
    expect(
      formatExecutorResult({
        success: false,
        error: '/Users/vidwadeseram/Desktop/Simulator\\ Screenshot\\ -\\ iPhone\\ 17\\ Pro\\ -\\ 2026-05-13\\ at\\ 15.35.18.png',
      } as never),
    ).toBe('/Users/vidwadeseram/Desktop/Simulator Screenshot - iPhone 17 Pro - 2026-05-13 at 15.35.18.png');
  });
});
