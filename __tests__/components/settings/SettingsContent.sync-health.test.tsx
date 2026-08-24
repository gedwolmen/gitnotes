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
import { render } from '@testing-library/react-native';
import { SettingsContent } from '../../../src/components/settings/SettingsContent';
import type { ForegroundSyncHealth } from '../../../src/services/ForegroundSyncService';

function renderContent(health: ForegroundSyncHealth) {
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
    onAddHostLocked: jest.fn(),
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
    syncFrequentlyEnabled: true,
    syncIntervalSeconds: 60,
    onToggleSyncFrequently: jest.fn(),
    onSetSyncIntervalSeconds: jest.fn(),
    syncPaused: false,
    onToggleSyncPaused: jest.fn(),
    isPro: true,
    proStatusLabel: 'pro.statusActive',
    onOpenPaywall: jest.fn(),
    syncHealth: health,
  };
  return render(React.createElement(SettingsContent as React.ComponentType<Record<string, unknown>>, base));
}

const idle: ForegroundSyncHealth = {
  status: 'idle', lastRunAt: 0, lastCompletedAt: 0, lastFailedAt: 0, consecutiveFailures: 0,
};

describe('SettingsContent sync health row (#1007)', () => {
  it('does not render a health row before any sync has run', () => {
    const { queryByTestId } = renderContent(idle);
    expect(queryByTestId('settings.row.sync-health')).toBeNull();
  });

  it('renders the healthy state after a successful sync', () => {
    const { getByTestId, getByText } = renderContent({ ...idle, status: 'ok' });
    expect(getByTestId('settings.row.sync-health')).toBeTruthy();
    expect(getByText('Sync up to date')).toBeTruthy();
  });

  it('renders the failed state with elapsed time and failure count', () => {
    const { getByTestId, getByText } = renderContent({
      ...idle,
      status: 'failed',
      consecutiveFailures: 3,
      lastFailedAt: Date.now() - 5 * 60_000,
    });
    expect(getByTestId('settings.row.sync-health')).toBeTruthy();
    expect(getByText('Last sync failed')).toBeTruthy();
    expect(getByText('5m ago · 3 consecutive failures')).toBeTruthy();
  });

  it('renders the timed-out state with elapsed time', () => {
    const { getByTestId, getByText } = renderContent({
      ...idle,
      status: 'timedout',
      consecutiveFailures: 1,
      lastFailedAt: Date.now() - 2 * 60_000,
    });
    expect(getByTestId('settings.row.sync-health')).toBeTruthy();
    expect(getByText('Last sync timed out')).toBeTruthy();
    expect(getByText('2m ago')).toBeTruthy();
  });
});
