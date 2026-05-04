import React from 'react';
import { fireEvent, act } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => createElement(Text, { testID: `icon-${name}` }, name) };
});

import MarkdownEditor from '../src/components/MarkdownEditor';
import { renderWithTheme } from './helpers/renderWithTheme';

describe('MarkdownEditor search integration', () => {
  const content = 'Hello world. Hello again. Goodbye world.';

  it('renders without search bar by default', () => {
    const { queryByPlaceholderText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    expect(queryByPlaceholderText('Search...')).toBeNull();
  });

  it('shows TextSearchBar after pressing search toggle', () => {
    const { getByTestId, getByPlaceholderText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('hides TextSearchBar after pressing toggle again', () => {
    const { getByTestId, queryByPlaceholderText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.press(getByTestId('search-toggle'));
    expect(queryByPlaceholderText('Search...')).toBeNull();
  });

  it('shows correct match count after searching', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'Hello');
    expect(getByText('1/2')).toBeTruthy();
  });

  it('shows 0/0 when query has no matches', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'zzznomatch');
    expect(getByText('0/0')).toBeTruthy();
  });

  it('navigates to next match', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'Hello');
    fireEvent.press(getByTestId('search-next'));
    expect(getByText('2/2')).toBeTruthy();
  });

  it('wraps around when navigating past last match', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'Hello');
    fireEvent.press(getByTestId('search-next'));
    fireEvent.press(getByTestId('search-next'));
    expect(getByText('1/2')).toBeTruthy();
  });

  it('navigates to previous match', () => {
    const { getByTestId, getByPlaceholderText, getByText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'Hello');
    fireEvent.press(getByTestId('search-prev'));
    expect(getByText('2/2')).toBeTruthy();
  });

  it('closes search bar and clears state when close is pressed', () => {
    const { getByTestId, getByPlaceholderText, queryByPlaceholderText } = renderWithTheme(
      <MarkdownEditor content={content} onContentChange={jest.fn()} />,
    );
    fireEvent.press(getByTestId('search-toggle'));
    fireEvent.changeText(getByPlaceholderText('Search...'), 'Hello');
    fireEvent.press(getByTestId('search-close'));
    expect(queryByPlaceholderText('Search...')).toBeNull();
  });

  it('calls onContentChange when editor text changes', () => {
    const onContentChange = jest.fn();
    const { getByPlaceholderText } = renderWithTheme(
      <MarkdownEditor content="" onContentChange={onContentChange} placeholder="Start writing..." />,
    );
    fireEvent.changeText(getByPlaceholderText('Start writing...'), 'new text');
    expect(onContentChange).toHaveBeenCalledWith('new text');
  });
});
