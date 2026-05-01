import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { Group, GroupRow } from '../../src/components/ui/Group';
import { TestThemeProvider } from './testThemeProvider';

describe('Group', () => {
  it('renders title + children inside a single Surface', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <Group title="Settings">
          <GroupRow>
            <Text>Theme</Text>
          </GroupRow>
          <GroupRow>
            <Text>Account</Text>
          </GroupRow>
        </Group>
      </TestThemeProvider>,
    );
    expect(getByText('Settings')).toBeTruthy();
    expect(getByText('Theme')).toBeTruthy();
    expect(getByText('Account')).toBeTruthy();
  });

  it('renders footer below the surface', () => {
    const { getByText } = render(
      <TestThemeProvider>
        <Group title="A" footer="below">
          <GroupRow>
            <Text>row</Text>
          </GroupRow>
        </Group>
      </TestThemeProvider>,
    );
    expect(getByText('below')).toBeTruthy();
  });

  it('GroupRow fires onPress when interactive', () => {
    const onPress = jest.fn();
    const { getByText } = render(
      <TestThemeProvider>
        <Group>
          <GroupRow onPress={onPress}>
            <Text>press</Text>
          </GroupRow>
        </Group>
      </TestThemeProvider>,
    );
    fireEvent.press(getByText('press'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('snapshots a 2-row group', () => {
    const tree = render(
      <TestThemeProvider>
        <Group title="A">
          <GroupRow>
            <Text>one</Text>
          </GroupRow>
          <GroupRow>
            <Text>two</Text>
          </GroupRow>
        </Group>
      </TestThemeProvider>,
    ).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
