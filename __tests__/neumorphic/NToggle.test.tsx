import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NToggle } from '../../src/components/neumorphic/NToggle';
import { TestThemeProvider } from './testThemeProvider';

describe('NToggle', () => {
  it('fires onValueChange when pressed', () => {
    const onValueChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <NToggle value={false} onValueChange={onValueChange} testID="toggle" />
      </TestThemeProvider>,
    );
    fireEvent.press(getByTestId('toggle'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('inverts on each press', () => {
    const onValueChange = jest.fn();
    const { getByTestId } = render(
      <TestThemeProvider>
        <NToggle value={true} onValueChange={onValueChange} testID="toggle" />
      </TestThemeProvider>,
    );
    fireEvent.press(getByTestId('toggle'));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it('snapshots both states', () => {
    expect(
      render(
        <TestThemeProvider>
          <NToggle value={false} onValueChange={() => undefined} />
        </TestThemeProvider>,
      ).toJSON(),
    ).toMatchSnapshot('toggle-off');

    expect(
      render(
        <TestThemeProvider>
          <NToggle value={true} onValueChange={() => undefined} />
        </TestThemeProvider>,
      ).toJSON(),
    ).toMatchSnapshot('toggle-on');
  });
});
