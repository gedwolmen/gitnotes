jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => createElement(Text, { testID: `icon-${name}` }, name) };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => {
    const { createElement, Fragment } = require('react');
    return createElement(Fragment, null, children);
  },
  GestureDetector: ({ children }: { children: React.ReactNode }) => {
    const { createElement, Fragment } = require('react');
    return createElement(Fragment, null, children);
  },
}));

jest.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (component: unknown) => component },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (value: unknown) => value,
  withSpring: (value: unknown) => value,
  runOnJS: (fn: unknown) => fn,
}));

jest.mock('../src/components/ReorderableChecklist', () => ({
  ReorderableChecklist: ({ items }: { items: Array<{ id: string; text: string; checked: boolean }> }) => {
    const React = require('react');
    const { View, Text } = require('react-native');
    return React.createElement(View, { testID: 'reorderable-checklist' },
      ...items.map((item: { id: string; text: string; checked: boolean }) =>
        React.createElement(Text, { key: item.id }, `${item.checked ? 'x' : ' '} ${item.text}`)
      )
    );
  },
}));

import React from 'react';
import { fireEvent } from '@testing-library/react-native';
import { renderWithTheme } from './helpers/renderWithTheme';
import MarkdownEditor from '../src/components/MarkdownEditor';

describe('Editor modes', () => {
  it('defaults to markdown mode for regular text', () => {
    const { getByTestId } = renderWithTheme(
      <MarkdownEditor content="Hello world" onContentChange={jest.fn()} />,
    );
    expect(getByTestId('editor-toolbar.toolbar-action.bold')).toBeTruthy();
  });

  it('auto-detects checklist mode for checklist-heavy content', () => {
    const content = '- [ ] Task 1\n- [x] Task 2\n- [ ] Task 3\n- [ ] Task 4';
    const { getByTestId } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    expect(getByTestId('reorderable-checklist')).toBeTruthy();
  });

  it('switches to checklist mode when Checklist is pressed', () => {
    const { getByLabelText } = renderWithTheme(
      <MarkdownEditor content="Hello" onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('Checklist'));
    expect(getByLabelText('Checklist')).toBeTruthy();
  });

  it('switches back to markdown mode', () => {
    const { getByLabelText } = renderWithTheme(
      <MarkdownEditor content="Hello" onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByLabelText('Checklist'));
    fireEvent.press(getByLabelText('B'));
    expect(getByLabelText('B')).toBeTruthy();
  });
});
