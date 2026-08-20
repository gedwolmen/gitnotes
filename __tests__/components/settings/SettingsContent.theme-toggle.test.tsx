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

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
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
import * as Haptics from 'expo-haptics';
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
    isPro: true,
    proStatusLabel: 'pro.statusActive',
    onOpenPaywall: jest.fn(),
    ...props,
  };
  return render(React.createElement(SettingsContent as React.ComponentType<Record<string, unknown>>, base));
}

describe('Settings dark mode toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('toggling ON from system theme fires a selection haptic and calls setTheme("dark")', () => {
    const setTheme = jest.fn();
    const { getByTestId } = renderContent({ theme: 'system', setTheme });
    fireEvent(getByTestId('settings.toggle.theme'), 'onValueChange', true);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('toggling OFF from dark theme fires a selection haptic and calls setTheme("light")', () => {
    const setTheme = jest.fn();
    const { getByTestId } = renderContent({ theme: 'dark', setTheme });
    fireEvent(getByTestId('settings.toggle.theme'), 'onValueChange', false);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledTimes(1);
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  it('shows Use System Theme as Active while in system theme', () => {
    const { getByText } = renderContent({ theme: 'system' });
    const row = getByText('Use System Theme');
    expect(row).toBeTruthy();
    expect(getByText('Active')).toBeTruthy();
  });

  it('shows Use System Theme as Inactive once an explicit theme is set', () => {
    const { getByText } = renderContent({ theme: 'dark' });
    expect(getByText('Use System Theme')).toBeTruthy();
    expect(getByText('Inactive')).toBeTruthy();
  });
});
