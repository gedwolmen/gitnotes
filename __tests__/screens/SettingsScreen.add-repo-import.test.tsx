/**
 * Todo 12 (#938 UI): SettingsScreen must AWAIT the add-time repo content
 * import (`importRepoAtAdd`) instead of fire-and-forget `autoSyncAfterAdd`.
 *
 * Contract pinned here:
 *   - BUG BASELINE: documents the pre-fix fire-and-forget behavior (picker
 *     closed + busy state dropped while the pull was still in flight).
 *   - importRepoAtAdd is awaited: isAddingRepo + progress modal persist until
 *     the import settles.
 *   - Repo picker closes only AFTER the import completes.
 *   - Retryable failure → Alert with Retry that re-runs importRepoAtAdd.
 *   - Non-retryable failure → info Alert (no Retry).
 *   - Cancel keeps the repo added, closes picker + progress modal, no error
 *     alert.
 *
 * The REAL RepoImportService runs; its dependencies (GitFsService,
 * RepoPullService, SyncEngineService, StorageService, AuthService) are mocked.
 */
import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { AlertButton } from 'react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import SettingsScreen from '../../src/screens/SettingsScreen';
import { GitHubService } from '../../src/services/GitHubService';
import { GitFsService } from '../../src/services/git/GitFsService';
import { __resetImportDedupForTest } from '../../src/services/RepoImportService';

const mockNavigate = jest.fn();

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
    theme: 'light',
    setTheme: jest.fn(),
    style: 'flat',
    setStyle: jest.fn(),
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

jest.mock('../../src/contexts/AuthContext', () => ({
  useAuth: () => ({
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
  }),
}));

jest.mock('../../src/contexts/AccountsContext', () => ({
  useAuth: () => ({
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
  }),
  useAccounts: () => ({
    authState: { isAuthenticated: false, token: null },
    accounts: [],
    activeAccountId: null,
    accountSummaries: [],
  }),
  AccountsProvider: ({ children }: any) => children,
}));

const stableRepositories: any[] = [];
const mockAddRepository = jest.fn();
const mockRemoveRepository = jest.fn(async () => undefined);
jest.mock('../../src/contexts/RepoContext', () => ({
  useRepos: () => ({
    repositories: stableRepositories,
    addRepository: mockAddRepository,
    removeRepository: mockRemoveRepository,
  }),
}));

const mockRefreshNotes = jest.fn(async () => undefined);
jest.mock('../../src/contexts/NoteContext', () => ({
  useNotes: () => ({
    notes: [],
    clearAllNotes: jest.fn(async () => true),
    refreshNotes: mockRefreshNotes,
    createNote: jest.fn(async () => null),
    updateNote: jest.fn(async () => null),
    getNoteById: jest.fn(() => undefined),
  }),
}));

const mockRefreshTodos = jest.fn(async () => undefined);
jest.mock('../../src/contexts/TodoContext', () => ({
  useTodos: () => ({
    todos: [],
    refreshTodos: mockRefreshTodos,
  }),
}));

