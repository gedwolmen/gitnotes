import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { NCard } from '../../src/components/neumorphic/NCard';
import { TestThemeProvider } from './testThemeProvider';

describe('NCard', () => {
  it('renders children', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <NCard>
          <Text>card body</Text>
        </NCard>
      </TestThemeProvider>,
    );
    expect(getByText('card body')).toBeTruthy();
  });

  it('fires onPress when interactive', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NCard onPress={onPress}>
          <Text>tap</Text>
        </NCard>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NCard onPress={onPress} disabled>
          <Text>nope</Text>
        </NCard>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('nope'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('snapshots non-interactive light', () => {
    const tree = render(
      <TestThemeProvider>
        <NCard>
          <Text>snap</Text>
        </NCard>
      </TestThemeProvider>,
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
