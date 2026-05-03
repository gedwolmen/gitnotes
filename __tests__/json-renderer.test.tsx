jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() => Promise.resolve({ isConnected: true, isInternetReachable: true }));
  return { __esModule: true, default: { addEventListener, fetch }, addEventListener, fetch };
});

import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import { JsonRenderer } from '../src/components/JsonRenderer';
import { NEUMORPHIC_DARK, NEUMORPHIC_LIGHT } from '../src/theme/tokens';
import { TestThemeProvider } from './ui/testThemeProvider';

describe('JsonRenderer', () => {
  it('renders formatted JSON with themed syntax colors', () => {
    const { getByText, toJSON } = render(
      <TestThemeProvider mode="light">
        <JsonRenderer content='{"name":"GitNotes","count":2,"enabled":true,"nested":{"slug":"wave"}}' />
      </TestThemeProvider>,
    );
    const tree = toJSON();

    const key = getByText('"name"');
    const value = getByText('"GitNotes"');
    const number = getByText('2');

    expect(StyleSheet.flatten(key.props.style).color).toBe(NEUMORPHIC_LIGHT.textSecondary);
    expect(StyleSheet.flatten(value.props.style).color).toBe(NEUMORPHIC_LIGHT.text);
    expect(StyleSheet.flatten(number.props.style).color).toBe(NEUMORPHIC_LIGHT.primary);
    expect((tree as { children?: Array<{ children?: unknown[] }> } | null)?.children?.[1]?.children?.[0]).toBe('  ');
  });

  it('uses dark theme colors and falls back to raw text for malformed JSON', () => {
    const raw = '{"oops": }';
    const { getByText } = render(
      <TestThemeProvider mode="dark">
        <JsonRenderer content={raw} />
      </TestThemeProvider>,
    );

    expect(getByText(raw)).toBeTruthy();
    expect(StyleSheet.flatten(getByText(raw).props.style).color).toBe(NEUMORPHIC_DARK.text);
  });
});
