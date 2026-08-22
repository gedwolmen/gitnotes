import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import type { AlertButton } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import SettingsScreen from '../../src/screens/SettingsScreen';
import { RepoAccessPreflightError } from '../../src/services/git/repoAccessPreflight';
import { GitHubService } from '../../src/services/GitHubService';
import { GitFsService } from '../../src/services/git/GitFsService';

const mockNavigate = jest.fn();

let mockTheme: 'light' | 'dark' | 'system' = 'light';
let mockUiStyle: 'flat' | 'neumorphic' = 'flat';
const mockSetTheme = jest.fn();
const mockSetStyle = jest.fn();

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

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock('@react-navigation/native-stack', () => ({}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0.0' },
  manifest: { version: '1.0.0' },
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

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

jest.mock('../../src/contexts/ThemeContext', () => ({
  useTheme: () => ({
    colors: stableColors,
    theme: mockTheme,
    setTheme: mockSetTheme,
    style: mockUiStyle,
    setStyle: mockSetStyle,
    isDark: false,
  }),
  useTokens: () => ({
    colors: stableColors,
    spacing: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 },
    type: { xs: 12, sm: 14, md: 16, lg: 18, xl: 22, '2xl': 28 },
    radii: { sm: 12, md: 18, lg: 24, pill: 999 },
    style: 'flat',
  }),
}));

const mockAccountSummaries: any[] = [];
const mockDisconnectHost = jest.fn(async () => undefined);
const mockRemoveAccount = jest.fn(async () => undefined);
const mockClearToken = jest.fn(async () => undefined);

jest.mock('../../src/contexts/AuthContext', () => {
  const fn = () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    accountSummaries: mockAccountSummaries,
    setToken: jest.fn(async () => true),
    clearToken: mockClearToken,
    addAccount: jest.fn(async () => null),
    removeAccount: mockRemoveAccount,
    switchAccount: jest.fn(async () => undefined),
    switchToHost: jest.fn(async () => true),
    disconnectHost: mockDisconnectHost,
    connectHost: jest.fn(async () => ({ ok: true })),
  });
  return {
    useAuth: fn,
    useAccounts: fn,
    AccountsProvider: ({ children }: any) => children,
  };
});

jest.mock('../../src/contexts/AccountsContext', () => {
  const fn = () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    accountSummaries: [],
    setToken: jest.fn(async () => true),
    clearToken: jest.fn(async () => undefined),
    addAccount: jest.fn(async () => null),
    removeAccount: jest.fn(async () => undefined),
    switchAccount: jest.fn(async () => undefined),
    switchToHost: jest.fn(async () => true),
    disconnectHost: jest.fn(async () => undefined),
    connectHost: jest.fn(async () => ({ ok: true })),
  });
  return {
    useAuth: fn,
    useAccounts: fn,
    AccountsProvider: ({ children }: any) => children,
  };
});

const stableRepositories: any[] = [];
const mockAddRepository = jest.fn<(
  path: string,
  options?: unknown,
  provider?: unknown,
  retryOptions?: unknown,
) => Promise<{ id: string; name: string; path: string }>>();
jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({ repositories: stableRepositories, addRepository: mockAddRepository, removeRepository: jest.fn() }),
}));

jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    clearAllNotes: jest.fn(async () => true),
    refreshNotes: jest.fn(async () => undefined),
    createNote: jest.fn(async () => null),
    updateNote: jest.fn(async () => null),
    getNoteById: jest.fn(() => undefined),
  }),
}));

jest.mock('../../src/contexts/TodoContext', () => ({
  useTodos: () => ({
    todos: [],
    refreshTodos: jest.fn(async () => undefined),
  }),
}));

jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: [],
    refreshCanvases: jest.fn(async () => undefined),
  }),
}));

jest.mock('../../src/hooks/useResponsive', () => ({
  useResponsive: () => ({ isTablet: false, maxContentWidth: 0 }),
}));

jest.mock('../../src/utils/haptics', () => ({
  HapticService: {
    light: jest.fn(),
    medium: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    selection: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/services/GitHubService', () => ({
  GitHubService: {
    setToken: jest.fn(),
    isAuthenticated: jest.fn(() => false),
    getRepositories: jest.fn(async () => []),
  },
}));

jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: jest.fn(async () => ({ notes: 0, canvases: 0, todos: 0 })),
  pullAllFromRepos: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/RepoFileSyncService', () => ({
  RepoFileSyncService: { syncRepoFiles: jest.fn(async () => ({ created: 0, skipped: 0, total: 0, errors: [] })) },
}));

