import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('react-native-webview', () => ({ WebView: () => null }));
jest.mock('expo-image', () => {
  const { Image } = require('react-native');
  return { Image };
});
jest.mock('react-native-marked', () => {
  class Renderer {
    getKey() {
      return Math.random().toString(36).slice(2);
    }
  }
  return {
    Renderer,
    ReactComponentRegistryProvider: ({ children }: any) => children,
    useMarkdown: () => null,
  };
});

import { NotePreviewRenderer, type CustomRendererDeps } from '../../src/utils/markdownRenderer';
import { INLINE_MATH_TOKEN_PREFIX } from '../../src/utils/inlineTokens';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  surfaceSecondary: '#f0f0f0',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

const deps: CustomRendererDeps = {
  colors: stableColors as any,
  isDark: false,
};

const buildRendererWithMath = (segments: Array<{ token: string; content: string }>) => {
  const renderer = new NotePreviewRenderer(deps);
  renderer.setInlineEmbeds({
    inlineMath: segments.map((s) => ({
      type: 'inline' as const,
      content: s.content,
      startIndex: 0,
      endIndex: s.token.length,
      token: s.token,
    })),
    wikiLinks: [],
  });
  return renderer;
};

describe('inline math renders inline as Text (issue #677)', () => {
  test('a paragraph with one inline math token renders the math content as text', () => {
    const token = `${INLINE_MATH_TOKEN_PREFIX}0`;
    const renderer = buildRendererWithMath([{ token, content: 'E = mc^2' }]);

    const node = renderer.text(`Inline: ${token} in a sentence.`);
    const { queryByText } = render(<>{node}</>);

    expect(queryByText('E = mc^2')).toBeTruthy();
    expect(queryByText(/Inline:/)).toBeTruthy();
    expect(queryByText(/in a sentence/)).toBeTruthy();
  });

  test('three inline math tokens on one line all render their content', () => {
    const t0 = `${INLINE_MATH_TOKEN_PREFIX}0`;
    const t1 = `${INLINE_MATH_TOKEN_PREFIX}1`;
    const t2 = `${INLINE_MATH_TOKEN_PREFIX}2`;
    const renderer = buildRendererWithMath([
      { token: t0, content: 'a \\neq 0' },
      { token: t1, content: 'ax^2 + bx + c = 0' },
      { token: t2, content: 'x = (-b)/(2a)' },
    ]);

    const node = renderer.text(`when ${t0}, the equation ${t1} has solutions ${t2}.`);
    const { queryByText } = render(<>{node}</>);

    expect(queryByText('a \\neq 0')).toBeTruthy();
    expect(queryByText('ax^2 + bx + c = 0')).toBeTruthy();
    expect(queryByText('x = (-b)/(2a)')).toBeTruthy();
    expect(queryByText(/when/)).toBeTruthy();
    expect(queryByText(/the equation/)).toBeTruthy();
  });

  test('text with no token returns plain Text (no token-rendering path)', () => {
    const renderer = buildRendererWithMath([]);
    const node = renderer.text('plain text without any math');
    const { queryByText } = render(<>{node}</>);
    expect(queryByText('plain text without any math')).toBeTruthy();
  });
});
