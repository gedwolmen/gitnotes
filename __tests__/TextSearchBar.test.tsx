import React from 'react';
import { fireEvent } from '@testing-library/react-native';

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: { name: string }) => createElement(Text, null, name) };
});

import { TextSearchBar } from '../src/components/TextSearchBar';
import { renderWithTheme } from './helpers/renderWithTheme';

describe('TextSearchBar', () => {
  const defaultProps = {
    totalMatches: 5,
    currentIndex: 2,
    onSearch: jest.fn(),
    onNavigate: jest.fn(),
    onClose: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a search input field', () => {
    const { getByPlaceholderText } = renderWithTheme(
      <TextSearchBar {...defaultProps} />,
    );
    expect(getByPlaceholderText('Search...')).toBeTruthy();
  });

  it('shows match count "3/5" when totalMatches=5, currentIndex=2 (1-indexed display)', () => {
    const { getByText } = renderWithTheme(
      <TextSearchBar {...defaultProps} totalMatches={5} currentIndex={2} />,
    );
    expect(getByText('3/5')).toBeTruthy();
  });

  it('shows "0/0" when there are no matches', () => {
    const { getByText } = renderWithTheme(
      <TextSearchBar {...defaultProps} totalMatches={0} currentIndex={0} />,
    );
    expect(getByText('0/0')).toBeTruthy();
  });

  it('calls onNavigate with currentIndex + 1 when next button is pressed', () => {
    const onNavigate = jest.fn();
    const { getByTestId } = renderWithTheme(
      <TextSearchBar {...defaultProps} currentIndex={2} onNavigate={onNavigate} />,
    );
    fireEvent.press(getByTestId('search-next'));
    expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('calls onNavigate with currentIndex - 1 when previous button is pressed', () => {
    const onNavigate = jest.fn();
    const { getByTestId } = renderWithTheme(
      <TextSearchBar {...defaultProps} currentIndex={2} onNavigate={onNavigate} />,
    );
    fireEvent.press(getByTestId('search-prev'));
    expect(onNavigate).toHaveBeenCalledWith(1);
  });

  it('calls onClose when close button is pressed', () => {
    const onClose = jest.fn();
    const { getByTestId } = renderWithTheme(
      <TextSearchBar {...defaultProps} onClose={onClose} />,
    );
    fireEvent.press(getByTestId('search-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onSearch with new query when text input changes', () => {
    const onSearch = jest.fn();
    const { getByPlaceholderText } = renderWithTheme(
      <TextSearchBar {...defaultProps} onSearch={onSearch} />,
    );
    fireEvent.changeText(getByPlaceholderText('Search...'), 'hello');
    expect(onSearch).toHaveBeenCalledWith('hello');
  });
});
