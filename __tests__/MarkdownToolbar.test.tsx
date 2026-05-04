jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return {
    MaterialCommunityIcons: ({ name }: any) => createElement(Text, null, name),
  };
});

import React from 'react';
import { fireEvent } from '@testing-library/react-native';

import { renderWithTheme } from './helpers/renderWithTheme';
import { MarkdownToolbar } from '../src/components/MarkdownToolbar';
import type { FormatAction } from '../src/utils/markdownFormatting';

const BUTTON_LABELS = ['H1', 'H2', 'B', 'I', 'Link', 'UL', 'OL', 'Checklist', 'Code', 'Quote', 'Tab'];

describe('MarkdownToolbar', () => {
  it('renders all toolbar buttons', () => {
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={jest.fn()} />,
    );
    for (const label of BUTTON_LABELS) {
      expect(getByLabelText(label)).toBeTruthy();
    }
  });

  it('calls onFormat with bold action when B is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('B'));
    expect(onFormat).toHaveBeenCalledTimes(1);
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('wrap');
    expect(action.before).toBe('**');
    expect(action.after).toBe('**');
  });

  it('calls onFormat with italic action when I is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('I'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('wrap');
    expect(action.before).toBe('*');
    expect(action.after).toBe('*');
  });

  it('calls onFormat with H1 line action when H1 is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('H1'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('# ');
  });

  it('calls onFormat with H2 line action when H2 is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('H2'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('## ');
  });

  it('calls onFormat with UL line action when UL is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('UL'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('- ');
  });

  it('calls onFormat with OL line action when OL is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('OL'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('1. ');
  });

  it('calls onFormat with checklist line action when Checklist is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('Checklist'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('- [ ] ');
  });

  it('calls onFormat with code wrap action when Code is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('Code'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('wrap');
    expect(action.before).toBe('`');
    expect(action.after).toBe('`');
  });

  it('calls onFormat with quote line action when Quote is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('Quote'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('line');
    expect(action.before).toBe('> ');
  });

  it('calls onFormat with insert action when Link is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('Link'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('insert');
  });

  it('calls onFormat with tab insert action when Tab is pressed', () => {
    const onFormat = jest.fn();
    const { getByLabelText } = renderWithTheme(
      <MarkdownToolbar onFormat={onFormat} />,
    );
    fireEvent.press(getByLabelText('Tab'));
    const action: FormatAction = onFormat.mock.calls[0][0];
    expect(action.type).toBe('insert');
    expect(action.before).toBe('  ');
  });
});
