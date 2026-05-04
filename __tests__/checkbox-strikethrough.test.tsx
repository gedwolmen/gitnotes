import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('react-native-marked', () => {
  class Renderer {
    private key = 0;

    getKey() {
      this.key += 1;
      return `renderer-key-${this.key}`;
    }
  }

  const useMarkdown = (value: string, options: { renderer: any; styles?: any }) => {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const checkedMatch = line.match(/^- \[(x| )\]\s+(.*)$/i);
        if (checkedMatch) {
          const [, checked, text] = checkedMatch;
          return checked.toLowerCase() === 'x'
            ? options.renderer.text(text, options.styles?.strikethrough)
            : options.renderer.text(text, options.styles?.li);
        }
        return options.renderer.text(line, options.styles?.text);
      });
  };

  return { Renderer, useMarkdown };
});

import { useMarkdown } from 'react-native-marked';

import { NotePreviewRenderer } from '../src/utils/markdownRenderer';
import { getMarkdownStyles } from '../src/utils/preview';

const colors = {
  primary: '#2563eb',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#d1d5db',
  surface: '#ffffff',
  background: '#f9fafb',
};

function renderMarkdown(value: string) {
  const renderer = new NotePreviewRenderer({
    colors: {
      primary: colors.primary,
      text: colors.text,
      surfaceSecondary: '#e5e7eb',
    },
  });

  function MarkdownPreview() {
    const nodes = useMarkdown(value, {
      renderer,
      styles: getMarkdownStyles(colors, false),
    });

    return <>{React.Children.toArray(nodes)}</>;
  }

  return render(<MarkdownPreview />);
}

describe('checkbox strikethrough preview', () => {
  it('strikes through checked checklist items and dims them', () => {
    const screen = renderMarkdown('- [x] Done');

    const done = screen.getByText('Done');
    expect(StyleSheet.flatten(done.props.style)).toMatchObject({
      textDecorationLine: 'line-through',
      color: colors.textSecondary,
    });
  });

  it('keeps unchecked checklist items normal', () => {
    const screen = renderMarkdown('- [ ] Todo');

    const todo = screen.getByText('Todo');
    expect(StyleSheet.flatten(todo.props.style)).toMatchObject({ color: colors.text });
    expect(StyleSheet.flatten(todo.props.style)).not.toHaveProperty('textDecorationLine', 'line-through');
  });

  it('handles mixed checked and unchecked items', () => {
    const screen = renderMarkdown('- [ ] Todo\n- [x] Done');

    expect(StyleSheet.flatten(screen.getByText('Todo').props.style)).toMatchObject({
      color: colors.text,
    });
    expect(StyleSheet.flatten(screen.getByText('Todo').props.style)).not.toHaveProperty('textDecorationLine', 'line-through');
    expect(StyleSheet.flatten(screen.getByText('Done').props.style)).toMatchObject({
      textDecorationLine: 'line-through',
      color: colors.textSecondary,
    });
  });
});
