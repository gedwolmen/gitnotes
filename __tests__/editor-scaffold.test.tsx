jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => createElement(Text, { testID: `icon-${name}` }, name) };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));

import React, { useState } from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithTheme } from './helpers/renderWithTheme';
import MarkdownEditor from '../src/components/MarkdownEditor';

function EditorHarness({ initialContent = 'hello world' }: { initialContent?: string }) {
  const [content, setContent] = useState(initialContent);
  return <MarkdownEditor content={content} onContentChange={setContent} placeholder="Write..." />;
}

describe('MarkdownEditor scaffold', () => {
  it('renders toolbar with formatting buttons', () => {
    const { getByLabelText } = renderWithTheme(<EditorHarness />);

    expect(getByLabelText('B')).toBeTruthy();
    expect(getByLabelText('I')).toBeTruthy();
    expect(getByLabelText('H1')).toBeTruthy();
  });

  it('renders hard wrap toggle', () => {
    const { getByTestId } = renderWithTheme(<EditorHarness />);

    expect(getByTestId('hardwrap-toggle')).toBeTruthy();
  });

  it('toggles hard wrap without crashing', () => {
    const { getByTestId } = renderWithTheme(<EditorHarness />);
    const toggle = getByTestId('hardwrap-toggle');

    act(() => {
      fireEvent.press(toggle);
      fireEvent.press(toggle);
    });

    expect(toggle).toBeTruthy();
  });

  it('search bar still works with toolbar present', () => {
    const { getByTestId, getByPlaceholderText, queryByPlaceholderText } = renderWithTheme(
      <EditorHarness initialContent="Hello world. Hello again." />,
    );

    expect(queryByPlaceholderText('Search...')).toBeNull();

    fireEvent.press(getByTestId('search-toggle'));
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('undo/redo still work with toolbar present', () => {
    const { getByLabelText, getByDisplayValue } = renderWithTheme(<EditorHarness />);

    const input = getByDisplayValue('hello world');
    fireEvent.changeText(input, 'new text');

    return waitFor(() => {
      expect(getByLabelText('undo')).toBeTruthy();
    });
  });
});
