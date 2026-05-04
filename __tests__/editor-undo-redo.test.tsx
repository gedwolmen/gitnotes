jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');

  return {
    Ionicons: ({ name }: any) => createElement(Text, null, name),
    MaterialCommunityIcons: ({ name }: any) => createElement(Text, null, name),
  };
});

import React from 'react';
import { Text } from 'react-native';
import { fireEvent, waitFor } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import MarkdownEditor from '../src/components/MarkdownEditor';

function EditorHarness() {
  const [content, setContent] = React.useState('Alpha');

  return (
    <>
      <Text testID="content-value">{content}</Text>
      <MarkdownEditor content={content} onContentChange={setContent} placeholder="Start writing..." />
    </>
  );
}

describe('MarkdownEditor undo/redo integration', () => {
  it('tracks changes and supports undo/redo from the editor header', async () => {
    const { getByDisplayValue, getByLabelText, getByTestId } = renderWithTheme(<EditorHarness />);

    const input = getByDisplayValue('Alpha');

    fireEvent.changeText(input, 'Beta');

    await waitFor(() => expect(getByTestId('content-value')).toHaveTextContent('Beta'));
    expect(getByLabelText('undo')).toBeTruthy();
    expect(getByLabelText('redo')).toBeTruthy();

    fireEvent.press(getByLabelText('undo'));

    await waitFor(() => expect(getByDisplayValue('Alpha')).toBeTruthy());
    await waitFor(() => expect(getByTestId('content-value')).toHaveTextContent('Alpha'));

    fireEvent.press(getByLabelText('redo'));

    await waitFor(() => expect(getByDisplayValue('Beta')).toBeTruthy());
    await waitFor(() => expect(getByTestId('content-value')).toHaveTextContent('Beta'));
  });
});
