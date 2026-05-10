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

describe('multi-math: marked outer-text() wrapping (issue #688)', () => {
  // marked's Parser.tsx getNormalizedSiblingNodesForBlockAndInlineTokens
  // calls renderer.text() TWICE for a paragraph with one text token:
  //   inner: renderer.text(rawString, styles)         → returns ReactNode
  //   outer: renderer.text([innerNode], {})           → must NOT re-render rawString
  //
  // Bug: if the outer call ALSO inspects/rerenders the ReactNode children
  // and emits raw token strings or duplicates the chip, the user sees
  // double-render artefacts on screen.
  test('outer text() call with ReactNode[] does not re-emit raw token text', () => {
    const t0 = `${INLINE_MATH_TOKEN_PREFIX}0`;
    const t1 = `${INLINE_MATH_TOKEN_PREFIX}1`;
    const t2 = `${INLINE_MATH_TOKEN_PREFIX}2`;
    const renderer = buildRendererWithMath([
      { token: t0, content: 'a \\neq 0' },
      { token: t1, content: 'ax^2 + bx + c = 0' },
      { token: t2, content: 'x = (-b)/(2a)' },
    ]);

    const innerNode = renderer.text(`Mixed: when ${t0}, the equation ${t1} has solutions ${t2}.`);
    const outerNode = renderer.text([innerNode] as any);
    const { queryAllByText } = render(<>{outerNode}</>);

    // Math content rendered exactly once each
    expect(queryAllByText('a \\neq 0')).toHaveLength(1);
    expect(queryAllByText('ax^2 + bx + c = 0')).toHaveLength(1);
    expect(queryAllByText('x = (-b)/(2a)')).toHaveLength(1);

    // Raw token placeholders MUST NOT appear as visible text
    expect(queryAllByText(new RegExp(INLINE_MATH_TOKEN_PREFIX))).toHaveLength(0);
  });

  test('inner text() then outer text() preserves prose between math segments', () => {
    const t0 = `${INLINE_MATH_TOKEN_PREFIX}0`;
    const t1 = `${INLINE_MATH_TOKEN_PREFIX}1`;
    const t2 = `${INLINE_MATH_TOKEN_PREFIX}2`;
    const renderer = buildRendererWithMath([
      { token: t0, content: 'a' },
      { token: t1, content: 'b' },
      { token: t2, content: 'c' },
    ]);

    const innerNode = renderer.text(`A ${t0} B ${t1} C ${t2} D`);
    const outerNode = renderer.text([innerNode] as any);
    const { queryAllByText } = render(<>{outerNode}</>);

    expect(queryAllByText('A ')).toHaveLength(1);
    expect(queryAllByText(' B ')).toHaveLength(1);
    expect(queryAllByText(' C ')).toHaveLength(1);
    expect(queryAllByText(' D')).toHaveLength(1);
  });
});
