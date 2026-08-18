jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: jest.fn(() => jest.fn()), fetch: jest.fn(async () => ({ isConnected: true })) },
}));

jest.mock('../../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
    },
  }),
  useTokens: () => ({
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626', elevated: '#fff',
    },
    spacing: [0, 4, 8, 12, 16, 20, 24],
    type: { sm: 12, md: 14, lg: 16, xl: 18, '2xl': 22 },
  }),
}));

jest.mock('../../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, TouchableOpacity, Switch } = require('react-native');
  const Row = ({ children, onPress, testID, trailing }: any) =>
    React.createElement(TouchableOpacity, { testID, onPress },
      React.createElement(View, null, children, trailing));
  return {
    useScreenHeaderHeight: () => 60,
    Group: ({ title, children }: any) =>
      React.createElement(View, null,
        React.createElement(Text, null, String(title)),
        children),
    GroupRow: Row,
    Modal: ({ children }: any) => React.createElement(View, null, children),
    Toggle: ({ value, onValueChange, testID, disabled }: any) =>
      React.createElement(Switch, { value: Boolean(value), onValueChange, testID, disabled }),
    HintIcon: () => React.createElement(View, null),
  };
});

jest.mock('../../../src/components/ui/HintIcon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { HintIcon: () => React.createElement(View, null) };
});

jest.mock('../../../src/components/settings/ReminderSection', () => {
  const React = require('react');
  const { View } = require('react-native');
  return { ReminderSection: () => React.createElement(View, null) };
});

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingsContent } from '../../../src/components/settings/SettingsContent';

function renderContent(props: Record<string, unknown> = {}) {
  const base = {
    colors: {
      background: '#fff', surface: '#f4f4f4', primary: '#2563eb', accent: '#2563eb',
      text: '#111', textSecondary: '#666', border: '#ddd', error: '#dc2626',
    },
    headerHeight: 60,
    tabBarHeight: 60,
    theme: 'light',
    uiStyle: 'flat',
    accounts: [],
    activeAccountId: null,
    authState: { isAuthenticated: false },
    accountSummaries: [],
    repositories: [],
    syncingRepo: null,
    syncModes: {},
    cloningRepo: null,
    templatesRepoPref: null,
    isSyncingExistingTemplates: false,
    isAIEnabled: true,
    selectedModelName: '',
    actionMode: 'auto',
    chatStorageLabel: '',
    providers: [],
    setTheme: jest.fn(),
    setStyle: jest.fn(),
    onOpenConnectToken: jest.fn(),
    onOpenAddAccount: jest.fn(),
    onSwitchAccount: jest.fn(),
    onRemoveAccount: jest.fn(),
    onRemoveToken: jest.fn(),
    onDisconnectHost: jest.fn(),
    onAddHost: jest.fn(),
    onOpenRepoPicker: jest.fn(),
    onSyncRepo: jest.fn(),
    onRemoveRepo: jest.fn(),
    onEnableCloneMode: jest.fn(),
    onDisableCloneMode: jest.fn(),
    lfsPending: {},
    lfsDownloadingRepo: null,
    onDownloadLfsObjects: jest.fn(),
    onOpenTemplatesRepoPicker: jest.fn(),
    onSyncExistingTemplates: jest.fn(),
    onClearTemplatesRepo: jest.fn(),
    onOpenRenderStyleSettings: jest.fn(),
    onClearData: jest.fn(),
    onResetOnboarding: jest.fn(),
    isPro: true,
    proStatusLabel: 'pro.statusActive',
    onOpenPaywall: jest.fn(),
    ...props,
  };
  return render(React.createElement(SettingsContent as React.ComponentType<Record<string, unknown>>, base));
}

describe('Settings Pro section', () => {
  it('shows the active label for a pro user and does not route to the paywall', () => {
    const onOpenPaywall = jest.fn();
    const { getByTestId, getByText } = renderContent({ isPro: true, proStatusLabel: 'pro.statusActive', onOpenPaywall });
    expect(getByText('pro.statusActive')).toBeTruthy();
    fireEvent.press(getByTestId('settings.row.pro'));
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  it('shows the trial label with days remaining during a trial', () => {
    const { getByText } = renderContent({ isPro: true, proStatusLabel: 'pro.statusTrial' });
    expect(getByText('pro.statusTrial')).toBeTruthy();
  });

  it('shows the upgrade label and routes to the paywall for a free user', () => {
    const onOpenPaywall = jest.fn();
    const { getByTestId, getByText } = renderContent({ isPro: false, proStatusLabel: 'pro.statusUpgrade', onOpenPaywall });
    expect(getByText('pro.statusUpgrade')).toBeTruthy();
    fireEvent.press(getByTestId('settings.row.pro'));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it('shows the full AI section for a pro user', () => {
    const { getByTestId, queryByTestId } = renderContent({ isPro: true, isAIEnabled: true });
    expect(getByTestId('settings.toggle.ai')).toBeTruthy();
    expect(queryByTestId('settings.row.ai-locked')).toBeNull();
  });

  it('replaces the AI section with a locked row for a free user', () => {
    const onOpenPaywall = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({ isPro: false, onOpenPaywall });
    expect(getByTestId('settings.row.ai-locked')).toBeTruthy();
    expect(queryByTestId('settings.toggle.ai')).toBeNull();
    fireEvent.press(getByTestId('settings.row.ai-locked'));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it('hides the secondary AI rows (model selector, action mode, providers) for a free user', () => {
    const { queryByTestId } = renderContent({ isPro: false, isAIEnabled: true });
    expect(queryByTestId('settings.button.model-selector')).toBeNull();
    expect(queryByTestId('settings.button.toggle-action-mode')).toBeNull();
    expect(queryByTestId('settings.button.add-provider')).toBeNull();
  });

  it('shows the secondary AI rows for a pro user', () => {
    const { getByTestId } = renderContent({ isPro: true, isAIEnabled: true });
    expect(getByTestId('settings.button.model-selector')).toBeTruthy();
    expect(getByTestId('settings.button.add-provider')).toBeTruthy();
  });
});
