import React from 'react';
import { FlatList } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import CommandPaletteModal from '../../src/components/CommandPaletteModal';

jest.mock('../../src/components/ui/Modal', () => ({
  Modal: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: {
      border: '#cccccc',
      surface: '#f5f5f5',
      text: '#000000',
      textSecondary: '#666666',
    },
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

describe('CommandPaletteModal', () => {
  it('keeps result taps active while the search keyboard is open', () => {
    const { UNSAFE_getByType } = render(
      <CommandPaletteModal visible onClose={jest.fn()} />,
    );

    expect(UNSAFE_getByType(FlatList).props.keyboardShouldPersistTaps).toBe('handled');
  });

  it('updates visible commands when the query changes', () => {
    const { getByPlaceholderText, getByText, queryByText } = render(
      <CommandPaletteModal visible onClose={jest.fn()} />,
    );

    fireEvent.changeText(getByPlaceholderText('Search commands...'), 'home');

    expect(getByText('Go Home')).toBeTruthy();
    expect(queryByText('New Note')).toBeNull();
  });
});
