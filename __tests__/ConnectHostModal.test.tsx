import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';

const stableColors = {
  background: '#fff',
  surface: '#f4f4f4',
  primary: '#2563eb',
  text: '#111',
  textSecondary: '#666',
  border: '#ddd',
  error: '#dc2626',
  accent: '#8b5cf6',
};

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTheme: () => ({ colors: stableColors, tokens: { spacing: { 1: 4, 2: 8, 3: 12, 4: 16 } } }),
  useTokens: () => ({ spacing: { 1: 4, 2: 8, 3: 12, 4: 16 } }),
}));

jest.mock('../src/contexts/AccountsContext', () => ({
  useAccounts: () => ({
    accounts: [],
    accountSummaries: [],
    testToken: jest.fn(async () => ({ ok: true })),
    connectHost: jest.fn(async () => ({ ok: true })),
  }),
}));

jest.mock('../src/components/ui', () => {
  const { View } = require('react-native');
  return {
    Modal: ({ visible, children }: any) => (visible ? <View>{children}</View> : null),
  };
});

jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

import { ConnectHostModal } from '../src/components/ConnectHostModal';

describe('ConnectHostModal', () => {
  it('shows all four provider chips', () => {
    const { getByTestId } = render(
      <ConnectHostModal visible onClose={() => {}} colors={stableColors} />,
    );
    expect(getByTestId('connect-host-provider-github')).toBeTruthy();
    expect(getByTestId('connect-host-provider-gitlab')).toBeTruthy();
    expect(getByTestId('connect-host-provider-gitea')).toBeTruthy();
    expect(getByTestId('connect-host-provider-forgejo')).toBeTruthy();
  });

  it('hides the self-hosted URL field for GitHub only', () => {
    const { queryByTestId, getByTestId } = render(
      <ConnectHostModal visible onClose={() => {}} colors={stableColors} />,
    );
    expect(queryByTestId('connect-host-instance-url-input')).toBeNull();
    fireEvent.press(getByTestId('connect-host-provider-gitlab'));
    expect(queryByTestId('connect-host-instance-url-input')).toBeTruthy();
  });

  it('pre-selects the preset provider', () => {
    const { queryByTestId } = render(
      <ConnectHostModal visible onClose={() => {}} colors={stableColors} presetProvider="gitea" />,
    );
    // For gitea (non-github) the self-host URL field should be visible immediately.
    expect(queryByTestId('connect-host-instance-url-input')).toBeTruthy();
  });

  it('shows and hides the token via the toggle button', () => {
    const { getByTestId } = render(
      <ConnectHostModal visible onClose={() => {}} colors={stableColors} />,
    );
    const input = getByTestId('connect-host-token-input');
    expect(input.props.secureTextEntry).toBe(true);
    fireEvent.press(getByTestId('connect-host-token-toggle'));
    expect(getByTestId('connect-host-token-input').props.secureTextEntry).toBe(false);
  });
});
