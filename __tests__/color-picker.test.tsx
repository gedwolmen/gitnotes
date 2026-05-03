jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(), fetch: jest.fn() },
}));

jest.mock('@expo/vector-icons', () => {
  const { createElement } = require('react');
  const { Text } = require('react-native');
  return { Ionicons: ({ name }: any) => createElement(Text, null, name) };
});

jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View };
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ColorPicker from '../src/components/ColorPicker';
import { TestThemeProvider } from './ui/testThemeProvider';

describe('ColorPicker', () => {
  it('fires onSelect with the chosen NoteColor and then closes', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <TestThemeProvider>
        <ColorPicker visible={true} onClose={onClose} onSelect={onSelect} />
      </TestThemeProvider>,
    );

    fireEvent.press(getByTestId('color-picker-swatch-purple'));

    expect(onSelect).toHaveBeenCalledWith('purple');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes null when "None" is tapped', () => {
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { getByTestId } = render(
      <TestThemeProvider>
        <ColorPicker
          visible={true}
          onClose={onClose}
          onSelect={onSelect}
          selected="red"
        />
      </TestThemeProvider>,
    );

    fireEvent.press(getByTestId('color-picker-none'));

    expect(onSelect).toHaveBeenCalledWith(null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders all eight preset swatches', () => {
    const { getByTestId } = render(
      <TestThemeProvider>
        <ColorPicker visible={true} onClose={jest.fn()} onSelect={jest.fn()} />
      </TestThemeProvider>,
    );

    [
      'red',
      'orange',
      'yellow',
      'green',
      'blue',
      'purple',
      'pink',
      'gray',
    ].forEach((color) => {
      expect(getByTestId(`color-picker-swatch-${color}`)).toBeTruthy();
    });
  });
});
