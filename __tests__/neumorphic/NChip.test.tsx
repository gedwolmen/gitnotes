import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { NChip } from '../../src/components/neumorphic/NChip';
import { TestThemeProvider } from './testThemeProvider';

describe('NChip', () => {
  it('renders a label', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <NChip label="React Native" />
      </TestThemeProvider>,
    );
    expect(getByText('React Native')).toBeTruthy();
  });

  it('fires onPress when pressable', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NChip label="press" onPress={onPress} />
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the active state without crashing', () => {
    const { getByText } = render(
      <TestThemeProvider mode="light">
        <NChip label="active" active />
      </TestThemeProvider>,
    );
    expect(getByText('active')).toBeTruthy();
  });

  it('snapshots inactive + active', () => {
    const inactive = render(
      <TestThemeProvider>
        <NChip label="tag" />
      </TestThemeProvider>,
    ).toJSON();
    expect(inactive).toMatchSnapshot('chip-inactive');

    const active = render(
      <TestThemeProvider>
        <NChip label="tag" active />
      </TestThemeProvider>,
    ).toJSON();
    expect(active).toMatchSnapshot('chip-active');
  });

  it('renders children alongside the label', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <NChip label="parent">
          <Text>child</Text>
        </NChip>
      </TestThemeProvider>,
    );
    expect(getByText('parent')).toBeTruthy();
    expect(getByText('child')).toBeTruthy();
  });
});
