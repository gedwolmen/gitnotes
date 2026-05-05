import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('react-native-marked', () => ({
  Renderer: class MockRenderer {
    private key = 0;

    getKey() {
      this.key += 1;
      return `mock-renderer-${this.key}`;
    }
  },
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

import { NotePreviewRenderer } from '../src/utils/markdownRenderer';
import { createMemoizedNeorgInlineParser, parseNeorgInlineSegments } from '../src/components/StructuredRenderer';
import { NeorgContentParser } from '../src/services/NeorgContentParser';

function renderNode(node: React.ReactNode) {
  return render(React.createElement(React.Fragment, null, node));
}

function createMarkdownRenderer() {
  return new NotePreviewRenderer({
    colors: {
      primary: '#4f46e5',
      text: '#111827',
      surfaceSecondary: '#f3f4f6',
    },
  });
}

describe('renderer pipeline regression coverage', () => {
  it('renders markdown fenced code language labels', () => {
    const renderer = createMarkdownRenderer();
    const node = renderer.code('const value = 1;', 'typescript', { padding: 12 }, { fontFamily: 'monospace' });
    const { getByText } = renderNode(node);

    expect(getByText('TYPESCRIPT')).toBeTruthy();
    expect(getByText('const value = 1;')).toBeTruthy();
  });

  it('styles markdown inline code with monospace text and tinted background', () => {
    const renderer = createMarkdownRenderer();
    const node = renderer.codespan('inline()');
    const { getByText } = renderNode(node);

    const code = getByText('inline()');
    const style = StyleSheet.flatten(code.props.style);

    expect(style.fontFamily).toBe('monospace');
    expect(style.backgroundColor).toBe('#f3f4f6');
    expect(style.paddingHorizontal).toBe(4);
    expect(style.borderRadius).toBe(4);
  });

  it('parses nested neorg emphasis without treating URLs as italic', () => {
    const segments = parseNeorgInlineSegments('*outer *inner* outer* and https://x.com/path');

    expect(segments).toEqual([
      { type: 'bold', content: 'outer *inner* outer' },
      { type: 'text', content: ' and https://x.com/path' },
    ]);
  });

  it('captures neorg code block languages declared with =code.language', () => {
    const result = NeorgContentParser.parseContent('=code.python\nprint("hi")\n=');

    expect(result.success).toBe(true);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks?.[0]).toMatchObject({
      type: 'code',
      code: { language: 'python', content: 'print("hi")' },
    });
  });

  it('memoizes neorg inline parsing for unchanged text', () => {
    const parser = jest.fn((text: string) => [{ type: 'text' as const, content: text }]);
    const memoized = createMemoizedNeorgInlineParser(parser);

    expect(memoized('cached inline text')).toEqual([{ type: 'text', content: 'cached inline text' }]);
    expect(memoized('cached inline text')).toEqual([{ type: 'text', content: 'cached inline text' }]);

    expect(parser).toHaveBeenCalledTimes(1);
  });

  it('derives list indentation from 4-space siblings and tabs', () => {
    const input = ['- root', '    - four spaces', '        - eight spaces', '\t- tab indent'].join('\n');
    const result = NeorgContentParser.parseContent(input);

    expect(result.success).toBe(true);
    expect(result.blocks?.[0]).toMatchObject({
      type: 'list',
      listItems: [
        { text: 'root', indentLevel: 0 },
        { text: 'four spaces', indentLevel: 1 },
        { text: 'eight spaces', indentLevel: 2 },
        { text: 'tab indent', indentLevel: 1 },
      ],
    });
  });
});
