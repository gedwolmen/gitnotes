import { fireEvent } from '@testing-library/react-native';

jest.mock('react-native-marked', () => {
  const React = require('react');
  const { Text, View } = require('react-native');

  const RegistryContext = React.createContext({});

  class Renderer {
    key = 0;

    getKey() {
      this.key += 1;
      return `renderer-key-${this.key}`;
    }

    del(children: string | React.ReactNode[], styles?: Record<string, unknown>) {
      return React.createElement(Text, { key: this.getKey(), selectable: true, style: styles }, children);
    }
  }

  function ReactComponentRegistryProvider({ components, children }: any) {
    return React.createElement(RegistryContext.Provider, { value: components }, children);
  }

  function useMarkdownWithComponents(value: string, options: { renderer: any; styles?: any }) {
    const components = React.useContext(RegistryContext) as Record<string, (props: any) => React.ReactNode>;
    const renderer = options.renderer;
    const styles = options.styles ?? {};
    const lines = value.split('\n');
    const nodes: React.ReactNode[] = [];

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] ?? '';
      if (!line.trim()) continue;

      const tableMatch = line.match(/^<MarkdownTable index=\{(\d+)\} \/>$/);
      if (tableMatch) {
        const Component = components.MarkdownTable;
        if (Component) nodes.push(React.createElement(Component, { key: `table-${tableMatch[1]}`, props: { index: Number(tableMatch[1]) } }));
        continue;
      }

      const mathMatch = line.match(/^<MarkdownMath index=\{(\d+)\} \/>$/);
      if (mathMatch) {
        const Component = components.MarkdownMath;
        if (Component) nodes.push(React.createElement(Component, { key: `math-${mathMatch[1]}`, props: { index: Number(mathMatch[1]) } }));
        continue;
      }

      const imageMatch = line.match(/^!\[(.*)\]\((.*)\)$/);
      if (imageMatch) {
        nodes.push(renderer.image(imageMatch[2], imageMatch[1]));
        continue;
      }

      const taskMatch = line.match(/^- \[x\] ~~(.+)~~$/);
      if (taskMatch) {
        nodes.push(React.createElement(View, { key: `task-${index}` }, renderer.del(taskMatch[1], styles.strikethrough)));
        continue;
      }

      const fenceMatch = line.match(/^```(.*)$/);
      if (fenceMatch) {
        const language = fenceMatch[1] || undefined;
        const codeLines: string[] = [];
        index += 1;
        while (index < lines.length && !(lines[index] ?? '').startsWith('```')) {
          codeLines.push(lines[index] ?? '');
          index += 1;
        }
        nodes.push(renderer.code(codeLines.join('\n'), language, styles.code, styles.text));
        continue;
      }

      nodes.push(renderer.text(line, styles.text));
    }

    return nodes;
  }

  return {
    Renderer,
    ReactComponentRegistryProvider,
    useMarkdownWithComponents,
  };
});

jest.mock('expo-image', () => ({
  Image: (props: any) => {
    const { View } = require('react-native');
    return <View testID="markdown-image" {...props} />;
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}));

jest.mock('react-native-webview', () => ({
  WebView: (props: any) => {
    const { View } = require('react-native');
    return <View testID="webview" {...props} />;
  },
}));

import { renderWithTheme } from './helpers/renderWithTheme';
import { MarkdownPreviewContent, NotePreviewRenderer } from '../src/utils/markdownRenderer';
import { getMarkdownStyles } from '../src/utils/preview';

describe('MarkdownPreviewContent integration', () => {
  it('renders integrated markdown features together', () => {
    const onOpenNote = jest.fn(() => true);
    const colors = {
      primary: '#2563eb',
      text: '#111827',
      textSecondary: '#6b7280',
      surfaceSecondary: '#e5e7eb',
      border: '#d1d5db',
      surface: '#ffffff',
      background: '#ffffff',
    };
    const renderer = new NotePreviewRenderer({
      colors,
      isDark: false,
      currentNotePath: 'notes/current.md',
      onOpenNote,
    });

    const markdown = [
      '---',
      'title: Integration Note',
      'tags: [alpha, beta]',
      'published: true',
      '---',
      '',
      'Math $E=mc^2$ and wiki [[reference|Reference Note]] plus &amp; decoded text.',
      '',
      '$$',
      '\\sum_{i=1}^{n} x_i',
      '$$',
      '',
      '| Name | Value |',
      '| --- | ---: |',
      '| Alpha | 1 |',
      '',
      '![A scenic caption](https://example.com/image.png)',
      '',
      '```ts',
      'const answer = 42;',
      '```',
      '',
      '- [x] ~~done task~~',
    ].join('\n');

    const screen = renderWithTheme(
      <MarkdownPreviewContent
        value={markdown}
        styles={getMarkdownStyles(colors, false)}
        renderer={renderer}
      />,
    );

    expect(screen.getByText('Frontmatter')).toBeTruthy();
    expect(screen.getByText(/Integration Note/)).toBeTruthy();
    expect(screen.getByText(/alpha, beta/)).toBeTruthy();
    expect(screen.getByText(/true/)).toBeTruthy();
    expect(screen.getByText(/decoded text\./)).toBeTruthy();
    expect(screen.getByText('Reference Note')).toBeTruthy();
    expect(screen.getByTestId('table-scroll-view')).toBeTruthy();
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('A scenic caption')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByText('TS')).toBeTruthy();
    expect(screen.getByText('done task')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getAllByTestId('webview')).toHaveLength(2);

    fireEvent.press(screen.getByText('Reference Note'));
    expect(onOpenNote).toHaveBeenCalledWith('notes/reference.md', undefined);
  });
});
