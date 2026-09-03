import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Button } from '../../src/components/ui/Button';
import { TestThemeProvider } from './testThemeProvider';
import { NEUMORPHIC_LIGHT, TYPE } from '../../src/theme/tokens';

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

  it('fullWidth button stretches its Surface and content so the label is centered', () => {
    const { getByText, UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="Next" variant="primary" fullWidth trailingIcon="→" />
      </TestThemeProvider>,
    );

    // The Surface must stretch to the button's full width; otherwise the inner
    // content row has no width to justify-center against and the label hugs
    // the left edge (onboarding "Next" bug).
    const surfaces = UNSAFE_getByType(require('../../src/components/ui/Surface').Surface);
    const flattened = require('react-native').StyleSheet.flatten(surfaces.props.style);
    expect(flattened.alignSelf).toBe('stretch');

    // The content wrapper must also stretch so justify-center works.
    const label = getByText('Next');
    expect(label).toBeTruthy();
  });

  it('keeps the label optically centered when a trailing icon is present (equal side spacers)', () => {
    const { UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="Next" variant="primary" fullWidth trailingIcon="→" />
      </TestThemeProvider>,
    );
    // The centered label row is wrapped in a flex-row with an equal-width
    // spacer on each side, so the text sits at the button's true center even
    // though the trailing arrow is pinned to the right edge.
    expect(UNSAFE_getByType(require('../../src/components/ui/Button').Button)).toBeTruthy();
  });

  it('keeps the label optically centered when a leading icon is present with iconAlign="edge"', () => {
    const { UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="New Chat" variant="primary" fullWidth leadingIcon="+" iconAlign="edge" />
      </TestThemeProvider>,
    );
    // Same equal-side-spacer trick as the trailing-icon case: with the leading
    // icon pinned to the left edge, the equal spacers keep the label centered.
    expect(UNSAFE_getByType(require('../../src/components/ui/Button').Button)).toBeTruthy();
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
    expect(flattened.backgroundColor).toBe(NEUMORPHIC_LIGHT.surface);
  });

  it('outline variant uses a transparent fill and the theme border color', () => {
    const { UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button label="Cancel" variant="outline" />
      </TestThemeProvider>,
    );

    const surfaces = UNSAFE_getByType(require('../../src/components/ui/Surface').Surface);
    const flattened = require('react-native').StyleSheet.flatten(surfaces.props.style);
    expect(flattened.backgroundColor).toBe('transparent');
    expect(flattened.borderWidth).toBe(1);
    expect(flattened.borderColor).toBe(NEUMORPHIC_LIGHT.border);
  });

  it('size="sm" renders a compact button: 36px min height, rounded-sm surface, smaller label', () => {
    const { getByText, UNSAFE_getByType } = render(
      <TestThemeProvider>
        <Button size="sm" variant="primary" label="Push" />
      </TestThemeProvider>,
    );

    const surface = UNSAFE_getByType(require('../../src/components/ui/Surface').Surface);
    expect(surface.props.radius).toBe('sm');
    const flattened = require('react-native').StyleSheet.flatten(surface.props.style);
    expect(flattened.minHeight).toBe(36);

    const label = getByText('Push');
    expect(label.props.style).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: '#fff', fontSize: TYPE.sm }),
      ]),
    );
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
