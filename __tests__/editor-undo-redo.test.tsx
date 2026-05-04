jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');

  return {
    Ionicons: ({ name }: any) => createElement(Text, null, name),
    MaterialCommunityIcons: ({ name }: any) => createElement(Text, null, name),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: jest.fn(() => Promise.resolve(null)), setItem: jest.fn(() => Promise.resolve()) },
}));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: any) => children,
  GestureDetector: ({ children }: any) => children,
}));

jest.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: (c: any) => c },
  useSharedValue: () => ({ value: 0 }),
  useAnimatedStyle: () => ({}),
  withTiming: (v: any) => v,
  withSpring: (v: any) => v,
  runOnJS: (f: any) => f,
}));

jest.mock('../src/components/ReorderableChecklist', () => ({
  ReorderableChecklist: () => null,
}));

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