jest.mock('../../src/services/TemplateRepoPreferenceService', () => ({
  TemplateRepoPreferenceService: {
    get: jest.fn(async () => null),
    set: jest.fn(async () => undefined),
    clear: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/TemplateGitHubSyncService', () => ({
  syncTemplateToGitHub: jest.fn(async () => ({ success: true })),
}));

jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: jest.fn(async () => 'api' as const),
    setMode: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/git/GitFsService', () => ({
  GitFsService: {
    isCloned: jest.fn(async () => false),
    clone: jest.fn(async () => undefined),
    removeRepo: jest.fn(async () => undefined),
  },
}));

jest.mock('../../src/services/git/CloneMigrationService', () => ({
  CloneMigrationService: { migrateRepo: jest.fn(async () => ({ notes: 0, todos: 0, canvases: 0, templates: 0, failures: [] })) },
}));

const mockCancelInflightGitHttp = jest.fn();
jest.mock('../../src/services/git/gitHttp', () => ({
  cancelInflightGitHttp: (...args: unknown[]) => mockCancelInflightGitHttp(...args),
}));

jest.mock('../../src/services/AuthService', () => ({
  AuthService: { getToken: jest.fn(async () => null) },
}));

jest.mock('../../src/services/OnboardingService', () => ({
  OnboardingService: { resetOnboarding: jest.fn(async () => undefined) },
}));

jest.mock('../../src/stores/templateStore', () => ({
  useTemplateStore: () => ({ customTemplates: [] }),
}));

const mockAIStore = {
  isEnabled: false,
  selectedModelId: null,
  actionMode: 'auto' as const,
  chatRepoOwner: null,
  chatRepoName: null,
  providers: [] as any[],
  toggleAI: jest.fn(),
  setActionMode: jest.fn(),
  updateProvider: jest.fn(),
  getState: () => mockAIStore,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => {
    if (selector) return selector(mockAIStore);
    return mockAIStore;
  },
}));

const mockRemoveRepositoriesForHosts = jest.fn(async () => 0);
jest.mock('../../src/stores/repoStore', () => ({
  useRepoStore: {
    getState: () => ({
      removeRepositoriesForHosts: mockRemoveRepositoriesForHosts,
    }),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: any) => children,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/contexts/BiometricLockContext', () => ({
  useBiometricLock: () => ({
    isLockEnabled: false,
    isBiometricAvailable: true,
    biometricKind: 'fingerprint',
    biometricLabel: 'Touch ID',
    lockTimeout: 300_000,
    setIsLockEnabled: jest.fn(async () => true),
    setLockTimeout: jest.fn(async () => undefined),
    isLocked: false,
    authenticate: jest.fn(async () => true),
  }),
  TIMEOUT_OPTIONS: [
    { label: '1 minute', value: 60_000 },
    { label: '5 minutes', value: 300_000 },
    { label: '15 minutes', value: 900_000 },
    { label: '30 minutes', value: 1_800_000 },
  ],
}));

jest.mock('../../src/components/ui', () => {
  const React = require('react');
  const { View, Text, Pressable } = require('react-native');
  return {
    ScreenHeader: ({ title }: { title: string }) => (
      <Text testID="screen-header">{title}</Text>
    ),
    useScreenHeaderHeight: () => 60,
    SCREEN_HEADER_BASE_HEIGHT: 60,
    SCREEN_HEADER_SUBTITLE_HEIGHT: 88,
    useTabBarHeight: () => 84,
    TAB_BAR_BASE_HEIGHT: 84,
    Group: ({ title, children }: any) => (
      <View testID={`group-${title}`}>
        <Text testID="group-title">{title}</Text>
        {children}
      </View>
    ),
    GroupRow: ({ children, trailing, onPress, testID }: any) => (
      <Pressable testID={testID || 'group-row'} onPress={onPress}>
        {children}
        {trailing}
      </Pressable>
    ),
    Toggle: ({ value, onValueChange, testID }: any) => (
      <Pressable testID={testID || 'toggle'} onPress={() => onValueChange(!value)}>
        <Text>{value ? 'On' : 'Off'}</Text>
      </Pressable>
    ),
    Button: ({ label, onPress }: any) => (
      <Pressable testID={`button-${label}`} onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    ),
    IconButton: ({ onPress, accessibilityLabel }: any) => (
      <Pressable testID={`icon-btn-${accessibilityLabel}`} onPress={onPress}>
        <Text>{accessibilityLabel}</Text>
      </Pressable>
    ),
    Chip: ({ label, children }: any) => (
      <View testID={`chip-${label ?? ''}`}>
        {label !== undefined ? <Text>{label}</Text> : null}
        {children}
      </View>
    ),
    Modal: ({ visible, children }: any) => (visible ? <View testID="modal">{children}</View> : null),
  };
});

