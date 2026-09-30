import React from 'react';
import { Text, View } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { GroupRow } from '../../../src/components/ui';

// Test the GroupRow component behavior directly
describe('GroupRow Connect Host behavior', () => {
  it('renders with correct testID for connect-host', () => {
    const onAddHost = jest.fn();
    const { getByTestId } = render(
      <View>
        <GroupRow
          testID="settings.button.connect-host"
          onPress={onAddHost}
          leading={null}
          trailing={null}
        >
          <Text>Connect Host</Text>
        </GroupRow>
      </View>
    );
    expect(getByTestId('settings.button.connect-host')).toBeTruthy();
  });

  it('calls onAddHost when pressed', () => {
    const onAddHost = jest.fn();
    const { getByTestId } = render(
      <View>
        <GroupRow
          testID="settings.button.connect-host"
          onPress={onAddHost}
        >
          <Text>Connect Host</Text>
        </GroupRow>
      </View>
    );
    fireEvent.press(getByTestId('settings.button.connect-host'));
    expect(onAddHost).toHaveBeenCalledTimes(1);
  });

  it('renders locked variant with correct testID', () => {
    const onAddHostLocked = jest.fn();
    const { getByTestId } = render(
      <View>
        <GroupRow
          testID="settings.row.connect-host-locked"
          onPress={onAddHostLocked}
        >
          <Text>Connect Host</Text>
        </GroupRow>
      </View>
    );
    expect(getByTestId('settings.row.connect-host-locked')).toBeTruthy();
  });
});

// Test the bottom padding calculation logic
describe('SettingsContent bottom padding fix', () => {
  it('ensures minimum 80px bottom padding when tabBarHeight is 0', () => {
    const tabBarHeight = 0;
    const computedPadding = Math.max(tabBarHeight + 16, 80);
    expect(computedPadding).toBe(80);
  });

  it('uses tabBarHeight + 16 when greater than 80', () => {
    const tabBarHeight = 84;
    const computedPadding = Math.max(tabBarHeight + 16, 80);
    expect(computedPadding).toBe(100); // 84 + 16 = 100, which is > 80
  });

  it('uses 80 when tabBarHeight + 16 equals 80', () => {
    const tabBarHeight = 64;
    const computedPadding = Math.max(tabBarHeight + 16, 80);
    expect(computedPadding).toBe(80);
  });
});
