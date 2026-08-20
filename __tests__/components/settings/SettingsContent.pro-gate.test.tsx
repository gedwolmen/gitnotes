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
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { useTranslation } from 'react-i18next';
import { SettingsContent } from '../../../src/components/settings/SettingsContent';
import { promptProUpgrade } from '../../../src/utils/proAlerts';

// Locked AI rows route through promptProUpgrade (src/utils/proAlerts.ts), which
// shows an Alert and only calls onOpenPaywall from the upgrade button handler.
// Auto-confirm that button so pressing a locked row can be asserted directly.
function autoConfirmUpgradeAlert() {
  return jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const upgrade = (buttons ?? []).find((b: any) => b.style !== 'cancel');
    upgrade?.onPress?.();
  });
}

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

  it('shows all AI feature rows locked for a free user (no collapsed row, no toggle)', () => {
    const { getByTestId, queryByTestId } = renderContent({ isPro: false });
    expect(queryByTestId('settings.row.ai-locked')).toBeNull();
    expect(queryByTestId('settings.toggle.ai')).toBeNull();
    expect(getByTestId('settings.row.ai-locked-enable')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-daily-quote')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-personalization')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-github-tools')).toBeTruthy();
  });

  it('routes to the paywall when a free user presses any locked AI feature row', () => {
    const onOpenPaywall = jest.fn();
    const alertSpy = autoConfirmUpgradeAlert();
    const { getByTestId } = renderContent({ isPro: false, onOpenPaywall });
    const lockedRows = [
      'settings.row.ai-locked-enable',
      'settings.row.ai-locked-daily-quote',
      'settings.row.ai-locked-personalization',
      'settings.row.ai-locked-github-tools',
    ];
    lockedRows.forEach((row, index) => {
      fireEvent.press(getByTestId(row));
      expect(onOpenPaywall).toHaveBeenCalledTimes(index + 1);
    });
    alertSpy.mockRestore();
  });

  it('shows the secondary AI config rows locked for a free user (no pro controls)', () => {
    const { getByTestId, queryByTestId } = renderContent({ isPro: false });
    expect(getByTestId('settings.row.ai-locked-model')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-action-mode')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-chat-storage')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-reset-memory')).toBeTruthy();
    expect(getByTestId('settings.row.ai-locked-add-provider')).toBeTruthy();
    expect(queryByTestId('settings.button.model-selector')).toBeNull();
    expect(queryByTestId('settings.button.toggle-action-mode')).toBeNull();
    expect(queryByTestId('settings.button.add-provider')).toBeNull();
  });

  it('routes to the paywall when a free user presses any locked secondary AI row', () => {
    const onOpenPaywall = jest.fn();
    const alertSpy = autoConfirmUpgradeAlert();
    const { getByTestId } = renderContent({ isPro: false, onOpenPaywall });
    const lockedRows = [
      'settings.row.ai-locked-model',
      'settings.row.ai-locked-action-mode',
      'settings.row.ai-locked-chat-storage',
      'settings.row.ai-locked-reset-memory',
      'settings.row.ai-locked-add-provider',
    ];
    lockedRows.forEach((row, index) => {
      fireEvent.press(getByTestId(row));
      expect(onOpenPaywall).toHaveBeenCalledTimes(index + 1);
    });
    alertSpy.mockRestore();
  });

  it('shows the secondary AI rows for a pro user', () => {
    const { getByTestId } = renderContent({ isPro: true, isAIEnabled: true });
    expect(getByTestId('settings.button.model-selector')).toBeTruthy();
    expect(getByTestId('settings.button.add-provider')).toBeTruthy();
  });

  it('locks the Fancy UI toggle for a free user and routes to the paywall', () => {
    const onOpenPaywall = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({ isPro: false, onOpenPaywall });
    expect(getByTestId('settings.row.updated-ui')).toBeTruthy();
    expect(queryByTestId('settings.toggle.neu')).toBeNull();
    fireEvent.press(getByTestId('settings.row.updated-ui'));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
  });

  it('shows the Fancy UI toggle for a pro user', () => {
    const { getByTestId } = renderContent({ isPro: true });
    expect(getByTestId('settings.toggle.neu')).toBeTruthy();
    expect(getByTestId('settings.row.updated-ui')).toBeTruthy();
  });
});