jest.mock('../../src/components/ai/ModelSelector', () => ({
  ModelSelector: () => null,
}));

jest.mock('../../src/components/ai/ProviderConfigModal', () => ({
  ProviderConfigModal: () => null,
}));

jest.mock('../../src/components/ai/ChatRepoPickerModal', () => ({
  ChatRepoPickerModal: () => null,
}));

jest.mock('../../src/components/settings/SettingsModals', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    SettingsModals: ({ onAddManualRepo, onSetManualRepoInput, onSelectGithubRepo }: any) => (
      <View>
        <TextInput testID="test-manual-repo-input" onChangeText={onSetManualRepoInput} />
        <Pressable testID="test-add-manual-repo" onPress={onAddManualRepo}>
          <Text>Add manual repository</Text>
        </Pressable>
        <Pressable
          testID="test-select-github-repo"
          onPress={() =>
            onSelectGithubRepo?.({
              id: 1,
              name: 'target',
              full_name: 'owner/target',
              owner: { login: 'owner' },
              html_url: 'https://github.com/owner/target',
              description: '',
              private: false,
            })
          }
        >
          <Text>Select github repo</Text>
        </Pressable>
      </View>
    ),
  };
});

jest.mock('../../src/components/settings/settingsStyles', () => {
  const { StyleSheet } = require('react-native');
  return {
    settingsStyles: StyleSheet.create({
      container: { flex: 1 },
      scrollContent: { flex: 1 },
      section: { marginTop: 20, paddingHorizontal: 16, borderRadius: 12, marginHorizontal: 16 },
      sectionTitle: { fontSize: 12, fontWeight: '600' },
      settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 },
      settingLabel: { fontSize: 16 },
      settingValue: { fontSize: 15 },
      settingLeft: { flexDirection: 'row', alignItems: 'center' },
      authUserRow: { flexDirection: 'row', alignItems: 'center' },
      avatar: { width: 40, height: 40, borderRadius: 20 },
      addRepoButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
      addRepoButtonText: { fontSize: 15 },
      disabledButton: { opacity: 0.4 },
      emptyRepos: { paddingVertical: 24, alignItems: 'center' },
      emptyReposText: { fontSize: 15 },
      credits: { fontSize: 14, textAlign: 'center', paddingVertical: 24 },
      bottomPad: { height: 40 },
      repoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14 },
      repoInfo: { flex: 1 },
      repoName: { fontSize: 15, fontWeight: '500' },
      repoPath: { fontSize: 13 },
      syncButton: { paddingHorizontal: 8 },
      syncSpinner: { paddingHorizontal: 8 },
      removeButton: { paddingHorizontal: 8 },
    }),
  };
});

jest.mock('../../src/components/SearchBar', () => {
  const { TextInput } = require('react-native');
  return ({ value, onChangeText }: any) => (
    <TextInput testID="search-bar" value={value} onChangeText={onChangeText} />
  );
});

const cloneRepo = { id: 'github:1', name: 'notes', path: 'octo/notes', branch: 'main' };

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 20; i++) {
      await Promise.resolve();
    }
  });
}

