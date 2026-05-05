import React from 'react';
import { Text, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { NotePreviewRenderer } from '../src/utils/markdownRenderer';
import StructuredRenderer from '../src/components/StructuredRenderer';

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: () => null,
}));

jest.mock('react-native-marked', () => {
  class Renderer {
    private key = 0;

    getKey() {
      this.key += 1;
      return `renderer-key-${this.key}`;
    }
  }

  return { Renderer };
});

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      primary: '#2563eb',
      text: '#111827',
      textSecondary: '#6b7280',
      surfaceSecondary: '#e5e7eb',
      border: '#d1d5db',
    },
  }),
}));

const createMarkdownRenderer = () => new NotePreviewRenderer({
  colors: {
    primary: '#2563eb',
    text: '#111827',
    surfaceSecondary: '#e5e7eb',
  },
});

const expectSelectableTextNodes = (nodes: { props: { selectable?: boolean }; children?: unknown[] }[]) => {
  const contentNodes = nodes.filter((node) => node.props.selectable !== undefined);
  expect(contentNodes.length).toBeGreaterThan(0);
  expect(contentNodes.every((node) => node.props.selectable === true)).toBe(true);
};

describe('preview text selection', () => {
  it('marks markdown preview text selectable', () => {
    const renderer = createMarkdownRenderer();

    const screen = render(
      <View>
        {renderer.text('plain text')}
        {renderer.codespan('inline code')}
        {renderer.code('block code')}
        {renderer.link('linked text', 'https://example.com')}
      </View>,
    );

    expectSelectableTextNodes(screen.UNSAFE_getAllByType(Text));
  });

  it('marks neorg preview text selectable', () => {
    const screen = render(
      <StructuredRenderer
        blocks={[
          { type: 'heading', heading: { level: 1, text: 'Heading *bold* `code`' } },
          { type: 'list', listItems: [{ type: 'ordered', indentLevel: 0, text: 'List item /italic/' }] },
          { type: 'checklist', checklistItems: [{ checked: true, indentLevel: 0, text: 'Check item' }] },
          { type: 'definition', definitionItems: [{ term: 'Term', definition: 'Definition with [link](https://example.com)', indentLevel: 0 }] },
          { type: 'paragraph', text: 'Paragraph with _underline_ and {tag}' },
          { type: 'code', code: { language: 'ts', content: 'const n = 1;' } },
          { type: 'quote', text: 'Quoted ^sup^ and ,sub,' },
          { type: 'table', tableRows: [{ cells: ['Cell one', 'Cell two'] }], isHeaderRow: [true] },
        ]}
      />,
    );

    expectSelectableTextNodes(screen.UNSAFE_getAllByType(Text));
  });
});
