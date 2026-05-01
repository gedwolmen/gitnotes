import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NButton } from '../../src/components/neumorphic/NButton';
import { TestThemeProvider } from './testThemeProvider';

describe('NButton', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NButton label="Tap me" onPress={onPress} />
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders all three variants without crashing', () => {
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      const { getByText } = render(
        <TestThemeProvider>
          <NButton label={variant} variant={variant} />
        </TestThemeProvider>,
      );
      expect(getByText(variant)).toBeTruthy();
    }
  });

  it('applies disabled state without firing onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NButton label="No-go" onPress={onPress} disabled />
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('No-go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('snapshots primary in light + dark', () => {
    const light = render(
      <TestThemeProvider mode="light">
        <NButton label="Save" variant="primary" />
      </TestThemeProvider>,
    ).toJSON();
    expect(light).toMatchSnapshot('primary-light');

    const dark = render(
      <TestThemeProvider mode="dark">
        <NButton label="Save" variant="primary" />
      </TestThemeProvider>,
    ).toJSON();
    expect(dark).toMatchSnapshot('primary-dark');
  });
});
