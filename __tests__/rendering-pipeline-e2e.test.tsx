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

const documentMarkdown = [
  '---',
  'title: E2E Test Document',
  'author: Test Author',
  'tags: [e2e, test]',
  'date: 2024-01-15',
  '---',
  '',
  '# Kitchen Sink Document',
  '',
  'Math inline $E=mc^2$ and block:',
  '',
  '$$',
  '\\sum_{i=1}^{n} x_i = x_1 + x_2 + \\cdots + x_n',
  '$$',
  '',
  '| Feature | Status | Notes |',
  '| --- | ---: | --- |',
  '| Math | ✅ | Inline + Block |',
  '| Tables | ✅ | GFM pipe tables |',
  '| Wiki | ✅ | [[links\\|Wiki Links]] |',
  '',
  'Wiki link: [[other-note|Other Note]] and [[simple-link]].',
  '',
  'HTML entities: &amp; &lt; &gt; &quot; &#39;',
  '',
  '```typescript',
  'function hello(name: string): void {',
  '  console.log(`Hello, ${name}!`);',
  '}',
  '```',
  '',
  '- [x] ~~Completed task with strikethrough~~',
  '- [ ] Pending task',
  '',
  '![E2E test image](https://example.com/test-image.png)',
  '',
  'Regular paragraph with **bold** and *italic* text.',
  '',
  '> Blockquote with some text',
  '',
  '---',
  '',
  'End of document.',
].join('\n');

function createRenderer(isDark: boolean) {
  const colors = isDark
    ? {
        primary: '#60a5fa',
        text: '#f9fafb',
        textSecondary: '#9ca3af',
        surfaceSecondary: '#1f2937',
        border: '#374151',
        surface: '#111827',
        background: '#030712',
      }
    : {
        primary: '#2563eb',
        text: '#111827',
        textSecondary: '#6b7280',
        surfaceSecondary: '#e5e7eb',
        border: '#d1d5db',
        surface: '#ffffff',
        background: '#ffffff',
      };

  return {
    colors,
    renderer: new NotePreviewRenderer({
      colors,
      isDark,
      currentNotePath: 'notes/current.md',
      onOpenNote: jest.fn(() => true),
    }),
  };
}

describe('rendering pipeline e2e', () => {
  it('renders all features in a single document', () => {
    const { colors, renderer } = createRenderer(false);
    const screen = renderWithTheme(
      <MarkdownPreviewContent value={documentMarkdown} styles={getMarkdownStyles(colors, false)} renderer={renderer} />,
    );

    expect(screen.getByText('Frontmatter')).toBeTruthy();
    expect(screen.getByText(/E2E Test Document/)).toBeTruthy();
    expect(screen.getByText(/Test Author/)).toBeTruthy();
    expect(screen.getByText(/e2e, test/)).toBeTruthy();
    expect(screen.getByText(/2024-01-15/)).toBeTruthy();
    expect(screen.getByText('# Kitchen Sink Document')).toBeTruthy();
    expect(screen.getByText('Wiki link:')).toBeTruthy();
    expect(screen.getByText('Other Note')).toBeTruthy();
    expect(screen.getByText('simple-link')).toBeTruthy();
    expect(screen.getByText(/HTML entities:/)).toBeTruthy();
    expect(screen.getByText('TYPESCRIPT')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.getByText('Completed task with strikethrough')).toHaveStyle({ textDecorationLine: 'line-through' });
    expect(screen.getByText('- [ ] Pending task')).toBeTruthy();
    expect(screen.getByTestId('markdown-image')).toBeTruthy();
    expect(screen.getByText('E2E test image')).toBeTruthy();
    expect(screen.getByText('Regular paragraph with **bold** and *italic* text.')).toBeTruthy();
    expect(screen.getByText('> Blockquote with some text')).toBeTruthy();
    expect(screen.getByTestId('table-scroll-view')).toBeTruthy();
    expect(screen.getAllByTestId('webview')).toHaveLength(2);

    fireEvent.press(screen.getByText('Other Note'));
  });

  it('renders in dark mode without errors', () => {
    const { colors, renderer } = createRenderer(true);
    const screen = renderWithTheme(
      <MarkdownPreviewContent value={documentMarkdown} styles={getMarkdownStyles(colors, true)} renderer={renderer} />,
    );

    expect(screen.getByText('Frontmatter')).toBeTruthy();
    expect(screen.getByText('# Kitchen Sink Document')).toBeTruthy();
    expect(screen.getAllByTestId('webview')).toHaveLength(2);
  });

  it('handles empty document gracefully', () => {
    const { colors, renderer } = createRenderer(false);
    const screen = renderWithTheme(<MarkdownPreviewContent value="" styles={getMarkdownStyles(colors, false)} renderer={renderer} />);

    expect(screen.queryAllByText(/./)).toHaveLength(0);
  });

  it('handles document with only frontmatter', () => {
    const { colors, renderer } = createRenderer(false);
    const screen = renderWithTheme(
      <MarkdownPreviewContent
        value={['---', 'title: Only Frontmatter', '---'].join('\n')}
        styles={getMarkdownStyles(colors, false)}
        renderer={renderer}
      />,
    );

    expect(screen.getByText('Frontmatter')).toBeTruthy();
    expect(screen.getByText(/Only Frontmatter/)).toBeTruthy();
  });
});
