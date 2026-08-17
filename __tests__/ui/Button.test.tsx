import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../src/components/ui/Button';
import { TestThemeProvider } from './testThemeProvider';
import { NEUMORPHIC_LIGHT } from '../../src/theme/tokens';

describe('Button', () => {
  it('renders the label and fires onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <Button label="Tap me" onPress={onPress} />
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('Tap me'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders all three variants without crashing', () => {
    for (const variant of ['primary', 'secondary', 'ghost'] as const) {
      const { getByText } = render(
        <TestThemeProvider>
          <Button label={variant} variant={variant} />
        </TestThemeProvider>,
      );
      expect(getByText(variant)).toBeTruthy();
    }
  });

  it('primary variant fills the primary background and uses white text (not white-on-white)', () => {
    const { getByText, UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="Save" variant="primary" />
      </TestThemeProvider>,
    );

    const label = getByText('Save');
    // Label text must be white (readable against the filled primary background).
    expect(label.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: '#fff' })]),
    );

    // A primary button must carry the theme primary background on its surface.
    const surfaces = UNSAFE_getByType(require('../../src/components/ui/Surface').Surface);
    const flattened = require('react-native').StyleSheet.flatten(surfaces.props.style);
    expect(flattened.backgroundColor).toBe(NEUMORPHIC_LIGHT.primary);
  });

  it('secondary variant keeps theme text color on the surface background', () => {
    const { getByText, UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="Edit" variant="secondary" />
      </TestThemeProvider>,
    );

    const label = getByText('Edit');
    expect(label.props.style).toEqual(
      expect.arrayContaining([expect.objectContaining({ color: NEUMORPHIC_LIGHT.text })]),
    );

    const surfaces = UNSAFE_getByType(require('../../src/components/ui/Surface').Surface);
    const flattened = require('react-native').StyleSheet.flatten(surfaces.props.style);
    expect(flattened.backgroundColor).toBeUndefined();
  });

  it('applies disabled state without firing onPress', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <Button label="No-go" onPress={onPress} disabled />
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('No-go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('snapshots primary in light + dark', () => {
    const light = render(
      <TestThemeProvider mode="light">
        <Button label="Save" variant="primary" />
      </TestThemeProvider>,
    ).toJSON();
    expect(light).toMatchSnapshot('primary-light');

    const dark = render(
      <TestThemeProvider mode="dark">
        <Button label="Save" variant="primary" />
      </TestThemeProvider>,
    ).toJSON();
    expect(dark).toMatchSnapshot('primary-dark');
  });
});
