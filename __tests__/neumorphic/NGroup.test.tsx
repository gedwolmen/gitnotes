import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { NGroup, NGroupRow } from '../../src/components/neumorphic/NGroup';
import { TestThemeProvider } from './testThemeProvider';

describe('NGroup', () => {
  it('renders title + children inside a single Surface', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <NGroup title="Settings">
          <NGroupRow>
            <Text>Theme</Text>
          </NGroupRow>
          <NGroupRow>
            <Text>Account</Text>
          </NGroupRow>
        </NGroup>
      </TestThemeProvider>,
    );
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Theme')).toBeTruthy();
    expect(getByText('Account')).toBeTruthy();
  });

  it('renders footer below the surface', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <NGroup title="A" footer="below">
          <NGroupRow>
            <Text>row</Text>
          </NGroupRow>
        </NGroup>
      </TestThemeProvider>,
    );
    expect(getByText('below')).toBeTruthy();
  });

  it('NGroupRow fires onPress when interactive', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <NGroup>
          <NGroupRow onPress={onPress}>
            <Text>press</Text>
          </NGroupRow>
        </NGroup>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('snapshots a 2-row group', () => {
    const tree = render(
      <TestThemeProvider>
        <NGroup title="A">
          <NGroupRow>
            <Text>one</Text>
          </NGroupRow>
          <NGroupRow>
            <Text>two</Text>
          </NGroupRow>
        </NGroup>
      </TestThemeProvider>,
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
