import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import { Surface } from '../../src/components/ui/Surface';
import { TestThemeProvider } from './testThemeProvider';

describe('Surface', () => {
  it('renders children inside a neumorphic light frame', () => {
    const { getByText } = render(
      <TestThemeProvider style="neumorphic" mode="light">
        <Surface>
          <Text>hello</Text>
        </Surface>
      </TestThemeProvider>,
    );
    expect(getByText('hello')).toBeTruthy();
  });

  it('renders children inside a neumorphic dark frame', () => {
    const { getByText } = render(
      <TestThemeProvider style="neumorphic" mode="dark">
        <Surface>
          <Text>dark</Text>
        </Surface>
      </TestThemeProvider>,
    );
    expect(getByText('dark')).toBeTruthy();
  });

  it('honors style="flat" by emitting zero outer shadow', () => {
    const { getByTestId } = render(
      <TestThemeProvider style="flat" mode="light">
        <Surface testID="flat-surface">
          <Text>flat</Text>
        </Surface>
      </TestThemeProvider>,
    );
    const surface = getByTestId('flat-surface');
    // The outer style merges StyleSheet.flatten — check no shadow props leaked.
    const flat = (Array.isArray(surface.props.style)
      ? Object.assign({}, ...surface.props.style.filter(Boolean))
      : surface.props.style) as Record<string, unknown>;
    expect(flat.shadowOpacity).toBeUndefined();
    expect(flat.shadowRadius).toBeUndefined();
  });

  it('snapshots a raised neumorphic Surface with a Text child', () => {
    const tree = render(
      <TestThemeProvider style="neumorphic" mode="light">
        <Surface elevation="raised" radius="md" testID="raised">
          <Text>snap</Text>
        </Surface>
      </TestThemeProvider>,
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
