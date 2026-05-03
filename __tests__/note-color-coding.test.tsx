jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(), fetch: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: any) => createElement(Text, null, name) };
});

jest.mock('../src/hooks/useResponsive', () => ({ useResponsive: () => ({ isTablet: false }) }));

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import NoteCard from '../src/components/NoteCard';
import { Note } from '../src/models/Note';
import { TestThemeProvider } from './ui/testThemeProvider';

const buildNote = (overrides: Partial<Note> = {}): Note => ({
  id: 'note-1',
  title: 'Color note',
  content: 'body',
  createdAt: 1,
  updatedAt: 1,
  tags: [],
  ...overrides,
});

describe('NoteCard color coding', () => {
  it('renders the mapped border color when note has a color', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <NoteCard note={buildNote({ color: 'purple' })} onPress={jest.fn()} />
      </TestThemeProvider>,
    );

    const style = StyleSheet.flatten(getByTestId('note-card-note-1').props.style);
    expect(style.borderColor).toBe('#8b5cf6');
    expect(style.borderWidth).toBe(2);
  });

  it('renders without extra border when note has no color', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <NoteCard note={buildNote()} onPress={jest.fn()} />
      </TestThemeProvider>,
    );

    const style = StyleSheet.flatten(getByTestId('note-card-note-1').props.style);
    expect(style.borderColor).toBeUndefined();
    expect(style.borderWidth).toBeUndefined();
  });
});