describe('Settings Manage Templates — Pro gate', () => {
  it('shows a locked Manage Templates row for a free user and routes to the paywall', () => {
    const onOpenPaywall = jest.fn();
    const onManageTemplates = jest.fn();
    const alertSpy = autoConfirmUpgradeAlert();
    const { getByTestId, queryByTestId, getAllByTestId } = renderContent({
      isPro: false,
      onOpenPaywall,
      onManageTemplates,
    });
    expect(getByTestId('settings.row.manage-templates-locked')).toBeTruthy();
    expect(queryByTestId('settings.button.manage-templates')).toBeNull();
    expect(getAllByTestId('icon-lock-closed').length).toBeGreaterThan(0);
    fireEvent.press(getByTestId('settings.row.manage-templates-locked'));
    expect(onManageTemplates).not.toHaveBeenCalled();
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
    alertSpy.mockRestore();
  });

  it('keeps Manage Templates unlocked for a pro user and navigates on press', () => {
    const onOpenPaywall = jest.fn();
    const onManageTemplates = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');
    const { getByTestId, queryByTestId } = renderContent({
      isPro: true,
      onOpenPaywall,
      onManageTemplates,
    });
    expect(getByTestId('settings.button.manage-templates')).toBeTruthy();
    expect(queryByTestId('settings.row.manage-templates-locked')).toBeNull();
    fireEvent.press(getByTestId('settings.button.manage-templates'));
    expect(onManageTemplates).toHaveBeenCalledTimes(1);
    expect(onOpenPaywall).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

const oneAccountSummary = {
  accountId: 'a1',
  account: { id: 'a1', login: 'user' },
  hosts: [],
  activeHostId: null,
};

describe('Settings Accounts group — second-account gate', () => {
  it('locks the add connect-host row for a free user with one account and routes to the paywall', () => {
    const onOpenPaywall = jest.fn();
    const onAddHost = jest.fn();
    const alertSpy = autoConfirmUpgradeAlert();
    const { t } = useTranslation();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: false,
      onOpenPaywall,
      onAddHost,
      accountSummaries: [oneAccountSummary],
      // Mirrors SettingsScreen.onAddHostLocked: the gated path routes
      // through promptProUpgrade instead of the Connect Host modal.
      onAddHostLocked: () => promptProUpgrade(t, onOpenPaywall),
    });
    expect(getByTestId('settings.row.connect-host-locked')).toBeTruthy();
    expect(queryByTestId('settings.button.connect-host')).toBeNull();
    fireEvent.press(getByTestId('settings.row.connect-host-locked'));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
    expect(onAddHost).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('keeps the empty-state connect-host row ungated for a free user (first account is free)', () => {
    const onOpenPaywall = jest.fn();
    const onAddHost = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: false,
      onOpenPaywall,
      onAddHost,
      accountSummaries: [],
    });
    expect(getByTestId('settings.button.connect-host')).toBeTruthy();
    expect(queryByTestId('settings.row.connect-host-locked')).toBeNull();
    fireEvent.press(getByTestId('settings.button.connect-host'));
    expect(onAddHost).toHaveBeenCalledTimes(1);
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  it('keeps the add connect-host row ungated for a pro user with one account', () => {
    const onOpenPaywall = jest.fn();
    const onAddHost = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: true,
      onOpenPaywall,
      onAddHost,
      accountSummaries: [oneAccountSummary],
    });
    expect(getByTestId('settings.button.connect-host')).toBeTruthy();
    expect(queryByTestId('settings.row.connect-host-locked')).toBeNull();
    fireEvent.press(getByTestId('settings.button.connect-host'));
    expect(onAddHost).toHaveBeenCalledTimes(1);
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });
});

const oneRepository = {
  id: 'r1',
  name: 'test-notes',
  path: 'vidwadeseram/test-notes',
  branch: 'main',
};

describe('Settings Repositories group — add-repo gate', () => {
  it('locks the add-repo row for a free user with one repo and routes to the paywall', () => {
    const onOpenPaywall = jest.fn();
    const onOpenRepoPicker = jest.fn();
    const alertSpy = autoConfirmUpgradeAlert();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: false,
      onOpenPaywall,
      onOpenRepoPicker,
      repositories: [oneRepository],
    });
    expect(getByTestId('settings.row.add-repo-locked')).toBeTruthy();
    expect(queryByTestId('settings.button.repo-picker')).toBeNull();
    fireEvent.press(getByTestId('settings.row.add-repo-locked'));
    expect(onOpenPaywall).toHaveBeenCalledTimes(1);
    expect(onOpenRepoPicker).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('keeps the empty-state add-repo row ungated for a free user (first repo is free)', () => {
    const onOpenPaywall = jest.fn();
    const onOpenRepoPicker = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: false,
      onOpenPaywall,
      onOpenRepoPicker,
      repositories: [],
    });
    expect(getByTestId('settings.button.repo-picker')).toBeTruthy();
    expect(queryByTestId('settings.row.add-repo-locked')).toBeNull();
    fireEvent.press(getByTestId('settings.button.repo-picker'));
    expect(onOpenRepoPicker).toHaveBeenCalledTimes(1);
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  it('keeps the add-repo row ungated for a pro user with one repo', () => {
    const onOpenPaywall = jest.fn();
    const onOpenRepoPicker = jest.fn();
    const { getByTestId, queryByTestId } = renderContent({
      isPro: true,
      onOpenPaywall,
      onOpenRepoPicker,
      repositories: [oneRepository],
    });
    expect(getByTestId('settings.button.repo-picker')).toBeTruthy();
    expect(queryByTestId('settings.row.add-repo-locked')).toBeNull();
    fireEvent.press(getByTestId('settings.button.repo-picker'));
    expect(onOpenRepoPicker).toHaveBeenCalledTimes(1);
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  it('keeps per-repo sync and remove buttons active for a free user with one repo', () => {
    const onSyncRepo = jest.fn();
    const onRemoveRepo = jest.fn();
    const { getByTestId } = renderContent({
      isPro: false,
      onSyncRepo,
      onRemoveRepo,
      repositories: [oneRepository],
    });
    fireEvent.press(getByTestId('settings.button.sync-repo'));
    expect(onSyncRepo).toHaveBeenCalledWith(oneRepository);
    fireEvent.press(getByTestId('settings.button.remove-repo'));
    expect(onRemoveRepo).toHaveBeenCalledWith(oneRepository);
  });
});
