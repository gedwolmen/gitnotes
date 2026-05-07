import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Card } from '../../src/components/ui/Card';
import { TestThemeProvider } from './testThemeProvider';

describe('Card', () => {
  it('renders children', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <Card>
          <Text>card body</Text>
        </Card>
      </TestThemeProvider>,
    );
    expect(getByText('card body')).toBeTruthy();
  });

  it('fires onPress when interactive', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <Card onPress={onPress}>
          <Text>tap</Text>
        </Card>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('tap'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('blocks onPress when disabled', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <Card onPress={onPress} disabled>
          <Text>nope</Text>
        </Card>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('nope'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('snapshots non-interactive light', () => {
    const tree = render(
      <TestThemeProvider>
        <Card>
          <Text>snap</Text>
        </Card>
      </TestThemeProvider>,
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