const mockRefreshCanvases = jest.fn(async () => undefined);
jest.mock('../../src/contexts/CanvasContext', () => ({
  useCanvases: () => ({
    canvases: [],
    refreshCanvases: mockRefreshCanvases,
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
    getRepositorySize: jest.fn(async () => null),
  },
}));

const mockPullFromSingleRepo = jest.fn();
jest.mock('../../src/services/RepoPullService', () => ({
  pullFromSingleRepo: (...args: unknown[]) => mockPullFromSingleRepo(...args),
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

const mockGetMode = jest.fn();
jest.mock('../../src/services/SyncEngineService', () => ({
  SyncEngineService: {
    getMode: (...args: unknown[]) => mockGetMode(...args),
    setMode: jest.fn(async () => undefined),
  },
}));

const mockGetSavedRepositories = jest.fn();
jest.mock('../../src/services/StorageService', () => ({
  StorageService: {
    getSavedRepositories: (...args: unknown[]) => mockGetSavedRepositories(...args),
  },
}));

jest.mock('../../src/services/AuthService', () => {
  const authMock = { getToken: jest.fn(async () => null) };
  return { __esModule: true, AuthService: authMock, default: authMock };
});

jest.mock('../../src/services/git/GitFsService', () => ({
  repairHeadRef: jest.fn(async () => undefined),
   GitFsService: {
     isCloned: jest.fn(async () => false),
     clone: jest.fn(async () => undefined),
     cloneExclusive: jest.fn(async () => undefined),
     getCommitOid: jest.fn(async () => 'abc123def456'),
     getCurrentBranch: jest.fn(async () => null),
     removeRepo: jest.fn(async () => undefined),
     workingTreeUri: jest.fn(() => 'file:///tmp/repo'),
   },
   CloneOutOfMemoryError: class CloneOutOfMemoryError extends Error {
     constructor(message: string) {
       super(message);
       this.name = 'CloneOutOfMemoryError';
     }
   },
 }));

jest.mock('../../src/services/git/CloneMigrationService', () => ({
  CloneMigrationService: { migrateRepo: jest.fn(async () => ({ notes: 0, todos: 0, canvases: 0, templates: 0, failures: [] })) },
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
  toggleDailyQuote: jest.fn(),
  toggleAiPersonalization: jest.fn(),
  toggleGithubTools: jest.fn(),
  dailyQuoteEnabled: false,
  aiPersonalizationEnabled: false,
  githubToolsEnabled: false,
  getState: () => mockAIStore,
};

jest.mock('../../src/stores/aiStore', () => ({
  useAIStore: (selector: any) => {
    if (selector) return selector(mockAIStore);
    return mockAIStore;
  },
}));

jest.mock('../../src/stores/repoStore', () => ({
  useRepoStore: {
    getState: () => ({
      removeRepositoriesForHosts: jest.fn(async () => 0),
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
  TIMEOUT_OPTIONS: [],
}));

jest.mock('../../src/components/ui', () => {
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
    GroupRow: ({ children, trailing, onPress }: any) => (
      <Pressable testID="group-row" onPress={onPress}>
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

jest.mock('../../src/components/ConnectHostModal', () => ({
  ConnectHostModal: () => null,
}));

jest.mock('../../src/components/settings/SettingsContent', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    SettingsContent: ({ onOpenRepoPicker }: any) => (
      <View testID="test-settings-content">
        <Pressable testID="test-open-repo-picker" onPress={() => void onOpenRepoPicker()}>
          <Text>Open repo picker</Text>
        </Pressable>
      </View>
    ),
  };
});

// Test surface for the picker: exposes visibility + busy props as nodes so
// timing assertions can observe them directly. The clone progress now renders
// INLINE inside the picker modal (iOS cannot stack a second native Modal on
// top of the picker — "Attempt to present ... which is already presenting"),
// so the mock mirrors that: progress nodes appear when cloneProgress is set.
jest.mock('../../src/components/settings/SettingsModals', () => {
  const { Pressable, Text, TextInput, View } = require('react-native');
  return {
    SettingsModals: (props: any) => (
      <View testID="test-settings-modals">
        {props.showRepoPickerModal ? <View testID="test-repo-picker-modal" /> : null}
        <Text testID="test-adding-state">{props.isAddingRepoPath !== null ? 'adding' : 'idle'}</Text>
        <TextInput testID="test-manual-repo-input" onChangeText={props.onSetManualRepoInput} />
        <Pressable testID="test-add-manual-repo" onPress={props.onAddManualRepo}>
          <Text>Add manual repository</Text>
        </Pressable>
        <Pressable
          testID="test-select-github-repo"
          onPress={() =>
            props.onSelectGithubRepo({
              id: 1,
              name: 'notes',
              full_name: 'octo/notes',
              owner: { login: 'octo' },
              html_url: 'https://github.com/octo/notes',
              description: '',
              private: false,
            })
          }>
          <Text>Select github repo</Text>
        </Pressable>
        {props.cloneProgress ? (
          <View testID="test-progress-modal">
            <Text testID="test-progress-phase">{props.cloneProgress.phase}</Text>
            {props.cloneProgress.error ? (
              <Text testID="test-progress-error">{props.cloneProgress.error}</Text>
            ) : null}
            <Pressable testID="test-progress-cancel" onPress={props.onCancelClone}>
              <Text>Cancel</Text>
            </Pressable>
            <Pressable testID="test-progress-retry" onPress={props.onRetryClone}>
              <Text>Retry</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    ),
  };
});

jest.mock('../../src/components/settings/CloneProgressModal', () => {
  const { Pressable, Text, View } = require('react-native');
  return {
    CloneProgressModal: ({ progress, onCancel, onRetry }: any) =>
      progress ? (
        <View testID="test-progress-modal">
          <Text testID="test-progress-phase">{progress.phase}</Text>
          {progress.error ? <Text testID="test-progress-error">{progress.error}</Text> : null}
          <Pressable testID="test-progress-cancel" onPress={onCancel}>
            <Text>Cancel</Text>
          </Pressable>
          <Pressable testID="test-progress-retry" onPress={onRetry}>
            <Text>Retry</Text>
          </Pressable>
        </View>
      ) : null,
  };
});

const IMPORTED_COUNTS = { repos: 1, notes: 2, canvases: 0, todos: 1, templates: 0 };
const EMPTY_COUNTS = { repos: 1, notes: 0, canvases: 0, todos: 0, templates: 0 };

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flushMicrotasks(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
    }
  });
}

function lastAlertButtons(): AlertButton[] {
  const alertSpy = Alert.alert as unknown as jest.Mock;
  const lastCall = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  return (lastCall?.[2] as AlertButton[] | undefined) ?? [];
}

describe('SettingsScreen add-repo import (#938, todo 12)', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.useRealTimers();
    __resetImportDedupForTest();
    alertSpy.mockClear();
    mockNavigate.mockClear();
    mockAddRepository.mockReset().mockResolvedValue({ id: 'github:1', name: 'notes', path: 'octo/notes' });
    mockRemoveRepository.mockClear();
    mockRefreshNotes.mockClear();
    mockRefreshCanvases.mockClear();
    mockRefreshTodos.mockClear();
    mockPullFromSingleRepo.mockReset().mockResolvedValue(IMPORTED_COUNTS);
    mockGetMode.mockReset().mockResolvedValue('api');
    mockGetSavedRepositories
      .mockReset()
      .mockResolvedValue([{ id: 'github:1', name: 'notes', path: 'octo/notes', branch: 'main' }]);
    stableRepositories.length = 0;
    (GitHubService.isAuthenticated as jest.Mock).mockReset().mockReturnValue(true);
    (GitFsService.isCloned as jest.Mock).mockReset().mockResolvedValue(false);
    (GitFsService.clone as jest.Mock).mockReset().mockResolvedValue(undefined);
    (GitFsService.cloneExclusive as jest.Mock).mockReset().mockResolvedValue(undefined);
    (GitFsService.getCommitOid as jest.Mock).mockReset().mockResolvedValue('abc123def456');
    (GitFsService.removeRepo as jest.Mock).mockClear();
  });

  /**
   * BUG BASELINE (#938). PRE-FIX CONTRACT (unmodified code): the manual add
   * handler fired `autoSyncAfterAdd(...)` WITHOUT awaiting it — the picker
   * closed and isAddingRepo went false while the pull was still in flight.
   * This exact scenario in its pre-fix assertion form (picker closed + idle
   * busy state while the pull was pending, fire-and-forget pull called once)
   * passed on the unmodified code: .omo/evidence/fix-sync/12-baseline-pre.log
   *
   * The assertions below are the INVERTED post-fix contract for the same
   * scenario: the import is awaited end-to-end.
   */
  it('BUG BASELINE flipped (#938): manual add now awaits the import — picker stays busy until the pull settles', async () => {
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    fireEvent.changeText(getByTestId('test-manual-repo-input'), 'octo/notes');
    await act(async () => {
      fireEvent.press(getByTestId('test-add-manual-repo'));
    });
    await flushMicrotasks();

    expect(mockAddRepository).toHaveBeenCalledWith('octo/notes');
    // Post-fix: the import is awaited — busy state and picker persist while
    // the pull is still pending (pre-fix: both dropped immediately and the
    // pull ran fire-and-forget).
    expect(getByTestId('test-adding-state').props.children).toBe('adding');
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();
    expect(mockPullFromSingleRepo).toHaveBeenCalledTimes(1);

    // Only after the pull settles does the picker close and busy state drop.
    await act(async () => {
      pull.resolve(IMPORTED_COUNTS);
    });
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    await waitFor(() => expect(getByTestId('test-adding-state').props.children).toBe('idle'));
    expect(mockPullFromSingleRepo).toHaveBeenCalledTimes(1);
    expect(mockRefreshNotes).toHaveBeenCalledTimes(1);
  });

  it('importRepoAtAdd is awaited — isAddingRepo stays true until import resolves', async () => {
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // addRepo already resolved but the import is still pending → still busy,
    // with visible progress driving the CloneProgressModal.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');
    expect(getByTestId('test-progress-modal')).toBeTruthy();

    await act(async () => {
      pull.resolve(IMPORTED_COUNTS);
    });
    await waitFor(() => expect(getByTestId('test-adding-state').props.children).toBe('idle'));
    expect(queryByTestId('test-progress-modal')).toBeNull();
    // The real RepoImportService ran the api-mode import through pullFromSingleRepo.
    expect(mockPullFromSingleRepo).toHaveBeenCalledWith('octo/notes', expect.any(Function));
  });

  it('repo picker closes only after import completes', async () => {
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // Import in flight → picker must stay open (pre-fix: closed immediately).
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();

    await act(async () => {
      pull.resolve(IMPORTED_COUNTS);
    });
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());

    // Contents imported → stores refreshed, no failure alerts.
    expect(mockRefreshNotes).toHaveBeenCalledTimes(1);
    expect(mockRefreshCanvases).toHaveBeenCalledTimes(1);
    expect(mockRefreshTodos).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalledWith('Auto-sync Failed', expect.anything(), expect.anything());
    expect(alertSpy).not.toHaveBeenCalledWith('Error', expect.anything(), expect.anything());
  });

  it('empty repo import still refreshes stores and closes the picker', async () => {
    mockPullFromSingleRepo.mockResolvedValue(EMPTY_COUNTS);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });

    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    expect(getByTestId('test-adding-state').props.children).toBe('idle');
    expect(mockRefreshNotes).toHaveBeenCalledTimes(1);
    expect(mockRefreshCanvases).toHaveBeenCalledTimes(1);
    expect(mockRefreshTodos).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('clone-mode zero-count import fires the warn (api mode does not)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPullFromSingleRepo.mockResolvedValue(EMPTY_COUNTS);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    mockGetMode.mockResolvedValue('clone' as any);
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    expect(warnSpy).toHaveBeenCalledWith(
      '[SettingsScreen] add-repo import pulled zero contents',
      expect.objectContaining({ repoPath: 'octo/notes', counts: EMPTY_COUNTS }),
    );
    warnSpy.mockRestore();

    // api mode (default beforeEach) must NOT fire the warn.
    const warnSpy2 = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockPullFromSingleRepo.mockResolvedValue(EMPTY_COUNTS);
    mockGetMode.mockResolvedValue('api' as any);
    const { getByTestId: g2, queryByTestId: q2 } = render(<SettingsScreen />);
    await flushMicrotasks();
    g2('test-open-repo-picker');
    await flushMicrotasks();
    await act(async () => {
      g2('test-select-github-repo');
    });
    await waitFor(() => expect(q2('test-repo-picker-modal')).toBeNull());
    expect(warnSpy2).not.toHaveBeenCalledWith(
      '[SettingsScreen] add-repo import pulled zero contents',
      expect.anything(),
      expect.anything(),
    );
    warnSpy2.mockRestore();
  });

  it('on import failure with retryable error, Retry button re-calls importRepoAtAdd', async () => {
    mockPullFromSingleRepo
      .mockRejectedValueOnce(new Error('network unreachable'))
      .mockResolvedValueOnce(IMPORTED_COUNTS);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    fireEvent.changeText(getByTestId('test-manual-repo-input'), 'octo/notes');
    await act(async () => {
      fireEvent.press(getByTestId('test-add-manual-repo'));
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Auto-sync Failed',
      expect.stringContaining('network unreachable'),
      expect.any(Array),
    ));
    expect(mockPullFromSingleRepo).toHaveBeenCalledTimes(1);
    // Failure keeps the picker open (repo added, import not done).
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();

    const retryButton = lastAlertButtons().find((button) => button.text === 'Retry');
    expect(retryButton).toBeTruthy();

    await act(async () => {
      await retryButton?.onPress?.();
    });
    await waitFor(() => expect(mockPullFromSingleRepo).toHaveBeenCalledTimes(2));
    // Retry succeeded → picker closes + stores refreshed.
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    expect(mockRefreshNotes).toHaveBeenCalledTimes(1);
  });

  it('on non-retryable import failure, shows an info alert without Retry and keeps the picker open', async () => {
    mockPullFromSingleRepo.mockRejectedValue(new Error('HTTP 404: Not Found'));

    const { getByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    fireEvent.changeText(getByTestId('test-manual-repo-input'), 'octo/notes');
    await act(async () => {
      fireEvent.press(getByTestId('test-add-manual-repo'));
    });

    await waitFor(() => expect(alertSpy).toHaveBeenCalledWith(
      'Auto-sync Failed',
      expect.stringContaining('HTTP 404'),
      expect.any(Array),
    ));
    const buttons = lastAlertButtons();
    expect(buttons.find((button) => button.text === 'Retry')).toBeUndefined();
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();
    expect(mockPullFromSingleRepo).toHaveBeenCalledTimes(1);
  });

  it('on cancel the repo stays added, modals close, and no error alert fires', async () => {
    jest.useFakeTimers();
    mockGetMode.mockResolvedValue('clone');
    let capturedOnProgress: ((phase: string, loaded: number, total: number | null) => void) | undefined;
    (GitFsService.cloneExclusive as jest.Mock).mockImplementation(({ onProgress }: any) => {
      return new Promise<void>((resolve, reject) => {
        capturedOnProgress = (phase, loaded, total) => {
          try {
            onProgress?.(phase, loaded, total);
          } catch (error) {
            reject(error);
          }
        };
      });
    });

    const { getByTestId, getByText, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // Clone-mode import in flight → progress modal visible.
    expect(getByTestId('test-progress-modal')).toBeTruthy();
    expect(capturedOnProgress).toBeDefined();

    // User cancels the import.
    await act(async () => {
      fireEvent.press(getByTestId('test-progress-cancel'));
    });
    expect(getByText('Cancelling')).toBeTruthy();

    // The in-flight clone observes the abort on its next progress event.
    await act(async () => {
      capturedOnProgress?.('receiving objects', 10, 100);
    });
    await flushMicrotasks();

    // Repo stays added (addRepo kept, no rollback), both modals close.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(mockRemoveRepository).not.toHaveBeenCalled();
    expect(GitFsService.removeRepo).not.toHaveBeenCalled();
    expect(queryByTestId('test-progress-modal')).toBeNull();
    expect(queryByTestId('test-repo-picker-modal')).toBeNull();
    // No error alert; the pull never ran.
    expect(alertSpy).not.toHaveBeenCalledWith('Auto-sync Failed', expect.anything(), expect.anything());
    expect(alertSpy).not.toHaveBeenCalledWith('Error', expect.anything(), expect.anything());
    expect(alertSpy).toHaveBeenCalledWith('Success', expect.anything(), expect.anything());
    expect(mockPullFromSingleRepo).not.toHaveBeenCalled();

    // Drain the cancel grace timer so nothing leaks past unmount.
    await act(async () => {
      jest.advanceTimersByTime(1000);
    });
  });
});

// ═══════════════════════════════════════════════
//  Todo 13 (#938/#936 overlap): double-tap guard
// ═══════════════════════════════════════════════

describe('SettingsScreen double-tap guard (#938, todo 13)', () => {
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

  beforeEach(() => {
    jest.useRealTimers();
    alertSpy.mockClear();
    mockAddRepository.mockReset().mockResolvedValue({ id: 'github:1', name: 'notes', path: 'octo/notes' });
    mockRemoveRepository.mockClear();
    mockRefreshNotes.mockClear();
    mockRefreshCanvases.mockClear();
    mockRefreshTodos.mockClear();
    mockPullFromSingleRepo.mockReset().mockResolvedValue(IMPORTED_COUNTS);
    mockGetMode.mockReset().mockResolvedValue('api');
    mockGetSavedRepositories
      .mockReset()
      .mockResolvedValue([{ id: 'github:1', name: 'notes', path: 'octo/notes', branch: 'main' }]);
    stableRepositories.length = 0;
    (GitHubService.isAuthenticated as jest.Mock).mockReset().mockReturnValue(true);
    (GitFsService.isCloned as jest.Mock).mockReset().mockResolvedValue(false);
    (GitFsService.clone as jest.Mock).mockReset().mockResolvedValue(undefined);
    (GitFsService.cloneExclusive as jest.Mock).mockReset().mockResolvedValue(undefined);
    (GitFsService.getCommitOid as jest.Mock).mockReset().mockResolvedValue('abc123def456');
  });

  /**
   * BUG BASELINE (#936). PRE-FIX CONTRACT (unmodified code): tapping a repo row
   * or hitting the manual-add button twice in quick succession would fire two
   * concurrent add flows — each calling `addRepo` and starting its own import.
   */
  it('BUG BASELINE flipped (#936): rapid double-tap on GitHub repo row fires addRepo exactly ONCE', async () => {
    // Keep the import in-flight so isAddingRepo stays true long enough for
    // a second tap to land before the early-return guard sees it change.
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();

    // First tap starts add → import; isAddingRepo → true.
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();

    // Second tap — attemptAdd sees isAddingRepo === true, returns early.
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // Still only one call — guard prevented the second.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();

    // Resolve to let test clean up.
    await act(async () => pull.resolve(IMPORTED_COUNTS));
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
  });

  it('attempting manual add during active import fires addRepo exactly ONCE', async () => {
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();

    // First tap adds via GitHub picker (the row-under-add pattern).
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');

    // Attempt another add action via manual text + press while import is in-flight.
    // Early-return guard on `isAddingRepo` blocks this completely.
    await act(async () => {
      fireEvent.changeText(getByTestId('test-manual-repo-input'), 'another/repo');
      await Promise.resolve();
      fireEvent.press(getByTestId('test-add-manual-repo'));
    });
    await flushMicrotasks();

    // Still exactly one call — manual-add guard prevented it.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');

    // Resolve & clean up.
    await act(async () => pull.resolve(IMPORTED_COUNTS));
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
  });

  it('delayed import: second tap blocked by early-return while import is in flight', async () => {
    // Use a deferred promise to keep isAddingRepo=true long enough for two taps.
    const pull = deferred<typeof IMPORTED_COUNTS>();
    mockPullFromSingleRepo.mockReturnValue(pull.promise);

    const { getByTestId, queryByTestId } = render(<SettingsScreen />);
    await flushMicrotasks();
    fireEvent.press(getByTestId('test-open-repo-picker'));
    await flushMicrotasks();

    // First tap starts all the async machinery.
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // Busy state visible, picker still open.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);
    expect(getByTestId('test-adding-state').props.children).toBe('adding');
    expect(getByTestId('test-repo-picker-modal')).toBeTruthy();

    // Second tap — early-return guard blocks it.
    await act(async () => {
      fireEvent.press(getByTestId('test-select-github-repo'));
    });
    await flushMicrotasks();

    // Exactly one addRepo still — not two.
    expect(mockAddRepository).toHaveBeenCalledTimes(1);

    // Now resolve the import.
    await act(async () => {
      pull.resolve(IMPORTED_COUNTS);
    });
    await waitFor(() => expect(queryByTestId('test-repo-picker-modal')).toBeNull());
  });
});