describe('SettingsScreen', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  const openUrlSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

  beforeEach(() => {
    mockTheme = 'light';
    mockUiStyle = 'flat';
    mockNavigate.mockClear();
    mockSetTheme.mockClear();
    mockSetStyle.mockClear();
    mockAddRepository.mockReset();
    alertSpy.mockClear();
    openUrlSpy.mockClear();
    stableRepositories.length = 0;
    mockAccountSummaries.length = 0;
    mockDisconnectHost.mockReset();
    mockRemoveAccount.mockReset();
    mockClearToken.mockReset();
    mockRemoveRepositoriesForHosts.mockReset();
    mockCancelInflightGitHttp.mockReset();
    jest.useRealTimers();
    (GitHubService.isAuthenticated as jest.Mock).mockReset().mockReturnValue(false);
    (GitFsService.clone as jest.Mock).mockReset().mockResolvedValue(undefined);
    (GitFsService.isCloned as jest.Mock).mockReset().mockResolvedValue(false);
    (GitFsService.removeRepo as jest.Mock).mockReset().mockResolvedValue(undefined);
  });

  it('renders without crashing', () => {
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('screen-header')).toBeTruthy();
  });

  it('shows the Settings header title', () => {
    const { getByTestId } = render(<SettingsScreen />);
    expect(getByTestId('screen-header').props.children).toBe('Settings');
  });

  it('shows Appearance section with theme settings', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Appearance')).toBeTruthy();
    expect(getByText('Dark Mode')).toBeTruthy();
  });

  it('shows About section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('About')).toBeTruthy();
    expect(getByText('Version')).toBeTruthy();
  });

  it('opens GitHub issues when the report-issue row is pressed', () => {
    const { getByTestId, getByText } = render(<SettingsScreen />);
    expect(getByText('Report bugs and feature requests')).toBeTruthy();
    fireEvent.press(getByTestId('settings.row.report-issue'));
    expect(openUrlSpy).toHaveBeenCalledWith('https://github.com/gedwolmen/gitnotes/issues');
  });

  it('shows Accounts entry pointing to Connect host when unauthenticated', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Accounts')).toBeTruthy();
    expect(getByText('Connect host')).toBeTruthy();
  });

  it('shows Fancy UI toggle', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Fancy UI')).toBeTruthy();
  });

  it('shows Repositories section', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Repositories')).toBeTruthy();
    expect(getByText('Add Repository')).toBeTruthy();
  });

  it('shows Data section with clear notes option', () => {
    const { getByText } = render(<SettingsScreen />);
    expect(getByText('Data')).toBeTruthy();
    expect(getByText('Clear All Notes')).toBeTruthy();
  });

  it('confirms and retries when write access is unverified', async () => {
    mockAddRepository
      .mockRejectedValueOnce(new RepoAccessPreflightError({
        kind: 'write_unverified',
        message: 'Write access not verified. Do you want to add anyway?',
      }, true))
      .mockResolvedValueOnce({ id: 'github:1', name: 'notes', path: 'octo/notes' });
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.changeText(getByTestId('test-manual-repo-input'), 'octo/notes');
    fireEvent.press(getByTestId('test-add-manual-repo'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Write access not verified',
      'Write access not verified. This repository may be read-only. Add anyway?',
      expect.any(Array),
    ));
    const confirmationButtons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2];
    await act(async () => {
      confirmationButtons?.find((button: AlertButton) => button.text === 'Add anyway')?.onPress?.();
    });

    await waitFor(() => expect(mockAddRepository).toHaveBeenLastCalledWith(
      'octo/notes',
      { allowUnverifiedWrite: true },
    ));
  });

  it('does not retry when unverified write confirmation is cancelled', async () => {
    mockAddRepository.mockRejectedValueOnce(new RepoAccessPreflightError({
      kind: 'write_unverified',
      message: 'Write access not verified. Do you want to add anyway?',
    }, true));
    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.changeText(getByTestId('test-manual-repo-input'), 'octo/notes');
    fireEvent.press(getByTestId('test-add-manual-repo'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const confirmationButtons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1]?.[2];
    confirmationButtons?.find((button: AlertButton) => button.text === 'Cancel')?.onPress?.();
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
  });

  it('clears the clone modal after a successful clone', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    let resolveClone: (() => void) | undefined;
    (GitFsService.clone as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => { resolveClone = resolve; }),
    );
    stableRepositories.push(cloneRepo);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('settings.toggle.sync-engine-enable-octo-notes'));

    // Clone is in flight → the progress modal is up (previously it never closed).
    expect(getByTestId('modal')).toBeTruthy();

    // Let the isCloned→clone chain land so resolveClone is captured.
    await flushMicrotasks();
    expect(resolveClone).toBeDefined();

    await act(async () => {
      resolveClone?.();
      for (let i = 0; i < 20; i++) {
        await Promise.resolve();
      }
    });

    // Success clears cloneProgress → modal closes and the success alert shows.
    await waitFor(() => expect(queryByTestId('modal')).toBeNull());
    expect(alertSpy).toHaveBeenCalledWith(
      'Clone mode enabled',
      expect.stringContaining('now syncs through a local working tree'),
      expect.any(Array),
    );
  });

  it('force-closes the clone modal after the grace period when cancel never reaches the git op', async () => {
    jest.useFakeTimers();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitFsService.clone as jest.Mock).mockImplementation(() => new Promise<void>(() => {}));
    stableRepositories.push(cloneRepo);

    const { getByTestId, getByText, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('settings.toggle.sync-engine-enable-octo-notes'));
    expect(getByTestId('modal')).toBeTruthy();

    fireEvent.press(getByTestId('button-Cancel'));
    expect(getByTestId('modal')).toBeTruthy();
    expect(getByText(/Cancelling/)).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(799);
    });
    expect(getByTestId('modal')).toBeTruthy();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(queryByTestId('modal')).toBeNull();
  });

  it('renders the Clone failed modal with the error on failure', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitFsService.clone as jest.Mock).mockRejectedValue(new Error('Bad credentials'));
    stableRepositories.push(cloneRepo);

    const { getByTestId, getByText } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('settings.toggle.sync-engine-enable-octo-notes'));

    await waitFor(() => expect(getByTestId('modal')).toBeTruthy());
    expect(getByText('Clone Failed')).toBeTruthy();
    expect(getByText(/Bad credentials/)).toBeTruthy();
    expect(GitFsService.clone).toHaveBeenCalledTimes(1);
  });

  it('aborts the in-flight git HTTP request when clone cancel is pressed (#1016)', async () => {
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    (GitFsService.clone as jest.Mock).mockImplementation(() => new Promise<void>(() => {}));
    stableRepositories.push(cloneRepo);

    const { getByTestId, getByText } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('settings.toggle.sync-engine-enable-octo-notes'));
    expect(getByTestId('modal')).toBeTruthy();

    mockCancelInflightGitHttp.mockReturnValue(true);
    fireEvent.press(getByTestId('button-Cancel'));

    expect(mockCancelInflightGitHttp).toHaveBeenCalledTimes(1);
    expect(getByText(/Cancelling/)).toBeTruthy();
  });

  it('caps the automatic outer retry at one for a persistently corrupt packfile', async () => {
    jest.useFakeTimers();
    (GitHubService.isAuthenticated as jest.Mock).mockReturnValue(true);
    const cloneMock = GitFsService.clone as jest.Mock;
    cloneMock.mockRejectedValue(new Error('Packfile trailer mismatch'));
    stableRepositories.push(cloneRepo);

    const { getByTestId, getByText } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('settings.toggle.sync-engine-enable-octo-notes'));

    await flushMicrotasks();
    expect(cloneMock).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    await flushMicrotasks();
    expect(cloneMock).toHaveBeenCalledTimes(2);

    act(() => {
      jest.advanceTimersByTime(5000);
    });
    await flushMicrotasks();
    expect(cloneMock).toHaveBeenCalledTimes(2);

    // Cap reached → no endless loop; the failure modal still renders Clone Failed + error.
    expect(getByTestId('modal')).toBeTruthy();
    expect(getByText('Clone Failed')).toBeTruthy();
    expect(getByText(/Packfile trailer mismatch/)).toBeTruthy();
  });

  it('warns about cascaded repos and removes them when a host is disconnected', async () => {
    mockAccountSummaries.push({
      account: { id: 'acc-1', login: 'octocat', name: 'Octo Cat', avatarUrl: '' },
      hosts: [
        { id: 'host-1', provider: 'github', hostLogin: 'octocat', instanceBaseUrl: null },
      ],
      activeHostId: 'host-1',
    });
    stableRepositories.push({
      id: 'github:1',
      name: 'notes',
      path: 'octo/notes',
      provider: 'github',
      hostId: 'host-1',
    });

    const { getByTestId } = render(<SettingsScreen />);
    fireEvent.press(getByTestId('settings.button.disconnect-host.host-1'));

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
    const body = lastCall?.[1] as string;
    expect(body).toContain('This will also remove 1 synced repo(s) from this device.');

    const buttons = lastCall?.[2] as AlertButton[] | undefined;
    const disconnectButton = buttons?.find((b) => b.text === 'Disconnect');
    await act(async () => {
      await disconnectButton?.onPress?.();
    });

    expect(mockDisconnectHost).toHaveBeenCalledWith('host-1');
    expect(mockRemoveRepositoriesForHosts).toHaveBeenCalledTimes(1);
    const [removedHosts, counts] = mockRemoveRepositoriesForHosts.mock.calls[0];
    expect(removedHosts).toEqual([{ id: 'host-1', provider: 'github' }]);
    expect(counts.get('github')).toBe(1);
  });

  it('ignores rapid re-taps on the same github row while an add is in flight (#936)', async () => {
    stableRepositories.length = 0;
    const pending = new Promise<never>(() => {});
    mockAddRepository.mockReturnValue(pending);

    const { getByTestId } = render(<SettingsScreen />);

    fireEvent.press(getByTestId('test-select-github-repo'));
    fireEvent.press(getByTestId('test-select-github-repo'));
    fireEvent.press(getByTestId('test-select-github-repo'));

    await flushMicrotasks();
    await waitFor(() => expect(mockAddRepository).toHaveBeenCalledTimes(1));
  });
});
