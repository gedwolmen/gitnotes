import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { SettingsContent } from '../src/components/settings/SettingsContent';
import { aiMemoryIndex } from '../src/services/ai/AIMemoryIndexService';
import { HapticService } from '../src/utils/haptics';
import * as FileSystem from 'expo-file-system/legacy';

jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

jest.mock('@react-native-community/netinfo', () => {
  const addEventListener = jest.fn(() => jest.fn());
  const fetch = jest.fn(() =>
    Promise.resolve({ isConnected: true, isInternetReachable: true }),
  );
  return {
    __esModule: true,
    default: { addEventListener, fetch },
    addEventListener,
    fetch,
  };
});

jest.mock('../src/services/ai/AIMemoryIndexService', () => ({
  aiMemoryIndex: {
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
    heavy: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/',
  getInfoAsync: jest.fn(async () => ({ exists: true })),
  deleteAsync: jest.fn(async () => undefined),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  manifest: { version: '1.0.0' },
}));

jest.mock('../src/contexts/ThemeContext', () => ({
  useTokens: () => ({
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
  }),
}));

jest.mock('../src/hooks/useProviderAvailability', () => ({
  useProvidersAvailability: () => ({}),
}));

jest.mock('../src/components/ui/HintIcon', () => ({
  HintIcon: () => null,
}));

jest.mock('../src/components/settings/ReminderSection', () => ({
  ReminderSection: () => null,
}));

jest.mock('../src/components/ui', () => {
  const RN = jest.requireActual('react-native');
  return {
    Group: ({ title, children }: any) => (
      <RN.View testID={`group-${title}`}>
        <RN.Text testID="group-title">{title}</RN.Text>
        {children}
      </RN.View>
    ),
    GroupRow: ({ children, trailing, onPress, testID }: any) => (
      <RN.Pressable testID={testID || 'group-row'} onPress={onPress}>
        {children}
        {trailing}
      </RN.Pressable>
    ),
    Toggle: ({ value, onValueChange, testID }: any) => (
      <RN.Pressable testID={testID || 'toggle'} onPress={() => onValueChange(!value)}>
        <RN.Text>{value ? 'On' : 'Off'}</RN.Text>
      </RN.Pressable>
    ),
    Modal: ({ visible, children }: any) => (visible ? <RN.View testID="modal">{children}</RN.View> : null),
  };
});

jest.mock('../src/components/settings/settingsStyles', () => {
  const { StyleSheet } = jest.requireActual('react-native');
  return {
    settingsStyles: StyleSheet.create({
      scrollContent: { flex: 1 },
      settingLabel: { fontSize: 16 },
      settingValue: { fontSize: 15 },
      creditsWrap: { padding: 16 },
      creditsText: { fontSize: 12 },
      bottomPad: { height: 20 },
    }),
  };
});

jest.mock('../src/i18n', () => {
  const actual = jest.requireActual('../src/i18n');
  return {
    ...actual,
    getLanguagePreference: jest.fn(async () => 'en'),
  };
});

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

function renderSettings() {
  return render(
    <SettingsContent
      colors={stableColors}
      headerHeight={60}
      tabBarHeight={84}
      theme="light"
      uiStyle="flat"
      accounts={[]}
      activeAccountId={null}
      authState={{ isAuthenticated: false }}
      accountSummaries={[]}
      repositories={[]}
      syncingRepo={null}
      syncModes={{}}
      cloningRepo={null}
      templatesRepoPref={null}
      isSyncingExistingTemplates={false}
      isAIEnabled={true}
      selectedModelName="Not set"
      actionMode="auto"
      chatStorageLabel="Not set"
      providers={[]}
      setTheme={jest.fn()}
      setStyle={jest.fn()}
      onOpenConnectToken={jest.fn()}
      onOpenAddAccount={jest.fn()}
      onSwitchAccount={jest.fn()}
      onRemoveAccount={jest.fn()}
      onRemoveToken={jest.fn()}
      onDisconnectHost={jest.fn()}
      onAddHost={jest.fn()}
      onOpenRepoPicker={jest.fn()}
      onSyncRepo={jest.fn()}
      onRemoveRepo={jest.fn()}
      onEnableCloneMode={jest.fn()}
      onDisableCloneMode={jest.fn()}
      lfsPending={{}}
      lfsDownloadingRepo={null}
      onDownloadLfsObjects={jest.fn()}
      onOpenTemplatesRepoPicker={jest.fn()}
      onSyncExistingTemplates={jest.fn()}
      onClearTemplatesRepo={jest.fn()}
      onOpenRenderStyleSettings={jest.fn()}
      onClearData={jest.fn()}
      onResetOnboarding={jest.fn()}
      isPro={true}
      proStatusLabel="pro.statusActive"
      onOpenPaywall={jest.fn()}
      onManageTemplates={jest.fn()}
      onToggleAI={jest.fn()}
      onOpenModelSelector={jest.fn()}
      onToggleActionMode={jest.fn()}
      onOpenChatRepoPicker={jest.fn()}
      onProviderPress={jest.fn()}
      onAddProvider={jest.fn()}
      isBiometricLockEnabled={false}
      isBiometricAvailable={true}
      biometricKind={null}
      biometricLabel=""
      lockTimeout={300000}
      onToggleBiometricLock={jest.fn()}
      onSetLockTimeout={jest.fn()}
      isBackgroundSyncEnabled={false}
      onToggleBackgroundSync={jest.fn()}
      syncFrequentlyEnabled={false}
      syncIntervalSeconds={60}
      onToggleSyncFrequently={jest.fn()}
      onSetSyncIntervalSeconds={jest.fn()}
    />,
  );
}

describe('Settings - Reset AI Memory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders Reset AI Memory row when AI is enabled', () => {
    const { getByTestId } = renderSettings();
    expect(getByTestId('settings.button.reset-ai-memory')).toBeTruthy();
  });

  it('shows modal when Reset AI Memory row is pressed', () => {
    const { getByTestId, queryByTestId } = renderSettings();
    expect(queryByTestId('modal')).toBeNull();

    fireEvent.press(getByTestId('settings.button.reset-ai-memory'));

    expect(queryByTestId('modal')).toBeTruthy();
    expect(HapticService.warning).toHaveBeenCalled();
  });

  it('calls clear() and deletes manifest when confirm button is pressed', async () => {
    const { getByTestId } = renderSettings();

    fireEvent.press(getByTestId('settings.button.reset-ai-memory'));

    await act(async () => {
      fireEvent.press(getByTestId('settings.button.confirm-reset-ai-memory'));
    });

    await waitFor(() => {
      expect(aiMemoryIndex.clear).toHaveBeenCalledTimes(1);
    });

    expect(FileSystem.deleteAsync).toHaveBeenCalledWith('file:///mock/thought-dump-manifest.json');
    expect(HapticService.success).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('AI Memory Cleared');
  });

  it('does not call clear() when cancel button is pressed', async () => {
    const { getByTestId, queryAllByText } = renderSettings();

    fireEvent.press(getByTestId('settings.button.reset-ai-memory'));

    const cancelButtons = queryAllByText('Cancel');
    expect(cancelButtons.length).toBeGreaterThan(0);
    fireEvent.press(cancelButtons[cancelButtons.length - 1]);

    await waitFor(() => {
      expect(aiMemoryIndex.clear).not.toHaveBeenCalled();
    });
  });

  it('does not render Reset AI Memory row when AI is disabled', () => {
    const { queryByTestId } = render(
      <SettingsContent
        colors={stableColors}
        headerHeight={60}
        tabBarHeight={84}
        theme="light"
        uiStyle="flat"
        accounts={[]}
        activeAccountId={null}
        authState={{ isAuthenticated: false }}
        accountSummaries={[]}
        repositories={[]}
        syncingRepo={null}
        syncModes={{}}
        cloningRepo={null}
        templatesRepoPref={null}
        isSyncingExistingTemplates={false}
        isAIEnabled={false}
        selectedModelName="Not set"
        actionMode="auto"
        chatStorageLabel="Not set"
        providers={[]}
        setTheme={jest.fn()}
        setStyle={jest.fn()}
        onOpenConnectToken={jest.fn()}
        onOpenAddAccount={jest.fn()}
        onSwitchAccount={jest.fn()}
        onRemoveAccount={jest.fn()}
        onRemoveToken={jest.fn()}
        onDisconnectHost={jest.fn()}
        onAddHost={jest.fn()}
        onOpenRepoPicker={jest.fn()}
        onSyncRepo={jest.fn()}
        onRemoveRepo={jest.fn()}
        onEnableCloneMode={jest.fn()}
        onDisableCloneMode={jest.fn()}
        lfsPending={{}}
        lfsDownloadingRepo={null}
        onDownloadLfsObjects={jest.fn()}
        onOpenTemplatesRepoPicker={jest.fn()}
        onSyncExistingTemplates={jest.fn()}
        onClearTemplatesRepo={jest.fn()}
        onOpenRenderStyleSettings={jest.fn()}
        onClearData={jest.fn()}
        onResetOnboarding={jest.fn()}
        isPro={true}
        proStatusLabel="pro.statusActive"
        onOpenPaywall={jest.fn()}
        onManageTemplates={jest.fn()}
        onToggleAI={jest.fn()}
        onOpenModelSelector={jest.fn()}
        onToggleActionMode={jest.fn()}
        onOpenChatRepoPicker={jest.fn()}
        onProviderPress={jest.fn()}
        onAddProvider={jest.fn()}
        isBiometricLockEnabled={false}
        isBiometricAvailable={true}
        biometricKind={null}
        biometricLabel=""
        lockTimeout={300000}
        onToggleBiometricLock={jest.fn()}
        onSetLockTimeout={jest.fn()}
        isBackgroundSyncEnabled={false}
        onToggleBackgroundSync={jest.fn()}
        syncFrequentlyEnabled={false}
        syncIntervalSeconds={60}
        onToggleSyncFrequently={jest.fn()}
        onSetSyncIntervalSeconds={jest.fn()}
      />,
    );

    expect(queryByTestId('settings.button.reset-ai-memory')).toBeNull();
  });
});

describe('i18n keys for Reset AI Memory', () => {
  it('all 6 locales have resetAIMemory keys', async () => {
    const locales = ['en', 'es', 'fr', 'de', 'ja', 'ko'];
    for (const locale of locales) {
      const json = require(`../src/i18n/${locale}.json`);
      expect(json.settings.resetAIMemory).toBeDefined();
      expect(json.settings.resetAIMemoryConfirm).toBeDefined();
      expect(json.settings.resetAIMemoryMessage).toBeDefined();
      expect(json.settings.resetAIMemorySuccess).toBeDefined();
    }
  });
});
